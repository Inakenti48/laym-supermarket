// MySQL Storage Layer - все операции через MySQL
import {
  getAllProducts as mysqlGetAllProducts,
  getProductByBarcode as mysqlGetProductByBarcode,
  insertProduct as mysqlInsertProduct,
  updateProduct as mysqlUpdateProduct,
  deleteProduct as mysqlDeleteProduct,
  getCancellationRequests as mysqlGetCancellations,
  createCancellationRequest as mysqlCreateCancellation,
  updateCancellationStatus as mysqlUpdateCancellation,
  insertSale,
  Product,
} from './mysqlDatabase';
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

// Конвертация MySQL Product в StoredProduct
const convertToStoredProduct = (p: Product): StoredProduct => ({
  id: p.id,
  barcode: p.barcode,
  name: p.name,
  category: p.category || '',
  purchasePrice: p.purchase_price,
  retailPrice: p.sale_price,
  quantity: p.quantity,
  unit: 'шт',
  expiryDate: p.expiry_date,
  photos: [],
  paymentType: 'full',
  paidAmount: p.purchase_price * p.quantity,
  debtAmount: 0,
  addedBy: p.created_by || '',
  supplier: p.supplier_id,
  lastUpdated: p.updated_at || p.created_at || new Date().toISOString(),
  priceHistory: [{
    date: p.created_at || new Date().toISOString(),
    purchasePrice: p.purchase_price,
    retailPrice: p.sale_price,
    changedBy: p.created_by || ''
  }]
});

// Сохранение фото товара в S3
export const saveProductImage = async (
  barcode: string, 
  productName: string, 
  imageBase64: string,
  userId?: string
): Promise<boolean> => {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload',
        fileName: `${barcode}_${Date.now()}.jpg`,
        fileData: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
        contentType: 'image/jpeg',
        folder: 'products'
      })
    });
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('❌ Ошибка загрузки фото:', error);
    return false;
  }
};

// === ФУНКЦИИ РАБОТЫ С ТОВАРАМИ ===

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
    console.log('📦 Загрузка товаров из MySQL...');
    const products = await mysqlGetAllProducts();
    const converted = products.map(convertToStoredProduct);
    
    // Кэшируем локально
    if (converted.length > 0) {
      localStorage.setItem('cached_products', JSON.stringify(converted));
      localStorage.setItem('cached_products_time', Date.now().toString());
    }
    
    return converted;
  } catch (error) {
    console.warn('⚠️ MySQL недоступен, загружаем из кэша...');
    const cached = localStorage.getItem('cached_products');
    if (cached) return JSON.parse(cached);
    const localData = await getAllLocalData();
    return localData.products as StoredProduct[];
  }
};

export const findProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  if (!barcode) return null;
  
  try {
    const product = await mysqlGetProductByBarcode(barcode);
    if (!product) return null;
    return convertToStoredProduct(product);
  } catch (error) {
    console.warn('⚠️ MySQL недоступен, ищем локально...');
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
  
  // Сохраняем локально
  const localId = await saveProductLocally(product);
  console.log('💾 Товар сохранен локально:', localId);
  
  // Обновляем кэш
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
  
  const existingIndex = products.findIndex(p => p.barcode === product.barcode);
  if (existingIndex >= 0) {
    products[existingIndex] = { ...products[existingIndex], ...newProduct, quantity: products[existingIndex].quantity + product.quantity };
  } else {
    products.push(newProduct);
  }
  localStorage.setItem('cached_products', JSON.stringify(products));
  
  // Синхронизируем с MySQL
  try {
    await mysqlInsertProduct({
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      purchase_price: product.purchasePrice,
      sale_price: product.retailPrice,
      quantity: product.quantity,
      unit: product.unit,
      supplier_id: product.supplier,
      expiry_date: product.expiryDate,
      created_by: userId
    });
    console.log('☁️ Товар синхронизирован с MySQL');
  } catch (err) {
    console.warn('⚠️ Не удалось синхронизировать с MySQL:', err);
  }
  
  return newProduct;
};

export const getAllProducts = async (): Promise<StoredProduct[]> => {
  return getStoredProducts();
};

export const getExpiringProducts = async (daysBeforeExpiry: number = 3): Promise<StoredProduct[]> => {
  const products = await getStoredProducts();
  const now = new Date();
  const limitDate = new Date(now.getTime() + daysBeforeExpiry * 24 * 60 * 60 * 1000);
  return products.filter(p => p.expiryDate && new Date(p.expiryDate) <= limitDate);
};

export const isProductExpired = (product: StoredProduct): boolean => {
  if (!product.expiryDate) return false;
  return new Date(product.expiryDate) < new Date();
};

export const updateProductQuantity = async (barcode: string, quantityChange: number): Promise<void> => {
  // Обновляем кэш
  const cached = localStorage.getItem('cached_products');
  if (cached) {
    const products: StoredProduct[] = JSON.parse(cached);
    const index = products.findIndex(p => p.barcode === barcode);
    if (index >= 0) {
      products[index].quantity += quantityChange;
      localStorage.setItem('cached_products', JSON.stringify(products));
    }
  }
  
  // Синхронизируем с MySQL
  try {
    const product = await mysqlGetProductByBarcode(barcode);
    if (product) {
      await mysqlUpdateProduct(barcode, { quantity: product.quantity + quantityChange });
    }
  } catch (error) {
    console.warn('⚠️ Не удалось синхронизировать количество с MySQL:', error);
  }
};

