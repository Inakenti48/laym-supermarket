// Сервис синхронизации Firebase данных
import { firebaseDb } from './firebase';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { toast } from 'sonner';

let isSyncing = false;

// Проверка соединения с Firebase
export async function checkFirebaseConnection(): Promise<boolean> {
  try {
    const q = query(collection(firebaseDb, 'products'), limit(1));
    await getDocs(q);
    return true;
  } catch (error) {
    console.error('❌ Нет соединения с Firebase:', error);
    return false;
  }
}

// Синхронизация данных (для совместимости)
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
      toast.error('Нет соединения с интернетом');
    }
    return { success: false, synced: 0, errors: 0 };
  }

  isSyncing = true;

  try {
    if (showToast) {
      toast.info('Проверка соединения с Firebase...');
    }

    const connected = await checkFirebaseConnection();
    
    if (!connected) {
      if (showToast) {
        toast.error('Нет соединения с Firebase');
      }
      return { success: false, synced: 0, errors: 1 };
    }

    // Firebase автоматически синхронизирует данные
    localStorage.setItem('last-sync-time', Date.now().toString());

    if (showToast) {
      toast.success('✅ Синхронизация с Firebase активна');
    }

    return { success: true, synced: 1, errors: 0 };
  } catch (error: any) {
    console.error('❌ Ошибка синхронизации:', error);
    if (showToast) {
      toast.error('Ошибка синхронизации');
    }
    return { success: false, synced: 0, errors: 1 };
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
  const lastSyncTime = localStorage.getItem('last-sync-time');
  const lastSync = lastSyncTime ? new Date(parseInt(lastSyncTime)) : undefined;

  return {
    isOnline: navigator.onLine,
    lastSync,
    pending: 0, // Firebase синхронизирует автоматически
    errors: 0,
  };
}

// Принудительная синхронизация
export async function forceSyncNow(): Promise<void> {
  toast.info('Проверка синхронизации...');
  await syncToCloud(true);
}

// Фоновая синхронизация
export async function syncItemToCloud(): Promise<void> {
  if (!navigator.onLine) {
    console.log('📡 Нет соединения - Firebase офлайн режим');
    return;
  }
  
  // Firebase автоматически синхронизирует
  syncToCloud(false).catch(err => {
    console.error('Ошибка фоновой синхронизации:', err);
  });
}
