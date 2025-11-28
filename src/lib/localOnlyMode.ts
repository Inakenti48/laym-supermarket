// Локальный режим работы без Supabase
import { initLocalDB, saveProductLocally, getAllLocalData } from './localDatabase';
import { initPriceCache, findPriceByBarcode, findPriceByName } from './localPriceCache';

// Флаг локального режима
let localOnlyMode = true;

export const isLocalOnlyMode = () => localOnlyMode;
export const setLocalOnlyMode = (enabled: boolean) => {
  localOnlyMode = enabled;
  localStorage.setItem('local_only_mode', enabled ? 'true' : 'false');
  console.log(enabled ? '📦 Локальный режим включен' : '☁️ Облачный режим включен');
};

// Инициализация при загрузке
export const initLocalMode = () => {
  const saved = localStorage.getItem('local_only_mode');
  localOnlyMode = saved !== 'false'; // По умолчанию локальный режим
  return localOnlyMode;
};

// Инициализация всех локальных систем
export const initAllLocalSystems = async () => {
  await initLocalDB();
  await initPriceCache();
  console.log('✅ Все локальные системы инициализированы');
};

// Интерфейс для локального товара
export interface LocalProduct {
  id: string;
  barcode: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  category?: string;
  expiryDate?: string;
  photos?: string[];
  addedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// Получить все локальные товары
export const getLocalProducts = async (): Promise<LocalProduct[]> => {
  const db = await initLocalDB();
  const items = await db.getAll('products');
  return items.map(item => ({
    id: item.id,
    barcode: item.data.barcode || '',
    name: item.data.name || '',
    purchasePrice: item.data.purchasePrice || 0,
    salePrice: item.data.salePrice || item.data.retailPrice || 0,
    quantity: item.data.quantity || 0,
    category: item.data.category,
    expiryDate: item.data.expiryDate,
    photos: item.data.photos,
    addedBy: item.data.addedBy,
    createdAt: new Date(item.createdAt).toISOString(),
    updatedAt: new Date(item.updatedAt).toISOString(),
  }));
};

// Найти локальный товар по штрихкоду
export const findLocalProductByBarcode = async (barcode: string): Promise<LocalProduct | null> => {
  const products = await getLocalProducts();
  return products.find(p => p.barcode === barcode) || null;
};

// Сохранить или обновить товар локально
export const saveOrUpdateLocalProduct = async (product: {
  barcode: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  category?: string;
  expiryDate?: string;
  photos?: string[];
  addedBy?: string;
}): Promise<{ isNew: boolean; product: LocalProduct }> => {
  const existing = await findLocalProductByBarcode(product.barcode);
  const now = Date.now();
  
  if (existing) {
    // Обновляем количество
    const db = await initLocalDB();
    const updated = {
      ...existing,
      quantity: existing.quantity + product.quantity,
      name: product.name || existing.name,
      purchasePrice: product.purchasePrice || existing.purchasePrice,
      salePrice: product.salePrice || existing.salePrice,
      category: product.category || existing.category,
      updatedAt: new Date(now).toISOString(),
    };
    
    await db.put('products', {
      id: existing.id,
      data: updated,
      syncStatus: 'pending',
      createdAt: new Date(existing.createdAt).getTime(),
      updatedAt: now,
    });
    
    console.log('📦 Товар обновлён локально:', product.barcode);
    return { isNew: false, product: updated };
  }
  
  // Создаём новый товар
  const newProduct: LocalProduct = {
    id: `local-${now}-${Math.random().toString(36).substr(2, 9)}`,
    barcode: product.barcode,
    name: product.name,
    purchasePrice: product.purchasePrice,
    salePrice: product.salePrice,
    quantity: product.quantity,
    category: product.category,
    expiryDate: product.expiryDate,
    photos: product.photos,
    addedBy: product.addedBy,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  
  await saveProductLocally(newProduct);
  console.log('📦 Новый товар сохранён локально:', product.barcode);
  return { isNew: true, product: newProduct };
};

// Сохранить товар в очередь (для товаров без цены)
export const saveToLocalQueue = async (item: {
  barcode?: string;
  recognizedName?: string;
  imageData?: string;
  addedBy?: string;
}): Promise<string> => {
  const db = await initLocalDB();
  const id = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.put('products', {
    id,
    data: {
      ...item,
      status: 'pending',
      isQueue: true,
    },
    syncStatus: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  
  console.log('📦 Товар добавлен в локальную очередь:', id);
  return id;
};

// Получить товары из локальной очереди
export const getLocalQueueProducts = async (): Promise<any[]> => {
  const db = await initLocalDB();
  const items = await db.getAll('products');
  return items
    .filter(item => item.data.isQueue)
    .map(item => ({
      id: item.id,
      ...item.data,
      createdAt: new Date(item.createdAt).toISOString(),
    }));
};

// Удалить из очереди и добавить как товар
export const promoteFromQueue = async (queueId: string, productData: {
  barcode: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
}): Promise<LocalProduct> => {
  const db = await initLocalDB();
  
  // Удаляем из очереди
  await db.delete('products', queueId);
  
  // Добавляем как обычный товар
  const result = await saveOrUpdateLocalProduct(productData);
  return result.product;
};

// Статистика локальной базы
export const getLocalStats = async (): Promise<{
  totalProducts: number;
  queueProducts: number;
  totalQuantity: number;
}> => {
  const products = await getLocalProducts();
  const queue = await getLocalQueueProducts();
  
  return {
    totalProducts: products.filter(p => !('isQueue' in p)).length,
    queueProducts: queue.length,
    totalQuantity: products.reduce((sum, p) => sum + (p.quantity || 0), 0),
  };
};
