import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StoredProduct } from '@/lib/storage';
import { toast } from 'sonner';

export const useRealtimeProducts = () => {
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedProducts: StoredProduct[] = (data || []).map(p => ({
        id: p.id,
        barcode: p.barcode,
        name: p.name,
        category: p.category,
        purchasePrice: Number(p.purchase_price),
        retailPrice: Number(p.sale_price),
        quantity: p.quantity,
        unit: p.unit as 'шт' | 'кг',
        expiryDate: p.expiry_date || undefined,
        photos: [],
        paymentType: p.payment_type as 'full' | 'partial' | 'debt',
        paidAmount: Number(p.paid_amount),
        debtAmount: Number(p.debt_amount),
        addedBy: p.created_by || '',
        supplier: p.supplier || undefined,
        lastUpdated: p.updated_at,
        priceHistory: (p.price_history as any) || []
      }));

      setProducts(mappedProducts);
      setLoading(false);
    } catch (error) {
      console.error('Ошибка загрузки товаров:', error);
      toast.error('Не удалось загрузить товары');
      setLoading(false);
    }
  };

  useEffect(() => {
    // Загружаем товары при монтировании
    fetchProducts();

    // Подписываемся на realtime обновления
    const channel = supabase
      .channel('products_table_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        (payload) => {
          console.log('🔄 Realtime обновление товаров:', payload.eventType);
          
          if (payload.eventType === 'INSERT' && payload.new) {
            toast.success(`✅ Добавлен товар: ${payload.new.name}`, {
              description: `На другом устройстве`,
              duration: 4000
            });
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            toast.info(`📝 Обновлен товар: ${payload.new.name}`, {
              description: `На другом устройстве`,
              duration: 4000
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            toast.info(`🗑️ Удален товар: ${payload.old.name}`, {
              description: `На другом устройстве`,
              duration: 4000
            });
          }

          // Перезагружаем список товаров
          fetchProducts();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime подписка на товары активна');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { products, loading, refetch: fetchProducts };
};
