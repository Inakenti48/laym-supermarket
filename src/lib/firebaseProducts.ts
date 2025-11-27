import { firebaseDb } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  limit
} from 'firebase/firestore';
import { StoredProduct } from './storage';

const PRODUCTS_COLLECTION = 'products';
const PRODUCT_IMAGES_COLLECTION = 'product_images';

// Маппинг StoredProduct -> Firebase формат
const toFirebaseProduct = (product: Omit<StoredProduct, 'id' | 'lastUpdated'> & { id?: string }) => ({
  barcode: product.barcode,
  name: product.name,
  category: product.category || '',
  purchasePrice: product.purchasePrice,
  salePrice: product.retailPrice,
  quantity: product.quantity,
  unit: product.unit,
  expiryDate: product.expiryDate || null,
  photos: product.photos || [],
  paymentType: product.paymentType || 'full',
  paidAmount: product.paidAmount || 0,
  debtAmount: product.debtAmount || 0,
  addedBy: product.addedBy || '',
  supplier: product.supplier || null,
  priceHistory: product.priceHistory || [],
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString()
});

// Маппинг Firebase -> StoredProduct формат
const fromFirebaseProduct = (id: string, data: any): StoredProduct => ({
  id,
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
  addedBy: data.addedBy || data.createdBy || '',
  supplier: data.supplier || undefined,
  lastUpdated: data.updatedAt || data.createdAt || new Date().toISOString(),
  priceHistory: data.priceHistory || []
});

// Получить все товары
export const getAllFirebaseProducts = async (): Promise<StoredProduct[]> => {
  try {
    const querySnapshot = await getDocs(collection(firebaseDb, PRODUCTS_COLLECTION));
    const products: StoredProduct[] = [];
    
    querySnapshot.forEach((doc) => {
      products.push(fromFirebaseProduct(doc.id, doc.data()));
    });
    
    // Сортируем по дате обновления
    products.sort((a, b) => 
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );
    
    console.log('✅ Загружено товаров из Firebase:', products.length);
    return products;
  } catch (error) {
    console.error('❌ Ошибка загрузки товаров из Firebase:', error);
    return [];
  }
};

// Получить товар по штрих-коду
export const findFirebaseProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  if (!barcode) return null;
  
  try {
    const q = query(
      collection(firebaseDb, PRODUCTS_COLLECTION),
      where('barcode', '==', barcode)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return fromFirebaseProduct(doc.id, doc.data());
    }
    return null;
  } catch (error) {
    console.error('❌ Ошибка поиска товара:', error);
    return null;
  }
};

// Сохранить товар (создать или обновить)
export const saveFirebaseProduct = async (
  product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>,
  userId: string
): Promise<StoredProduct> => {
  const now = new Date().toISOString();
  
  try {
    // Проверяем существует ли товар с таким штрих-кодом
    const existing = product.barcode ? await findFirebaseProductByBarcode(product.barcode) : null;
    
    if (existing) {
      // Обновляем существующий товар
      const priceChanged = 
        existing.purchasePrice !== product.purchasePrice || 
        existing.retailPrice !== product.retailPrice;
      
      const newPriceHistory = priceChanged
        ? [
            ...existing.priceHistory,
            {
              date: now,
              purchasePrice: product.purchasePrice,
              retailPrice: product.retailPrice,
              changedBy: userId,
            },
          ]
        : existing.priceHistory;
      
      const q = query(
        collection(firebaseDb, PRODUCTS_COLLECTION),
        where('barcode', '==', product.barcode)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        
        await updateDoc(docRef, {
          name: product.name,
          category: product.category,
          purchasePrice: product.purchasePrice,
          salePrice: product.retailPrice,
          quantity: existing.quantity + product.quantity,
          unit: product.unit,
          expiryDate: product.expiryDate || null,
          paymentType: product.paymentType,
          paidAmount: product.paidAmount,
          debtAmount: product.debtAmount,
          supplier: product.supplier || null,
          priceHistory: newPriceHistory,
          updatedAt: now
        });
        
        console.log('✅ Товар обновлён в Firebase:', product.barcode);
        
        return {
          ...existing,
          ...product,
          id: snapshot.docs[0].id,
          quantity: existing.quantity + product.quantity,
          lastUpdated: now,
          priceHistory: newPriceHistory
        };
      }
    }
    
    // Создаём новый товар
    const newId = crypto.randomUUID();
    const newPriceHistory = [
      {
        date: now,
        purchasePrice: product.purchasePrice,
        retailPrice: product.retailPrice,
        changedBy: userId,
      },
    ];
    
    const firebaseProduct = {
      barcode: product.barcode || `NO-BARCODE-${Date.now()}`,
      name: product.name,
      category: product.category || '',
      purchasePrice: product.purchasePrice,
      salePrice: product.retailPrice,
      quantity: product.quantity,
      unit: product.unit,
      expiryDate: product.expiryDate || null,
      photos: product.photos || [],
      paymentType: product.paymentType,
      paidAmount: product.paidAmount,
      debtAmount: product.debtAmount,
      addedBy: userId,
      supplier: product.supplier || null,
      priceHistory: newPriceHistory,
      createdAt: now,
      updatedAt: now
    };
    
    await setDoc(doc(firebaseDb, PRODUCTS_COLLECTION, newId), firebaseProduct);
    
    console.log('✅ Новый товар создан в Firebase:', newId);
    
    return {
      id: newId,
      barcode: firebaseProduct.barcode,
      name: firebaseProduct.name,
      category: firebaseProduct.category,
      purchasePrice: firebaseProduct.purchasePrice,
      retailPrice: firebaseProduct.salePrice,
      quantity: firebaseProduct.quantity,
      unit: 'шт' as const,
      expiryDate: firebaseProduct.expiryDate || undefined,
      photos: firebaseProduct.photos,
      paymentType: firebaseProduct.paymentType as 'full' | 'partial' | 'debt',
      paidAmount: firebaseProduct.paidAmount,
      debtAmount: firebaseProduct.debtAmount,
      addedBy: userId,
      supplier: firebaseProduct.supplier || undefined,
      lastUpdated: now,
      priceHistory: newPriceHistory
    };
  } catch (error) {
    console.error('❌ Ошибка сохранения товара в Firebase:', error);
    throw error;
  }
};

