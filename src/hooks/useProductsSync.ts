import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ProductChange {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  old?: any;
  new?: any;
}

export const useProductsSync = (onProductsChange?: () => void) => {
  const handleProductChange = useCallback((payload: ProductChange) => {
    console.log('🔄 Realtime product change:', payload);

    if (payload.type === 'INSERT' && payload.new) {
      toast.success(`📦 Новый товар: ${payload.new.name}`, {
        description: `Штрихкод: ${payload.new.barcode}`,
        duration: 3000
      });
    } else if (payload.type === 'UPDATE' && payload.new) {
      toast.info(`✏️ Обновлен: ${payload.new.name}`, {
        description: 'Цены или количество изменены',
        duration: 3000
      });
    } else if (payload.type === 'DELETE' && payload.old) {
      toast.info(`🗑️ Удален товар: ${payload.old.name}`, {
        duration: 3000
      });
    }

    // Вызываем колбэк для обновления локального состояния
    onProductsChange?.();
  }, [onProductsChange]);

  useEffect(() => {
    console.log('🔌 Подключение realtime синхронизации товаров...');

    const productsChannel = supabase
      .channel('products_realtime_sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        (payload: any) => {
          handleProductChange({
            type: payload.eventType,
            old: payload.old,
            new: payload.new
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime синхронизация товаров активна');
        }
      });

    return () => {
      console.log('🔌 Отключение realtime синхронизации товаров');
      supabase.removeChannel(productsChannel);
    };
  }, [handleProductChange]);

  return null;
};
