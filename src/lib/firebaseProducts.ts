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
const LOCAL_STORAGE_KEY = 'local_products_backup';

// Флаг для отслеживания работы Firebase
let firebaseAvailable = true;

// Получить локальные товары из localStorage
const getLocalProducts = (): StoredProduct[] => {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Сохранить товары локально
const saveLocalProducts = (products: StoredProduct[]) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(products));
  } catch (e) {
    console.warn('Не удалось сохранить локально:', e);
  }
};

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
  // Сначала пробуем Firebase
  if (firebaseAvailable) {
    try {
      const querySnapshot = await Promise.race([
        getDocs(collection(firebaseDb, PRODUCTS_COLLECTION)),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 5000)
        )
      ]);
      
      const products: StoredProduct[] = [];
      querySnapshot.forEach((doc) => {
        products.push(fromFirebaseProduct(doc.id, doc.data()));
      });
      
      // Кэшируем локально
      if (products.length > 0) {
        saveLocalProducts(products);
      }
      
      products.sort((a, b) => 
        new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
      );
      
      console.log('✅ Загружено товаров из Firebase:', products.length);
      return products;
    } catch (error: any) {
      console.warn('⚠️ Firebase недоступен, использую локальное хранилище:', error.message);
      firebaseAvailable = false;
    }
  }
  
  // Fallback на локальное хранилище
  const localProducts = getLocalProducts();
  console.log('📦 Загружено товаров локально:', localProducts.length);
  return localProducts;
};

// Получить товар по штрих-коду
export const findFirebaseProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  if (!barcode) return null;
  
  if (firebaseAvailable) {
    try {
      const q = query(
        collection(firebaseDb, PRODUCTS_COLLECTION),
        where('barcode', '==', barcode)
      );
      
      const querySnapshot = await Promise.race([
        getDocs(q),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 3000)
        )
      ]);
      
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return fromFirebaseProduct(doc.id, doc.data());
      }
      return null;
    } catch (error) {
      console.warn('⚠️ Firebase поиск недоступен, ищу локально');
      firebaseAvailable = false;
    }
  }
  
  // Локальный поиск
  const localProducts = getLocalProducts();
  return localProducts.find(p => p.barcode === barcode) || null;
};

// Сохранить товар (создать или обновить)
export const saveFirebaseProduct = async (
  product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>,
  userId: string
): Promise<StoredProduct> => {
  const now = new Date().toISOString();
  
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
    
    const updatedProduct: StoredProduct = {
      ...existing,
      ...product,
      quantity: existing.quantity + product.quantity,
      lastUpdated: now,
      priceHistory: newPriceHistory
    };
    
    if (firebaseAvailable) {
      try {
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
        }
      } catch (error) {
        console.warn('⚠️ Firebase обновление недоступно, сохраняю локально');
        firebaseAvailable = false;
      }
    }
    
    // Всегда сохраняем локально как бэкап
    const localProducts = getLocalProducts();
    const idx = localProducts.findIndex(p => p.barcode === product.barcode);
    if (idx >= 0) {
      localProducts[idx] = updatedProduct;
    } else {
      localProducts.push(updatedProduct);
    }
    saveLocalProducts(localProducts);
    
    return updatedProduct;
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
  
  const newProduct: StoredProduct = {
    id: newId,
    barcode: product.barcode || `NO-BARCODE-${Date.now()}`,
    name: product.name,
    category: product.category || '',
    purchasePrice: product.purchasePrice,
    retailPrice: product.retailPrice,
    quantity: product.quantity,
    unit: 'шт' as const,
    expiryDate: product.expiryDate || undefined,
    photos: product.photos || [],
    paymentType: product.paymentType as 'full' | 'partial' | 'debt',
    paidAmount: product.paidAmount || 0,
    debtAmount: product.debtAmount || 0,
    addedBy: userId,
    supplier: product.supplier || undefined,
    lastUpdated: now,
    priceHistory: newPriceHistory
  };
  
  if (firebaseAvailable) {
    try {
      const firebaseProduct = {
        barcode: newProduct.barcode,
        name: newProduct.name,
        category: newProduct.category,
        purchasePrice: newProduct.purchasePrice,
        salePrice: newProduct.retailPrice,
        quantity: newProduct.quantity,
        unit: newProduct.unit,
        expiryDate: newProduct.expiryDate || null,
        photos: newProduct.photos,
        paymentType: newProduct.paymentType,
        paidAmount: newProduct.paidAmount,
        debtAmount: newProduct.debtAmount,
        addedBy: userId,
        supplier: newProduct.supplier || null,
        priceHistory: newPriceHistory,
        createdAt: now,
        updatedAt: now
      };
      
      await setDoc(doc(firebaseDb, PRODUCTS_COLLECTION, newId), firebaseProduct);
      console.log('✅ Новый товар создан в Firebase:', newId);
    } catch (error) {
      console.warn('⚠️ Firebase создание недоступно, сохраняю локально');
      firebaseAvailable = false;
    }
  }
  
  // Всегда сохраняем локально
  const localProducts = getLocalProducts();
  localProducts.push(newProduct);
  saveLocalProducts(localProducts);
  
  return newProduct;
};

