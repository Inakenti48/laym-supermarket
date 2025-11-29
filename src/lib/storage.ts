// Гибридное хранение: Локально (IndexedDB) + Firebase
import { retryOperation } from './retryUtils';
import {
  getAllFirebaseProducts,
  findFirebaseProductByBarcode,
  saveFirebaseProduct as saveFirebaseProductBase,
  updateFirebaseProductQuantity,
  removeFirebaseExpiredProduct,
  getFirebaseExpiringProducts,
  searchFirebaseProducts
} from './firebaseProducts';
import { firebaseDb } from './firebase';
import { collection, query, where, getDocs, updateDoc, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { 
  getCancellationRequests as getFirebaseCancellations,
  createCancellationRequest as createFirebaseCancellation,
  updateCancellationRequest as updateFirebaseCancellation,
  CancellationRequest as FirebaseCancellationRequest,
  saveProductImageFirebase
} from './firebaseCollections';
import {
  initLocalDB,
  saveProductLocally,
  getAllLocalData
} from './localDatabase';

export interface StoredProduct {
  id: string;
  barcode: string;
  name: string;
  category: string;
  purchasePrice: number;
  retailPrice: number;
  quantity: number;
  unit: 'шт';
  expiryDate?: string;
  photos: string[];
  paymentType: 'full' | 'partial' | 'debt';
  paidAmount: number;
  debtAmount: number;
  addedBy: string;
  supplier?: string;
  lastUpdated: string;
  priceHistory: Array<{
    date: string;
    purchasePrice: number;
    retailPrice: number;
    changedBy: string;
  }>;
}

// Сохранение фото товара в Firebase (base64)
export const saveProductImage = async (
  barcode: string, 
  productName: string, 
  imageBase64: string,
  userId?: string
): Promise<boolean> => {
  return saveProductImageFirebase(barcode, productName, imageBase64);
};

// === ГИБРИДНЫЕ ФУНКЦИИ: ЛОКАЛЬНО + FIREBASE ===

// Инициализация локальной БД при старте
let localDbInitialized = false;
const ensureLocalDb = async () => {
  if (!localDbInitialized) {
    await initLocalDB();
    localDbInitialized = true;
  }
};

export const getStoredProducts = async (): Promise<StoredProduct[]> => {
  await ensureLocalDb();
  
  try {
    // Пробуем Firebase
    console.log('📦 Загрузка товаров из Firebase...');
    const products = await Promise.race([
      getAllFirebaseProducts(),
      new Promise<StoredProduct[]>((_, reject) => 
        setTimeout(() => reject(new Error('Firebase timeout')), 5000)
      )
    ]);
    
    // Сохраняем локально для офлайн доступа
    if (products.length > 0) {
      localStorage.setItem('cached_products', JSON.stringify(products));
      localStorage.setItem('cached_products_time', Date.now().toString());
    }
    
    return products;
  } catch (error) {
    console.warn('⚠️ Firebase недоступен, загружаем из кэша...');
    
    // Fallback на локальный кэш
    const cached = localStorage.getItem('cached_products');
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Fallback на IndexedDB
    const localData = await getAllLocalData();
    return localData.products as StoredProduct[];
  }
};

export const findProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  if (!barcode) return null;
  
  try {
    return await findFirebaseProductByBarcode(barcode);
  } catch (error) {
    console.warn('⚠️ Firebase недоступен, ищем локально...');
    
    // Fallback на локальный кэш
    const cached = localStorage.getItem('cached_products');
    if (cached) {
      const products: StoredProduct[] = JSON.parse(cached);
      return products.find(p => p.barcode === barcode) || null;
    }
    return null;
  }
};

