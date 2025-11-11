import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { StoredProduct } from '@/lib/storage';
import { toast } from 'sonner';

export const useRealtimeProducts = () => {
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      // ОПТИМИЗАЦИЯ: Загружаем только первые 500 товаров + пагинация при необходимости
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

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
          console.log('🔄 Realtime обновление:', payload.eventType);
          
          // Оптимизация: обновляем только измененный товар вместо перезагрузки всех
          if (payload.eventType === 'INSERT' && payload.new) {
            const newProduct: StoredProduct = {
              id: payload.new.id,
              barcode: payload.new.barcode,
              name: payload.new.name,
              category: payload.new.category,
              purchasePrice: Number(payload.new.purchase_price),
              retailPrice: Number(payload.new.sale_price),
              quantity: payload.new.quantity,
              unit: payload.new.unit as 'шт' | 'кг',
              expiryDate: payload.new.expiry_date || undefined,
              photos: [],
              paymentType: payload.new.payment_type as 'full' | 'partial' | 'debt',
              paidAmount: Number(payload.new.paid_amount),
              debtAmount: Number(payload.new.debt_amount),
              addedBy: payload.new.created_by || '',
              supplier: payload.new.supplier || undefined,
              lastUpdated: payload.new.updated_at,
              priceHistory: (payload.new.price_history as any) || []
            };
            setProducts(prev => [newProduct, ...prev]);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setProducts(prev => prev.map(p => 
              p.id === payload.new.id ? {
                id: payload.new.id,
                barcode: payload.new.barcode,
                name: payload.new.name,
                category: payload.new.category,
                purchasePrice: Number(payload.new.purchase_price),
                retailPrice: Number(payload.new.sale_price),
                quantity: payload.new.quantity,
                unit: payload.new.unit as 'шт' | 'кг',
                expiryDate: payload.new.expiry_date || undefined,
                photos: [],
                paymentType: payload.new.payment_type as 'full' | 'partial' | 'debt',
                paidAmount: Number(payload.new.paid_amount),
                debtAmount: Number(payload.new.debt_amount),
                addedBy: payload.new.created_by || '',
                supplier: payload.new.supplier || undefined,
                lastUpdated: payload.new.updated_at,
                priceHistory: (payload.new.price_history as any) || []
              } : p
            ));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setProducts(prev => prev.filter(p => p.id !== payload.old.id));
          }
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