// Обновить количество товара
export const updateFirebaseProductQuantity = async (
  barcode: string, 
  quantityChange: number
): Promise<void> => {
  const product = await findFirebaseProductByBarcode(barcode);
  if (!product) {
    throw new Error(`Товар с штрихкодом ${barcode} не найден`);
  }
  
  const newQuantity = Math.max(0, product.quantity + quantityChange);
  const now = new Date().toISOString();
  
  if (firebaseAvailable) {
    try {
      const q = query(
        collection(firebaseDb, PRODUCTS_COLLECTION),
        where('barcode', '==', barcode)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        await updateDoc(docRef, {
          quantity: newQuantity,
          updatedAt: now
        });
        console.log('✅ Количество обновлено в Firebase:', barcode, newQuantity);
      }
    } catch (error) {
      console.warn('⚠️ Firebase обновление количества недоступно');
      firebaseAvailable = false;
    }
  }
  
  // Обновляем локально
  const localProducts = getLocalProducts();
  const idx = localProducts.findIndex(p => p.barcode === barcode);
  if (idx >= 0) {
    localProducts[idx].quantity = newQuantity;
    localProducts[idx].lastUpdated = now;
    saveLocalProducts(localProducts);
  }
};

// Удалить товар (обнуляем количество для истекших)
export const removeFirebaseExpiredProduct = async (barcode: string): Promise<StoredProduct | null> => {
  const product = await findFirebaseProductByBarcode(barcode);
  if (!product) return null;
  
  const now = new Date().toISOString();
  
  if (firebaseAvailable) {
    try {
      const q = query(
        collection(firebaseDb, PRODUCTS_COLLECTION),
        where('barcode', '==', barcode)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        await updateDoc(docRef, {
          quantity: 0,
          updatedAt: now
        });
        console.log('✅ Товар помечен как истёкший в Firebase:', barcode);
      }
    } catch (error) {
      console.warn('⚠️ Firebase недоступен');
      firebaseAvailable = false;
    }
  }
  
  // Обновляем локально
  const localProducts = getLocalProducts();
  const idx = localProducts.findIndex(p => p.barcode === barcode);
  if (idx >= 0) {
    localProducts[idx].quantity = 0;
    localProducts[idx].lastUpdated = now;
    saveLocalProducts(localProducts);
  }
  
  return product;
};

