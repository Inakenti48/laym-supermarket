// Хук для уведомлений админа о новых товарах в очереди
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getQueueProducts, QueueProduct } from '@/lib/mysqlCollections';
import { getCurrentSession } from '@/lib/mysqlCollections';

export const useAdminNotifications = () => {
  const [queueCount, setQueueCount] = useState(0);
  const [newItems, setNewItems] = useState<QueueProduct[]>([]);
  const previousIdsRef = useRef<Set<string>>(new Set());
  const isAdmin = getCurrentSession()?.role === 'admin';
  const isInitializedRef = useRef(false);

  useEffect(() => {
    if (!isAdmin) return;

    const checkForNewItems = async () => {
      try {
        const items = await getQueueProducts();
        const currentIds = new Set(items.map(i => i.id));
        
        // Если это первая загрузка - просто запоминаем ID
        if (!isInitializedRef.current) {
          previousIdsRef.current = currentIds;
          setQueueCount(items.length);
          isInitializedRef.current = true;
          return;
        }

        // Находим новые товары
        const newItemsList: QueueProduct[] = [];
        for (const item of items) {
          if (!previousIdsRef.current.has(item.id)) {
            newItemsList.push(item);
          }
        }

        // Показываем уведомления о новых товарах
        if (newItemsList.length > 0) {
          setNewItems(newItemsList);
          
          // Уведомление (не мешает кнопкам - position: bottom-right)
          if (newItemsList.length === 1) {
            const item = newItemsList[0];
            toast.info(
              `📦 Новый товар в очереди: ${item.product_name || item.barcode || 'Без названия'}`,
              { 
                duration: 5000,
                position: 'bottom-right',
                style: { maxWidth: '300px' }
              }
            );
          } else {
            toast.info(
              `📦 Добавлено ${newItemsList.length} новых товаров в очередь`,
              { 
                duration: 5000,
                position: 'bottom-right'
              }
            );
          }
        }

        // Обновляем состояние
        previousIdsRef.current = currentIds;
        setQueueCount(items.length);

      } catch (error) {
        console.error('Error checking queue:', error);
      }
    };

    // Проверяем сразу
    checkForNewItems();

    // Проверяем каждые 5 секунд для быстрых уведомлений
    const interval = setInterval(checkForNewItems, 5000);

    return () => clearInterval(interval);
  }, [isAdmin]);

  return {
    queueCount,
    newItems,
    isAdmin
  };
};