// Обновить количество товара
export const updateFirebaseProductQuantity = async (
  barcode: string, 
  quantityChange: number
): Promise<void> => {
  try {
    const product = await findFirebaseProductByBarcode(barcode);
    if (!product) {
      throw new Error(`Товар с штрихкодом ${barcode} не найден`);
    }
    
    const q = query(
      collection(firebaseDb, PRODUCTS_COLLECTION),
      where('barcode', '==', barcode)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      const newQuantity = Math.max(0, product.quantity + quantityChange);
      
      await updateDoc(docRef, {
        quantity: newQuantity,
        updatedAt: new Date().toISOString()
      });
      
      console.log('✅ Количество обновлено:', barcode, newQuantity);
    }
  } catch (error) {
    console.error('❌ Ошибка обновления количества:', error);
    throw error;
  }
};

// Удалить товар (обнуляем количество для истекших)
export const removeFirebaseExpiredProduct = async (barcode: string): Promise<StoredProduct | null> => {
  try {
    const product = await findFirebaseProductByBarcode(barcode);
    if (!product) return null;
    
    const q = query(
      collection(firebaseDb, PRODUCTS_COLLECTION),
      where('barcode', '==', barcode)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      
      await updateDoc(docRef, {
        quantity: 0,
        updatedAt: new Date().toISOString()
      });
      
      console.log('✅ Товар помечен как истёкший:', barcode);
    }
    
    return product;
  } catch (error) {
    console.error('❌ Ошибка удаления истёкшего товара:', error);
    return null;
  }
};

// Удалить товар полностью
export const deleteFirebaseProduct = async (barcode: string): Promise<boolean> => {
  try {
    const q = query(
      collection(firebaseDb, PRODUCTS_COLLECTION),
      where('barcode', '==', barcode)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      await deleteDoc(snapshot.docs[0].ref);
      console.log('✅ Товар удалён из Firebase:', barcode);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Ошибка удаления товара:', error);
    return false;
  }
};

// Получить товары с истекающим сроком
export const getFirebaseExpiringProducts = async (daysBeforeExpiry: number = 3): Promise<StoredProduct[]> => {
  try {
    const allProducts = await getAllFirebaseProducts();
    const now = new Date();
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);
    
    return allProducts.filter(product => {
      if (!product.expiryDate || product.quantity <= 0) return false;
      const expiryDate = new Date(product.expiryDate);
      return expiryDate >= now && expiryDate <= targetDate;
    });
  } catch (error) {
    console.error('❌ Ошибка получения истекающих товаров:', error);
    return [];
  }
};

// Поиск товаров по названию
export const searchFirebaseProducts = async (searchTerm: string): Promise<StoredProduct[]> => {
  try {
    const allProducts = await getAllFirebaseProducts();
    const lowerSearch = searchTerm.toLowerCase();
    
    return allProducts.filter(p => 
      p.name.toLowerCase().includes(lowerSearch) ||
      p.barcode.includes(searchTerm)
    );
  } catch (error) {
    console.error('❌ Ошибка поиска товаров:', error);
    return [];
  }
};

// Подписка на realtime обновления
export const subscribeToFirebaseProducts = (
  callback: (products: StoredProduct[]) => void
): (() => void) => {
  const unsubscribe = onSnapshot(
    collection(firebaseDb, PRODUCTS_COLLECTION),
    (snapshot) => {
      const products: StoredProduct[] = [];
      snapshot.forEach((doc) => {
        products.push(fromFirebaseProduct(doc.id, doc.data()));
      });
      
      // Сортируем по дате обновления
      products.sort((a, b) => 
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
      );
      
      callback(products);
    },
    (error) => {
      console.error('❌ Ошибка realtime подписки:', error);
    }
  );
  
  return unsubscribe;
};

// Тестовое добавление товара для проверки подключения
export const testFirebaseConnection = async (): Promise<{
  success: boolean;
  message: string;
  product?: StoredProduct;
}> => {
  try {
    const testProduct: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'> = {
      barcode: 'TEST-001',
      name: 'Тестовый товар',
      category: 'Тест',
      purchasePrice: 100,
      retailPrice: 150,
      quantity: 10,
      unit: 'шт',
      photos: [],
      paymentType: 'full',
      paidAmount: 0,
      debtAmount: 0,
      addedBy: 'system-test'
    };

    const saved = await saveFirebaseProduct(testProduct, 'system-test');
    
    if (saved) {
      console.log('✅ Firebase подключение работает! Тестовый товар сохранён:', saved);
      return {
        success: true,
        message: 'Firebase подключен успешно! Тестовый товар добавлен в коллекцию products.',
        product: saved
      };
    }
    
    return {
      success: false,
      message: 'Не удалось сохранить тестовый товар'
    };
  } catch (error: any) {
    console.error('❌ Ошибка тестирования Firebase:', error);
    return {
      success: false,
      message: error.message || 'Ошибка подключения к Firebase'
    };
  }
};