// Удалить товар полностью
export const deleteFirebaseProduct = async (barcode: string): Promise<boolean> => {
  if (firebaseAvailable) {
    try {
      const q = query(
        collection(firebaseDb, PRODUCTS_COLLECTION),
        where('barcode', '==', barcode)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        await deleteDoc(snapshot.docs[0].ref);
        console.log('✅ Товар удалён из Firebase:', barcode);
      }
    } catch (error) {
      console.warn('⚠️ Firebase удаление недоступно');
      firebaseAvailable = false;
    }
  }
  
  // Удаляем локально
  const localProducts = getLocalProducts();
  const filtered = localProducts.filter(p => p.barcode !== barcode);
  saveLocalProducts(filtered);
  
  return true;
};

// Получить товары с истекающим сроком
export const getFirebaseExpiringProducts = async (daysBeforeExpiry: number = 3): Promise<StoredProduct[]> => {
  const allProducts = await getAllFirebaseProducts();
  const now = new Date();
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);
  
  return allProducts.filter(product => {
    if (!product.expiryDate || product.quantity <= 0) return false;
    const expiryDate = new Date(product.expiryDate);
    return expiryDate >= now && expiryDate <= targetDate;
  });
};

// Поиск товаров по названию
export const searchFirebaseProducts = async (searchTerm: string): Promise<StoredProduct[]> => {
  const allProducts = await getAllFirebaseProducts();
  const lowerSearch = searchTerm.toLowerCase();
  
  return allProducts.filter(p => 
    p.name.toLowerCase().includes(lowerSearch) ||
    p.barcode.includes(searchTerm)
  );
};

// Подписка на realtime обновления
export const subscribeToFirebaseProducts = (
  callback: (products: StoredProduct[]) => void
): (() => void) => {
  // Сначала отдаём локальные данные
  const localProducts = getLocalProducts();
  if (localProducts.length > 0) {
    callback(localProducts);
  }
  
  if (!firebaseAvailable) {
    // Если Firebase недоступен, просто возвращаем пустую функцию отписки
    return () => {};
  }
  
  try {
    const unsubscribe = onSnapshot(
      collection(firebaseDb, PRODUCTS_COLLECTION),
      (snapshot) => {
        const products: StoredProduct[] = [];
        snapshot.forEach((doc) => {
          products.push(fromFirebaseProduct(doc.id, doc.data()));
        });
        
        products.sort((a, b) => 
          new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
        );
        
        // Кэшируем локально
        saveLocalProducts(products);
        callback(products);
      },
      (error) => {
        console.warn('⚠️ Realtime подписка отключена:', error.message);
        firebaseAvailable = false;
        // Возвращаем локальные данные при ошибке
        callback(getLocalProducts());
      }
    );
    
    return unsubscribe;
  } catch (error) {
    console.warn('⚠️ Не удалось подписаться на Firebase');
    firebaseAvailable = false;
    return () => {};
  }
};

// Тестовое добавление товара для проверки подключения
export const testFirebaseConnection = async (): Promise<{
  success: boolean;
  message: string;
  product?: StoredProduct;
  mode: 'firebase' | 'local';
}> => {
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

  try {
    const saved = await saveFirebaseProduct(testProduct, 'system-test');
    
    if (saved) {
      const mode = firebaseAvailable ? 'firebase' : 'local';
      console.log(`✅ Тестовый товар сохранён (${mode}):`, saved);
      return {
        success: true,
        message: firebaseAvailable 
          ? 'Firebase подключен! Тестовый товар добавлен.'
          : 'Firebase недоступен. Товары сохраняются локально.',
        product: saved,
        mode
      };
    }
    
    return {
      success: false,
      message: 'Не удалось сохранить тестовый товар',
      mode: 'local'
    };
  } catch (error: any) {
    console.error('❌ Ошибка тестирования:', error);
    return {
      success: false,
      message: error.message || 'Ошибка сохранения',
      mode: 'local'
    };
  }
};