export const saveProduct = async (
  product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>, 
  userId: string
): Promise<StoredProduct> => {
  await ensureLocalDb();
  
  // СНАЧАЛА сохраняем локально (IndexedDB + localStorage)
  const localId = await saveProductLocally(product);
  console.log('💾 Товар сохранен локально:', localId);
  
  // Обновляем локальный кэш
  const cached = localStorage.getItem('cached_products');
  const products: StoredProduct[] = cached ? JSON.parse(cached) : [];
  const newProduct: StoredProduct = {
    ...product,
    id: localId,
    lastUpdated: new Date().toISOString(),
    priceHistory: [{
      date: new Date().toISOString(),
      purchasePrice: product.purchasePrice,
      retailPrice: product.retailPrice,
      changedBy: userId
    }]
  };
  
  // Проверяем, есть ли уже товар с таким штрихкодом
  const existingIndex = products.findIndex(p => p.barcode === product.barcode);
  if (existingIndex >= 0) {
    products[existingIndex] = { ...products[existingIndex], ...newProduct, quantity: products[existingIndex].quantity + product.quantity };
  } else {
    products.push(newProduct);
  }
  localStorage.setItem('cached_products', JSON.stringify(products));
  
  // ПОТОМ пробуем синхронизировать с Firebase (в фоне)
  retryOperation(
    async () => {
      console.log('☁️ Синхронизация с Firebase...');
      return saveFirebaseProductBase(product, userId);
    },
    {
      maxAttempts: 5,
      initialDelay: 1000,
      onRetry: (attempt, error) => {
        console.log(`🔄 Повторная попытка синхронизации "${product.name}" (попытка ${attempt})...`);
      }
    }
  ).catch(err => {
    console.warn('⚠️ Не удалось синхронизировать с Firebase, данные сохранены локально:', err);
  });
  
  return newProduct;
};

export const getAllProducts = async (): Promise<StoredProduct[]> => {
  return getStoredProducts();
};

export const getExpiringProducts = async (daysBeforeExpiry: number = 3): Promise<StoredProduct[]> => {
  try {
    return await getFirebaseExpiringProducts(daysBeforeExpiry);
  } catch (error) {
    console.warn('⚠️ Firebase недоступен, проверяем локально...');
    const cached = localStorage.getItem('cached_products');
    if (cached) {
      const products: StoredProduct[] = JSON.parse(cached);
      const now = new Date();
      const limitDate = new Date(now.getTime() + daysBeforeExpiry * 24 * 60 * 60 * 1000);
      return products.filter(p => p.expiryDate && new Date(p.expiryDate) <= limitDate);
    }
    return [];
  }
};

export const isProductExpired = (product: StoredProduct): boolean => {
  if (!product.expiryDate) return false;
  const now = new Date();
  const expiryDate = new Date(product.expiryDate);
  return expiryDate < now;
};

export const updateProductQuantity = async (barcode: string, quantityChange: number): Promise<void> => {
  // Обновляем локальный кэш
  const cached = localStorage.getItem('cached_products');
  if (cached) {
    const products: StoredProduct[] = JSON.parse(cached);
    const index = products.findIndex(p => p.barcode === barcode);
    if (index >= 0) {
      products[index].quantity += quantityChange;
      localStorage.setItem('cached_products', JSON.stringify(products));
    }
  }
  
  // Синхронизируем с Firebase
  try {
    await updateFirebaseProductQuantity(barcode, quantityChange);
  } catch (error) {
    console.warn('⚠️ Не удалось синхронизировать количество с Firebase:', error);
  }
};

export const removeExpiredProduct = async (barcode: string): Promise<StoredProduct | null> => {
  // Удаляем из локального кэша
  const cached = localStorage.getItem('cached_products');
  let removedProduct: StoredProduct | null = null;
  
  if (cached) {
    const products: StoredProduct[] = JSON.parse(cached);
    const index = products.findIndex(p => p.barcode === barcode);
    if (index >= 0) {
      removedProduct = products[index];
      products.splice(index, 1);
      localStorage.setItem('cached_products', JSON.stringify(products));
    }
  }
  
  // Синхронизируем с Firebase
  try {
    return await removeFirebaseExpiredProduct(barcode);
  } catch (error) {
    console.warn('⚠️ Не удалось удалить из Firebase:', error);
    return removedProduct;
  }
};

// === ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ КОМПОНЕНТОВ (с локальным кэшем) ===