export const removeExpiredProduct = async (barcode: string): Promise<StoredProduct | null> => {
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
  
  try {
    await mysqlDeleteProduct(barcode);
  } catch (error) {
    console.warn('⚠️ Не удалось удалить из MySQL:', error);
  }
  
  return removedProduct;
};

// Upsert товара
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
  
  // Синхронизируем с MySQL
  try {
    const existing = await mysqlGetProductByBarcode(productData.barcode);
    if (existing) {
      await mysqlUpdateProduct(productData.barcode, {
        name: productData.name,
        category: productData.category || '',
        purchase_price: productData.purchase_price,
        sale_price: productData.sale_price,
        quantity: newQuantity,
        expiry_date: productData.expiry_date || undefined
      });
    } else {
      await mysqlInsertProduct({
        barcode: productData.barcode,
        name: productData.name,
        category: productData.category || '',
        purchase_price: productData.purchase_price,
        sale_price: productData.sale_price,
        quantity: productData.quantity,
        unit: productData.unit || 'шт',
        expiry_date: productData.expiry_date || undefined,
        created_by: productData.created_by
      });
    }
    return { success: true, isUpdate, newQuantity };
  } catch (error) {
    console.warn('⚠️ MySQL недоступен, данные сохранены локально:', error);
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
    // Найдем товар по ID в кэше
    const cached = localStorage.getItem('cached_products');
    if (cached) {
      const products: StoredProduct[] = JSON.parse(cached);
      const product = products.find(p => p.id === id);
      if (product) {
        const mysqlUpdates: Partial<Product> = {};
        if (updates.quantity !== undefined) mysqlUpdates.quantity = updates.quantity;
        if (updates.name !== undefined) mysqlUpdates.name = updates.name;
        if (updates.category !== undefined) mysqlUpdates.category = updates.category;
        if (updates.purchasePrice !== undefined) mysqlUpdates.purchase_price = updates.purchasePrice;
        if (updates.salePrice !== undefined) mysqlUpdates.sale_price = updates.salePrice;
        if (updates.expiryDate !== undefined) mysqlUpdates.expiry_date = updates.expiryDate || undefined;
        
        await mysqlUpdateProduct(product.barcode, mysqlUpdates);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('❌ Ошибка обновления товара:', error);
    return false;
  }
};

// Получить товар по ID
export const getProductById = async (id: string): Promise<StoredProduct | null> => {
  const cached = localStorage.getItem('cached_products');
  if (cached) {
    const products: StoredProduct[] = JSON.parse(cached);
    return products.find(p => p.id === id) || null;
  }
  return null;
};

// Удалить товар
export const deleteProduct = async (barcode: string): Promise<boolean> => {
  try {
    await mysqlDeleteProduct(barcode);
    
    // Удаляем из кэша
    const cached = localStorage.getItem('cached_products');
    if (cached) {
      const products: StoredProduct[] = JSON.parse(cached);
      const filtered = products.filter(p => p.barcode !== barcode);
      localStorage.setItem('cached_products', JSON.stringify(filtered));
    }
    return true;
  } catch (error) {
    console.error('❌ Ошибка удаления товара:', error);
    return false;
  }
};

// === СИСТЕМА ОТМЕНЫ ТОВАРОВ ===

export interface CancellationRequest {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  cashier: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const getCancellationRequests = async (): Promise<CancellationRequest[]> => {
  const requests = await mysqlGetCancellations();
  return requests.map(r => ({
    id: r.id,
    items: r.items,
    cashier: r.cashier,
    requestedAt: r.created_at || '',
    status: r.status
  }));
};

export const createCancellationRequest = async (
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>, 
  cashier: string
): Promise<CancellationRequest> => {
  const result = await mysqlCreateCancellation(items, cashier);
  return {
    id: result.id || crypto.randomUUID(),
    items,
    cashier,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  };
};

export const approveCancellation = async (id: string, adminId: string): Promise<void> => {
  await mysqlUpdateCancellation(id, 'approved', adminId);
};

export const rejectCancellation = async (id: string, adminId: string): Promise<void> => {
  await mysqlUpdateCancellation(id, 'rejected', adminId);
};

// === ПРОДАЖИ ===

export const recordSale = async (
  barcode: string,
  productName: string,
  quantity: number,
  unitPrice: number,
  cashier: string,
  paymentMethod: string = 'cash'
): Promise<boolean> => {
  try {
    await insertSale({
      barcode,
      product_name: productName,
      quantity,
      unit_price: unitPrice,
      total_price: quantity * unitPrice,
      cashier,
      payment_method: paymentMethod
    });
    return true;
  } catch (error) {
    console.error('❌ Ошибка записи продажи:', error);
    return false;
  }
};

// === ПОИСК ===

export const searchProducts = async (query: string): Promise<StoredProduct[]> => {
  const products = await getStoredProducts();
  const q = query.toLowerCase();
  return products.filter(p => 
    p.name.toLowerCase().includes(q) || 
    p.barcode.includes(q) ||
    p.category?.toLowerCase().includes(q)
  );
};
