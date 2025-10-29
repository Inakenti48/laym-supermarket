import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { supabase } from '@/integrations/supabase/client';
import { Supplier } from './suppliersDb';

interface OfflineSupplier {
  localId: string;
  name: string;
  phone: string;
  contact_person: string | null;
  address: string | null;
  debt: number;
  payment_history: any[];
  syncStatus: 'pending' | 'synced' | 'error';
  lastAttempt?: string;
}

interface SuppliersOfflineDB extends DBSchema {
  suppliers: {
    key: string;
    value: OfflineSupplier;
  };
}

let dbInstance: IDBPDatabase<SuppliersOfflineDB> | null = null;

// Инициализация локальной БД
const initOfflineDB = async (): Promise<IDBPDatabase<SuppliersOfflineDB>> => {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<SuppliersOfflineDB>('suppliers-offline-db', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('suppliers')) {
        db.createObjectStore('suppliers', { keyPath: 'localId' });
      }
    },
  });

  return dbInstance;
};

// Сохранить поставщика локально
export const saveSupplierOffline = async (supplier: {
  name: string;
  phone: string;
  contact_person: string | null;
  address: string | null;
  debt: number;
  payment_history: any[];
  created_by: string;
}): Promise<string> => {
  try {
    const db = await initOfflineDB();
    const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const offlineSupplier: OfflineSupplier = {
      ...supplier,
      localId,
      syncStatus: 'pending',
    };

    await db.put('suppliers', offlineSupplier);
    console.log('✅ Поставщик сохранен локально:', localId);
    
    return localId;
  } catch (error) {
    console.error('❌ Ошибка сохранения локально:', error);
    throw error;
  }
};

// Получить все локальные поставщики
export const getOfflineSuppliers = async (): Promise<OfflineSupplier[]> => {
  try {
    const db = await initOfflineDB();
    return await db.getAll('suppliers');
  } catch (error) {
    console.error('❌ Ошибка получения локальных поставщиков:', error);
    return [];
  }
};

// Удалить локального поставщика после синхронизации
const deleteOfflineSupplier = async (localId: string): Promise<void> => {
  try {
    const db = await initOfflineDB();
    await db.delete('suppliers', localId);
  } catch (error) {
    console.error('❌ Ошибка удаления локального поставщика:', error);
  }
};

// Обновить статус синхронизации
const updateSyncStatus = async (localId: string, status: 'pending' | 'synced' | 'error'): Promise<void> => {
  try {
    const db = await initOfflineDB();
    const supplier = await db.get('suppliers', localId);
    if (supplier) {
      supplier.syncStatus = status;
      supplier.lastAttempt = new Date().toISOString();
      await db.put('suppliers', supplier);
    }
  } catch (error) {
    console.error('❌ Ошибка обновления статуса:', error);
  }
};

// Синхронизация с облаком
export const syncSuppliersToCloud = async (): Promise<{ synced: number; failed: number }> => {
  const offlineSuppliers = await getOfflineSuppliers();
  let synced = 0;
  let failed = 0;

  console.log(`📤 Начинаем синхронизацию ${offlineSuppliers.length} поставщиков...`);

  for (const supplier of offlineSuppliers) {
    if (supplier.syncStatus === 'synced') continue;

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.warn('⚠️ Пользователь не авторизован, пропускаем синхронизацию');
        break;
      }

      const supplierData = {
        name: supplier.name,
        phone: supplier.phone,
        contact_person: supplier.contact_person,
        address: supplier.address,
        debt: supplier.debt || 0,
        payment_history: supplier.payment_history || [],
        created_by: user.id,
      };

      const { error } = await supabase
        .from('suppliers')
        .insert(supplierData);

      if (error) throw error;

      await deleteOfflineSupplier(supplier.localId);
      synced++;
      console.log('✅ Поставщик синхронизирован:', supplier.name);
    } catch (error) {
      console.error('❌ Ошибка синхронизации поставщика:', error);
      await updateSyncStatus(supplier.localId, 'error');
      failed++;
    }
  }

  console.log(`✅ Синхронизация завершена: ${synced} успешно, ${failed} ошибок`);
  return { synced, failed };
};

// Получить количество несинхронизированных поставщиков
export const getPendingSuppliersCount = async (): Promise<number> => {
  const suppliers = await getOfflineSuppliers();
  return suppliers.filter(s => s.syncStatus === 'pending').length;
};

// Автоматическая синхронизация при восстановлении соединения
export const setupSuppliersAutoSync = (onSync?: (result: { synced: number; failed: number }) => void) => {
  window.addEventListener('online', async () => {
    console.log('🌐 Соединение восстановлено, начинаем синхронизацию поставщиков...');
    const result = await syncSuppliersToCloud();
    if (onSync) onSync(result);
  });
};
