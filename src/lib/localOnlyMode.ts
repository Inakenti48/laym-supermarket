// MySQL режим работы
import { initLocalDB, saveProductLocally, getAllLocalData } from './localDatabase';
import { initPriceCache, findPriceByBarcode, findPriceByName } from './localPriceCache';
import { getAllProducts, getProductByBarcode, insertProduct, updateProduct } from './mysqlDatabase';
import { StoredProduct } from './storage';

// Флаг MySQL режима (всегда true теперь)
let mysqlMode = true;

export const isLocalOnlyMode = () => mysqlMode;
export const setLocalOnlyMode = (enabled: boolean) => {
  mysqlMode = enabled;
  localStorage.setItem('local_only_mode', enabled ? 'true' : 'false');
  console.log(enabled ? '🗃️ MySQL режим включен' : '☁️ Локальный режим');
};

// Инициализация при загрузке
export const initLocalMode = () => {
  mysqlMode = true; // Всегда MySQL
  return mysqlMode;
};

// Инициализация всех систем
export const initAllLocalSystems = async () => {
  await initLocalDB();
  await initPriceCache();
  console.log('✅ MySQL + кэш цен инициализированы');
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

// Получить все товары из MySQL
export const getLocalProducts = async (): Promise<LocalProduct[]> => {
  try {
    const products = await getAllProducts();
    return products.map(p => ({
      id: p.id,
      barcode: p.barcode || '',
      name: p.name || '',
      purchasePrice: p.purchase_price || 0,
      salePrice: p.sale_price || 0,
      quantity: p.quantity || 0,
      category: p.category,
      expiryDate: p.expiry_date,
      photos: [],
      addedBy: p.created_by,
      createdAt: p.created_at || '',
      updatedAt: p.updated_at || '',
    }));
  } catch (err) {
    console.warn('⚠️ MySQL недоступен, возвращаем пустой массив');
    return [];
  }
};

// Найти товар по штрихкоду в MySQL
export const findLocalProductByBarcode = async (barcode: string): Promise<LocalProduct | null> => {
  try {
    const product = await getProductByBarcode(barcode);
    if (!product) return null;
    return {
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      purchasePrice: product.purchase_price,
      salePrice: product.sale_price,
      quantity: product.quantity,
      category: product.category,
      expiryDate: product.expiry_date,
      photos: [],
      addedBy: product.created_by,
      createdAt: product.created_at || '',
      updatedAt: product.updated_at || '',
    };
  } catch {
    return null;
  }
};

// Сохранить или обновить товар в MySQL
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
  const userId = product.addedBy || 'system';
  
  try {
    if (existing) {
      await updateProduct(product.barcode, {
        name: product.name,
        category: product.category,
        purchase_price: product.purchasePrice,
        sale_price: product.salePrice,
        quantity: existing.quantity + product.quantity,
        expiry_date: product.expiryDate
      });
      
      return {
        isNew: false,
        product: {
          ...existing,
          name: product.name,
          purchasePrice: product.purchasePrice,
          salePrice: product.salePrice,
          quantity: existing.quantity + product.quantity,
          category: product.category,
          expiryDate: product.expiryDate,
          updatedAt: new Date().toISOString()
        }
      };
    } else {
      const result = await insertProduct({
        barcode: product.barcode,
        name: product.name,
        category: product.category || '',
        purchase_price: product.purchasePrice,
        sale_price: product.salePrice,
        quantity: product.quantity,
        unit: 'шт',
        expiry_date: product.expiryDate,
        created_by: userId
      });
      
      console.log('🗃️ Товар сохранён в MySQL:', product.barcode);
      
      return {
        isNew: true,
        product: {
          id: result.id || crypto.randomUUID(),
          barcode: product.barcode,
          name: product.name,
          purchasePrice: product.purchasePrice,
          salePrice: product.salePrice,
          quantity: product.quantity,
          category: product.category,
          expiryDate: product.expiryDate,
          photos: product.photos || [],
          addedBy: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      };
    }
  } catch (err: unknown) {
    console.error('❌ Ошибка сохранения в MySQL:', err);
    throw err;
  }
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
export const getLocalQueueProducts = async (): Promise<unknown[]> => {
  const db = await initLocalDB();
  const items = await db.getAll('products');
  return items
    .filter((item: { data: { isQueue?: boolean } }) => item.data.isQueue)
    .map((item: { id: string; data: Record<string, unknown>; createdAt: number }) => ({
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
    totalProducts: products.length,
    queueProducts: queue.length,
    totalQuantity: products.reduce((sum, p) => sum + (p.quantity || 0), 0),
  };
};