// Upsert товара (вставка или обновление по штрихкоду)
export const upsertProduct = async (
  productData: {
    barcode: string;
    name: string;
    category?: string;
    supplier?: string | null;
    unit?: string;
    purchase_price: number;
    sale_price: number;
    quantity: number;
    expiry_date?: string | null;
    created_by?: string;
  }
): Promise<{ success: boolean; isUpdate: boolean; newQuantity?: number }> => {
  // СНАЧАЛА обновляем локальный кэш
  const cached = localStorage.getItem('cached_products');
  const products: StoredProduct[] = cached ? JSON.parse(cached) : [];
  const existingIndex = products.findIndex(p => p.barcode === productData.barcode);
  
  let newQuantity = productData.quantity;
  let isUpdate = false;
  
  if (existingIndex >= 0) {
    isUpdate = true;
    newQuantity = products[existingIndex].quantity + productData.quantity;
    products[existingIndex] = {
      ...products[existingIndex],
      name: productData.name,
      category: productData.category || products[existingIndex].category,
      supplier: productData.supplier || products[existingIndex].supplier,
      purchasePrice: productData.purchase_price,
      retailPrice: productData.sale_price,
      quantity: newQuantity,
      expiryDate: productData.expiry_date || products[existingIndex].expiryDate,
      lastUpdated: new Date().toISOString()
    };
  } else {
    const newProduct: StoredProduct = {
      id: crypto.randomUUID(),
      barcode: productData.barcode,
      name: productData.name,
      category: productData.category || '',
      supplier: productData.supplier || undefined,
      unit: 'шт',
      purchasePrice: productData.purchase_price,
      retailPrice: productData.sale_price,
      quantity: productData.quantity,
      expiryDate: productData.expiry_date || undefined,
      paymentType: 'full',
      paidAmount: productData.purchase_price * productData.quantity,
      debtAmount: 0,
      addedBy: productData.created_by || '',
      photos: [],
      lastUpdated: new Date().toISOString(),
      priceHistory: [{
        date: new Date().toISOString(),
        purchasePrice: productData.purchase_price,
        retailPrice: productData.sale_price,
        changedBy: productData.created_by || ''
      }]
    };
    products.push(newProduct);
  }
  
  localStorage.setItem('cached_products', JSON.stringify(products));
  console.log('💾 Товар сохранен локально:', productData.barcode);
  
  // ПОТОМ синхронизируем с Firebase (в фоне)
  try {
    const existing = await findFirebaseProductByBarcode(productData.barcode);
    
    if (existing) {
      const q = query(
        collection(firebaseDb, 'products'),
        where('barcode', '==', productData.barcode)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        
        await updateDoc(docRef, {
          name: productData.name,
          category: productData.category || existing.category,
          supplier: productData.supplier || existing.supplier || null,
          purchasePrice: productData.purchase_price,
          salePrice: productData.sale_price,
          quantity: newQuantity,
          expiryDate: productData.expiry_date || existing.expiryDate || null,
          updatedAt: new Date().toISOString()
        });
        
        return { success: true, isUpdate: true, newQuantity };
      }
    }
    
    const newId = crypto.randomUUID();
    await setDoc(doc(firebaseDb, 'products', newId), {
      barcode: productData.barcode,
      name: productData.name,
      category: productData.category || '',
      supplier: productData.supplier || null,
      unit: productData.unit || 'шт',
      purchasePrice: productData.purchase_price,
      salePrice: productData.sale_price,
      quantity: productData.quantity,
      expiryDate: productData.expiry_date || null,
      paymentType: 'full',
      paidAmount: productData.purchase_price * productData.quantity,
      debtAmount: 0,
      addedBy: productData.created_by || '',
      priceHistory: [{
        date: new Date().toISOString(),
        purchasePrice: productData.purchase_price,
        retailPrice: productData.sale_price,
        changedBy: productData.created_by || ''
      }],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    return { success: true, isUpdate: false, newQuantity: productData.quantity };
  } catch (error) {
    console.warn('⚠️ Firebase недоступен, данные сохранены локально:', error);
    return { success: true, isUpdate, newQuantity };
  }
};

// Обновить товар по ID
export const updateProductById = async (
  id: string,
  updates: Partial<{
    quantity: number;
    name: string;
    category: string;
    supplier: string | null;
    purchasePrice: number;
    salePrice: number;
    expiryDate: string | null;
  }>
): Promise<boolean> => {
  try {
    const docRef = doc(firebaseDb, 'products', id);
    const updateData: any = { updatedAt: new Date().toISOString() };
    
    if (updates.quantity !== undefined) updateData.quantity = updates.quantity;
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.supplier !== undefined) updateData.supplier = updates.supplier;
    if (updates.purchasePrice !== undefined) updateData.purchasePrice = updates.purchasePrice;
    if (updates.salePrice !== undefined) updateData.salePrice = updates.salePrice;
    if (updates.expiryDate !== undefined) updateData.expiryDate = updates.expiryDate;
    
    await updateDoc(docRef, updateData);
    return true;
  } catch (error) {
    console.error('❌ Ошибка обновления товара по ID:', error);
    return false;
  }
};

// Получить товар по ID
export const getProductById = async (id: string): Promise<StoredProduct | null> => {
  try {
    const { getDoc: fbGetDoc } = await import('firebase/firestore');
    const docRef = doc(firebaseDb, 'products', id);
    const docSnap = await fbGetDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        barcode: data.barcode || '',
        name: data.name || '',
        category: data.category || '',
        purchasePrice: Number(data.purchasePrice) || 0,
        retailPrice: Number(data.salePrice) || 0,
        quantity: Number(data.quantity) || 0,
        unit: 'шт' as const,
        expiryDate: data.expiryDate || undefined,
        photos: data.photos || [],
        paymentType: (data.paymentType as 'full' | 'partial' | 'debt') || 'full',
        paidAmount: Number(data.paidAmount) || 0,
        debtAmount: Number(data.debtAmount) || 0,
        addedBy: data.addedBy || '',
        supplier: data.supplier || undefined,
        lastUpdated: data.updatedAt || data.createdAt || new Date().toISOString(),
        priceHistory: data.priceHistory || []
      };
    }
    return null;
  } catch (error) {
    console.error('❌ Ошибка получения товара по ID:', error);
    return null;
  }
};

