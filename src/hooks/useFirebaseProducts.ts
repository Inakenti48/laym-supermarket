import { useState, useEffect } from 'react';
import { StoredProduct } from '@/lib/storage';
import { getAllFirebaseProducts, subscribeToFirebaseProducts, getFirebaseStatus } from '@/lib/firebaseProducts';

export const useFirebaseProducts = () => {
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await getAllFirebaseProducts();
      setProducts(data);
      setLoading(false);
    } catch (error) {
      console.error('Ошибка загрузки товаров:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Загружаем товары при монтировании
    fetchProducts();

    // Подписываемся на realtime обновления
    const unsubscribe = subscribeToFirebaseProducts((updatedProducts) => {
      const status = getFirebaseStatus();
      console.log(`🔄 ${status.mode} обновление:`, updatedProducts.length, 'товаров');
      setProducts(updatedProducts);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { products, loading, refetch: fetchProducts };
};

// Экспортируем для обратной совместимости
export const useRealtimeProducts = useFirebaseProducts;
