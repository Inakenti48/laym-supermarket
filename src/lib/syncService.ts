// Сервис автоматической синхронизации локальных данных с облачной базой
import { supabase } from '@/integrations/supabase/client';
import {
  initLocalDB,
  getPendingSyncItems,
  getSyncStats,
  cleanupSyncedItems,
} from './localDatabase';
import { toast } from 'sonner';

// Интервал синхронизации (30 минут)
const SYNC_INTERVAL = 30 * 60 * 1000;

// Флаг активности синхронизации
let syncIntervalId: number | null = null;
let isSyncing = false;

// Начать автоматическую синхронизацию
export function startAutoSync(): void {
  if (syncIntervalId !== null) {
    console.log('⚠️ Синхронизация уже запущена');
    return;
  }

  console.log('🔄 Запуск автоматической синхронизации каждые 30 минут');
  
  // Первая синхронизация через 1 минуту после запуска
  setTimeout(() => {
    syncToCloud();
  }, 60000);
  
  // Периодическая синхронизация каждые 30 минут
  syncIntervalId = window.setInterval(() => {
    syncToCloud();
  }, SYNC_INTERVAL);

  // Синхронизация при восстановлении соединения
  window.addEventListener('online', () => {
    console.log('📶 Соединение восстановлено - запуск синхронизации');
    toast.info('Соединение восстановлено. Синхронизация данных...');
    syncToCloud();
  });

  // Синхронизация перед закрытием страницы
  window.addEventListener('beforeunload', () => {
    if (!isSyncing) {
      syncToCloud();
    }
  });
}

// Остановить автоматическую синхронизацию
export function stopAutoSync(): void {
  if (syncIntervalId !== null) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('⏹️ Автоматическая синхронизация остановлена');
  }
}

