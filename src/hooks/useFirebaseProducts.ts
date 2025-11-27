import { useState, useEffect } from 'react';
import { StoredProduct } from '@/lib/storage';
import { getAllFirebaseProducts, subscribeToFirebaseProducts } from '@/lib/firebaseProducts';
import { toast } from 'sonner';

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
      toast.error('Не удалось загрузить товары из Firebase');
      setLoading(false);
    }
  };

  useEffect(() => {
    // Загружаем товары при монтировании
    fetchProducts();

    // Подписываемся на realtime обновления Firebase
    const unsubscribe = subscribeToFirebaseProducts((updatedProducts) => {
      console.log('🔄 Firebase realtime обновление:', updatedProducts.length, 'товаров');
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