// Инициализация с тестовыми товарами
export const initializeWithTestProducts = async (): Promise<{
  success: boolean;
  message: string;
  count: number;
}> => {
  const testProducts: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>[] = [
    {
      barcode: '4607001234501',
      name: 'Молоко 3.2%',
      category: 'Молочные продукты',
      purchasePrice: 65,
      retailPrice: 89,
      quantity: 50,
      unit: 'шт',
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      photos: [],
      paymentType: 'full',
      paidAmount: 0,
      debtAmount: 0,
      addedBy: 'system'
    },
    {
      barcode: '4607001234502',
      name: 'Хлеб белый',
      category: 'Хлебобулочные',
      purchasePrice: 32,
      retailPrice: 45,
      quantity: 30,
      unit: 'шт',
      expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      photos: [],
      paymentType: 'full',
      paidAmount: 0,
      debtAmount: 0,
      addedBy: 'system'
    },
    {
      barcode: '4607001234503',
      name: 'Сок яблочный 1л',
      category: 'Напитки',
      purchasePrice: 75,
      retailPrice: 99,
      quantity: 25,
      unit: 'шт',
      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      photos: [],
      paymentType: 'full',
      paidAmount: 0,
      debtAmount: 0,
      addedBy: 'system'
    },
    {
      barcode: '4607001234504',
      name: 'Печенье овсяное',
      category: 'Кондитерские',
      purchasePrice: 55,
      retailPrice: 79,
      quantity: 40,
      unit: 'шт',
      expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      photos: [],
      paymentType: 'full',
      paidAmount: 0,
      debtAmount: 0,
      addedBy: 'system'
    },
    {
      barcode: '4607001234505',
      name: 'Сыр Российский 200г',
      category: 'Молочные продукты',
      purchasePrice: 180,
      retailPrice: 249,
      quantity: 15,
      unit: 'шт',
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      photos: [],
      paymentType: 'full',
      paidAmount: 0,
      debtAmount: 0,
      addedBy: 'system'
    }
  ];
  
  let count = 0;
  
  for (const product of testProducts) {
    try {
      // Проверяем, нет ли уже такого товара
      const existing = await findFirebaseProductByBarcode(product.barcode);
      if (!existing) {
        await saveFirebaseProduct(product, 'system');
        count++;
      }
    } catch (e) {
      console.warn('Ошибка добавления товара:', product.name);
    }
  }
  
  return {
    success: true,
    message: count > 0 
      ? `Добавлено ${count} тестовых товаров` 
      : 'Тестовые товары уже существуют',
    count
  };
};

// Очистить все товары (Firebase + localStorage)
export const clearAllFirebaseProducts = async (): Promise<{
  success: boolean;
  message: string;
  deletedCount: number;
}> => {
  let deletedCount = 0;
  
  if (firebaseAvailable) {
    try {
      const querySnapshot = await Promise.race([
        getDocs(collection(firebaseDb, PRODUCTS_COLLECTION)),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 10000)
        )
      ]);
      
      const deletePromises: Promise<void>[] = [];
      querySnapshot.forEach((docSnap) => {
        deletePromises.push(deleteDoc(docSnap.ref));
        deletedCount++;
      });
      
      await Promise.all(deletePromises);
      console.log(`✅ Удалено ${deletedCount} товаров из Firebase`);
    } catch (error: any) {
      console.warn('⚠️ Ошибка очистки Firebase:', error.message);
    }
  }
  
  // Очищаем localStorage
  const localProducts = getLocalProducts();
  const localCount = localProducts.length;
  localStorage.removeItem(LOCAL_STORAGE_KEY);
  console.log(`✅ Очищено ${localCount} товаров локально`);
  
  return {
    success: true,
    message: `Удалено ${deletedCount} товаров из Firebase, ${localCount} локально`,
    deletedCount: deletedCount + localCount
  };
};

// Проверить статус Firebase
export const getFirebaseStatus = (): { available: boolean; mode: string } => {
  return {
    available: firebaseAvailable,
    mode: firebaseAvailable ? 'Firebase' : 'Локальное хранилище'
  };
};

// Повторно включить Firebase (для попытки переподключения)
export const retryFirebaseConnection = () => {
  firebaseAvailable = true;
};
