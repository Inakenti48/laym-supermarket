// Хук для Firebase синхронизации товаров
import { useEffect, useCallback } from 'react';
import { firebaseDb } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';

interface ProductChange {
  type: 'added' | 'modified' | 'removed';
  data: any;
}

export const useFirebaseSync = (onProductsChange?: () => void) => {
  const handleProductChange = useCallback((changes: ProductChange[]) => {
    changes.forEach(change => {
      if (change.type === 'added' && change.data?.name) {
        console.log('📦 Новый товар:', change.data.name);
      } else if (change.type === 'modified' && change.data?.name) {
        console.log('✏️ Обновлен:', change.data.name);
      } else if (change.type === 'removed' && change.data?.name) {
        console.log('🗑️ Удален:', change.data.name);
      }
    });

    // Вызываем колбэк для обновления локального состояния
    onProductsChange?.();
  }, [onProductsChange]);

  useEffect(() => {
    console.log('🔌 Подключение Firebase realtime синхронизации...');

    const unsubscribe = onSnapshot(
      collection(firebaseDb, 'products'),
      (snapshot) => {
        const changes: ProductChange[] = snapshot.docChanges().map(change => ({
          type: change.type,
          data: change.doc.data()
        }));

        if (changes.length > 0) {
          handleProductChange(changes);
        }
      },
      (error) => {
        console.error('❌ Ошибка Firebase realtime:', error);
      }
    );

    console.log('✅ Firebase realtime синхронизация активна');

    return () => {
      console.log('🔌 Отключение Firebase realtime синхронизации');
      unsubscribe();
    };
  }, [handleProductChange]);

  return null;
};

// Экспорт для обратной совместимости
export const useProductsSync = useFirebaseSync;
