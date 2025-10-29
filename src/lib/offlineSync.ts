import { supabase } from '@/integrations/supabase/client';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface OfflineSale {
  id: string;
  cashierName: string;
  cashierRole: string;
  items: any[];
  total: number;
  paymentMethod: string;
  createdAt: string;
}

interface OfflineDB extends DBSchema {
  sales: {
    key: string;
    value: OfflineSale;
  };
  products: {
    key: string;
    value: any;
  };
}

let db: IDBPDatabase<OfflineDB> | null = null;

// Инициализация IndexedDB
export const initOfflineDB = async (): Promise<void> => {
  db = await openDB<OfflineDB>('offline-store', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sales')) {
        db.createObjectStore('sales', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
    },
  });
};

// Сохранить продажу офлайн
export const saveOfflineSale = async (sale: OfflineSale): Promise<void> => {
  if (!db) await initOfflineDB();
  await db!.put('sales', sale);
};

// Получить все офлайн продажи
export const getOfflineSales = async (): Promise<OfflineSale[]> => {
  if (!db) await initOfflineDB();
  return await db!.getAll('sales');
};

// Удалить офлайн продажу
export const deleteOfflineSale = async (id: string): Promise<void> => {
  if (!db) await initOfflineDB();
  await db!.delete('sales', id);
};

// Синхронизировать офлайн продажи с сервером
export const syncOfflineSales = async (): Promise<{ synced: number; failed: number }> => {
  const sales = await getOfflineSales();
  let synced = 0;
  let failed = 0;

  for (const sale of sales) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.warn('Пользователь не авторизован, синхронизация отложена');
        failed++;
        continue;
      }

      const { error } = await supabase
        .from('sales')
        .insert({
          cashier_name: sale.cashierName,
          cashier_role: sale.cashierRole,
          items: sale.items,
          total: sale.total,
          payment_method: sale.paymentMethod,
          created_at: sale.createdAt,
          created_by: user.id,
          offline_id: sale.id,
          synced: true
        });

      if (error) {
        // Игнорируем ошибки дубликатов (уже синхронизировано)
        if (error.code === '23505') {
          await deleteOfflineSale(sale.id);
          synced++;
        } else {
          console.error('Ошибка синхронизации продажи:', error);
          failed++;
        }
      } else {
        await deleteOfflineSale(sale.id);
        synced++;
      }
    } catch (error) {
      console.error('Ошибка синхронизации:', error);
      failed++;
    }
  }

  return { synced, failed };
};

// Проверить доступность интернета
export const isOnline = (): boolean => {
  return navigator.onLine;
};

// Кэширование продуктов для офлайн-режима
export const cacheProductsForOffline = async (products: any[]): Promise<void> => {
  if (!db) await initOfflineDB();
  
  const tx = db!.transaction('products', 'readwrite');
  const store = tx.objectStore('products');
  
  await store.clear();
  
  for (const product of products) {
    await store.put(product);
  }
  
  await tx.done;
};

// Получить кэшированные продукты
export const getCachedProducts = async (): Promise<any[]> => {
  if (!db) await initOfflineDB();
  return await db!.getAll('products');
};

// Автоматическая синхронизация при восстановлении соединения
export const setupAutoSync = (onSync?: (result: { synced: number; failed: number }) => void): void => {
  window.addEventListener('online', async () => {
    console.log('🌐 Интернет восстановлен, начинаем синхронизацию...');
    const result = await syncOfflineSales();
    console.log(`✅ Синхронизировано: ${result.synced}, Ошибок: ${result.failed}`);
    
    if (onSync) {
      onSync(result);
    }
  });
};