// Удалить товар полностью
export const deleteProduct = async (barcode: string): Promise<boolean> => {
  try {
    const q = query(
      collection(firebaseDb, 'products'),
      where('barcode', '==', barcode)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      await deleteDoc(snapshot.docs[0].ref);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Ошибка удаления товара:', error);
    return false;
  }
};

// === СИСТЕМА ОТМЕНЫ ТОВАРОВ (Firebase) ===

export interface CancellationRequest {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  cashier: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const getCancellationRequests = async (): Promise<CancellationRequest[]> => {
  const requests = await getFirebaseCancellations();
  return requests.map(r => ({
    id: r.id,
    items: r.items,
    cashier: r.cashier,
    requestedAt: r.created_at,
    status: r.status
  }));
};

export const createCancellationRequest = async (
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>, 
  cashier: string
): Promise<CancellationRequest> => {
  const id = await createFirebaseCancellation(items, cashier);
  return {
    id,
    items,
    cashier,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  };
};

export const updateCancellationRequest = async (id: string, status: 'approved' | 'rejected'): Promise<void> => {
  await updateFirebaseCancellation(id, status);
  
  if (status === 'approved') {
    const requests = await getFirebaseCancellations();
    const request = requests.find(r => r.id === id);
    if (request) {
      for (const item of request.items) {
        await updateProductQuantity(item.barcode, item.quantity);
      }
    }
  }
};

export const cleanupOldCancellations = async (): Promise<void> => {
  console.log('cleanupOldCancellations: Not implemented for Firebase');
};

export const exportAllData = async () => {
  const { getSuppliers } = await import('./suppliersDb');
  
  const allData = {
    products: await getStoredProducts(),
    cancellations: await getCancellationRequests(),
    suppliers: await getSuppliers(),
    exportDate: new Date().toISOString(),
    version: '3.0-firebase'
  };

  const jsonString = JSON.stringify(allData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const importAllData = async (jsonData: string) => {
  try {
    const data = JSON.parse(jsonData);
    console.log('Import from backup not implemented for Firebase');
    return false;
  } catch (error) {
    console.error('Ошибка импорта данных:', error);
    return false;
  }
};