// Синхронизация локальных данных с облаком
export async function syncToCloud(showToast: boolean = false): Promise<{
  success: boolean;
  synced: number;
  errors: number;
}> {
  if (isSyncing) {
    console.log('⚠️ Синхронизация уже выполняется');
    return { success: false, synced: 0, errors: 0 };
  }

  if (!navigator.onLine) {
    console.log('📡 Нет соединения с интернетом');
    if (showToast) {
      toast.error('Нет соединения. Данные будут синхронизированы позже.');
    }
    return { success: false, synced: 0, errors: 0 };
  }

  isSyncing = true;
  let syncedCount = 0;
  let errorCount = 0;

  try {
    console.log('🔄 Начало синхронизации с облаком...');
    if (showToast) {
      toast.info('Синхронизация с облаком...');
    }

    const db = await initLocalDB();
    const pending = await getPendingSyncItems();

    // Синхронизация товаров
    for (const item of pending.products) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('⚠️ Пользователь не авторизован, пропускаем синхронизацию');
          break;
        }

        const productData = {
          ...item.data,
          created_by: user.id,
        };

        const { data, error } = await supabase
          .from('products')
          .insert(productData)
          .select()
          .single();

        if (error) throw error;

        // Обновляем статус в локальной базе
        await db.put('products', {
          ...item,
          syncStatus: 'synced',
          updatedAt: Date.now(),
        });

        syncedCount++;
        console.log('✅ Товар синхронизирован:', item.data.name);
      } catch (error: any) {
        console.error('❌ Ошибка синхронизации товара:', error);
        await db.put('products', {
          ...item,
          syncStatus: 'error',
          syncError: error.message,
          lastSyncAttempt: Date.now(),
        });
        errorCount++;
      }
    }

    // Синхронизация поставщиков
    for (const item of pending.suppliers) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) break;

        const { data, error } = await supabase
          .from('suppliers')
          .insert({
            ...item.data,
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;

        await db.put('suppliers', {
          ...item,
          syncStatus: 'synced',
          updatedAt: Date.now(),
        });

        syncedCount++;
        console.log('✅ Поставщик синхронизирован:', item.data.name);
      } catch (error: any) {
        console.error('❌ Ошибка синхронизации поставщика:', error);
        await db.put('suppliers', {
          ...item,
          syncStatus: 'error',
          syncError: error.message,
          lastSyncAttempt: Date.now(),
        });
        errorCount++;
      }
    }

    // Синхронизация сотрудников
    for (const item of pending.employees) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) break;

        const { data, error } = await supabase
          .from('employees')
          .insert({
            ...item.data,
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw error;

        await db.put('employees', {
          ...item,
          syncStatus: 'synced',
          updatedAt: Date.now(),
        });

        syncedCount++;
        console.log('✅ Сотрудник синхронизирован:', item.data.name);
      } catch (error: any) {
        console.error('❌ Ошибка синхронизации сотрудника:', error);
        await db.put('employees', {
          ...item,
          syncStatus: 'error',
          syncError: error.message,
          lastSyncAttempt: Date.now(),
        });
        errorCount++;
      }
    }

    // Синхронизация логов
    for (const item of pending.logs) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) break;

        const { error } = await supabase
          .from('system_logs')
          .insert({
            message: item.message,
            user_id: item.userId || user.id,
            user_name: item.userName || 'Неизвестно',
          });

        if (error) throw error;

        await db.put('logs', {
          ...item,
          syncStatus: 'synced',
        });

        syncedCount++;
      } catch (error: any) {
        console.error('❌ Ошибка синхронизации лога:', error);
        await db.put('logs', {
          ...item,
          syncStatus: 'error',
          lastSyncAttempt: Date.now(),
        });
        errorCount++;
      }
    }

    // Синхронизация изображений
    for (const item of pending.images) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) break;

        // Конвертируем base64 в blob
        const base64Data = item.imageData.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        // Загружаем в Storage
        const fileName = `${item.barcode}-${Date.now()}.jpg`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, blob);

        if (uploadError) throw uploadError;

        // Получаем публичный URL
        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);

        // Сохраняем в базу
        const { error: dbError } = await supabase
          .from('product_images')
          .insert({
            barcode: item.barcode,
            product_name: item.productName,
            image_url: urlData.publicUrl,
            storage_path: fileName,
            created_by: user.id,
          });

        if (dbError) throw dbError;

        await db.put('product_images', {
          ...item,
          syncStatus: 'synced',
        });

        syncedCount++;
        console.log('✅ Изображение синхронизировано:', item.barcode);
      } catch (error: any) {
        console.error('❌ Ошибка синхронизации изображения:', error);
        await db.put('product_images', {
          ...item,
          syncStatus: 'error',
          lastSyncAttempt: Date.now(),
        });
        errorCount++;
      }
    }

    // Сохраняем время последней синхронизации
    localStorage.setItem('last-sync-time', Date.now().toString());

    // Очищаем старые синхронизированные данные
    await cleanupSyncedItems();

    console.log(`✅ Синхронизация завершена: ${syncedCount} успешно, ${errorCount} ошибок`);
    
    if (showToast) {
      if (syncedCount > 0) {
        toast.success(`✅ Синхронизировано: ${syncedCount} элементов`);
      }
      if (errorCount > 0) {
        toast.error(`⚠️ Ошибок синхронизации: ${errorCount}`);
      }
    }

    return { success: true, synced: syncedCount, errors: errorCount };
  } catch (error: any) {
    console.error('❌ Критическая ошибка синхронизации:', error);
    if (showToast) {
      toast.error('Ошибка синхронизации с облаком');
    }
    return { success: false, synced: syncedCount, errors: errorCount + 1 };
  } finally {
    isSyncing = false;
  }
}

// Получение статуса синхронизации
export async function getSyncStatus(): Promise<{
  isOnline: boolean;
  lastSync?: Date;
  pending: number;
  errors: number;
}> {
  const stats = await getSyncStats();
  const lastSyncTime = stats.lastSync ? new Date(stats.lastSync) : undefined;

  return {
    isOnline: navigator.onLine,
    lastSync: lastSyncTime,
    pending: stats.pending,
    errors: stats.errors,
  };
}

// Принудительная синхронизация (вызывается пользователем)
export async function forceSyncNow(): Promise<void> {
  toast.info('Начинаем синхронизацию...');
  await syncToCloud(true);
}
