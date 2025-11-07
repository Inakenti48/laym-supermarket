import { useState, useEffect } from 'react';
import { Package, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PendingProductItem, PendingProduct } from './PendingProductItem';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { saveProduct, saveProductImage } from '@/lib/storage';
import { addLog } from '@/lib/auth';
import { getSuppliers, Supplier } from '@/lib/suppliersDb';

export const PendingProductsTab = () => {
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Загрузка поставщиков
  useEffect(() => {
    const loadSuppliers = async () => {
      const loadedSuppliers = await getSuppliers();
      setSuppliers(loadedSuppliers);
    };

    loadSuppliers();

    // Подписка на изменения поставщиков
    const channel = supabase
      .channel('suppliers_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'suppliers'
        },
        () => {
          loadSuppliers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Загрузка временных товаров
  useEffect(() => {
    const fetchPendingProducts = async () => {
      const { data, error } = await supabase
        .from('vremenno_product_foto')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching pending products:', error);
        return;
      }

      if (data) {
        const products = data.map((item: any) => ({
          id: item.id,
          barcode: item.barcode || '',
          name: item.name || '',
          category: item.category || '',
          purchasePrice: item.purchase_price?.toString() || '',
          retailPrice: item.retail_price?.toString() || '',
          quantity: item.quantity?.toString() || '',
          unit: (item.unit || 'шт') as 'шт' | 'кг',
          expiryDate: item.expiry_date || '',
          supplier: item.supplier || '',
          photos: [item.front_photo, item.barcode_photo].filter(Boolean) as string[],
        }));
        setPendingProducts(products);
      }
    };

    fetchPendingProducts();

    // Realtime подписка на изменения
    const channel = supabase
      .channel('pending_products_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vremenno_product_foto'
        },
        () => {
          fetchPendingProducts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleUpdatePendingProduct = (id: string, updates: Partial<PendingProduct>) => {
    // Обновляем только локальный state, так как vremenno_product_foto
    // хранит только базовую информацию (barcode, product_name, image_url)
    setPendingProducts(prev =>
      prev.map(p => p.id === id ? { ...p, ...updates } : p)
    );
  };

  const handleRemovePendingProduct = async (id: string) => {
    const { error } = await supabase
      .from('vremenno_product_foto')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error removing pending product:', error);
      toast.error('Ошибка удаления товара');
      return;
    }

    setPendingProducts(prev => prev.filter(p => p.id !== id));
    toast.success('Товар удален из очереди');
  };

  const handleSaveAllProducts = async () => {
    if (pendingProducts.length === 0) {
      toast.info('Нет товаров для сохранения');
      return;
    }

    const allComplete = pendingProducts.every(p =>
      p.name && p.category && p.purchasePrice && p.retailPrice && p.quantity
    );

    if (!allComplete) {
      toast.error('Заполните все обязательные поля для всех товаров');
      return;
    }

    // Получаем текущего пользователя
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Необходима авторизация');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const product of pendingProducts) {
      try {
        const supplier = suppliers.find(s => s.name === product.supplier);

        const productData = {
          barcode: product.barcode,
          name: product.name,
          category: product.category,
          purchasePrice: parseFloat(product.purchasePrice),
          retailPrice: parseFloat(product.retailPrice),
          quantity: parseFloat(product.quantity),
          unit: product.unit,
          expiryDate: product.expiryDate || undefined,
          supplier: product.supplier,
          supplierPhone: supplier?.phone,
          paymentType: 'full' as const,
          paidAmount: parseFloat(product.purchasePrice) * parseFloat(product.quantity),
          debtAmount: 0,
          addedBy: user.id,
          photos: [],
        };

        await saveProduct(productData, user.id);

        if (product.photos && product.photos.length > 0) {
          for (const photo of product.photos) {
            await saveProductImage(product.barcode, product.name, photo);
          }
        }

        await supabase
          .from('vremenno_product_foto')
          .delete()
          .eq('id', product.id);

        addLog(`Товар ${product.name} (${product.barcode}) добавлен через очередь`);

        successCount++;
      } catch (error) {
        console.error('Error saving product:', error);
        errorCount++;
      }
    }

    setPendingProducts([]);

    if (successCount > 0) {
      toast.success(`Успешно добавлено товаров: ${successCount}`);
    }
    if (errorCount > 0) {
      toast.error(`Ошибок при добавлении: ${errorCount}`);
    }
  };

  const handleClearAllProducts = async () => {
    if (pendingProducts.length === 0) return;

    const { error } = await supabase
      .from('vremenno_product_foto')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
      console.error('Error clearing pending products:', error);
      toast.error('Ошибка очистки очереди');
      return;
    }

    setPendingProducts([]);
    toast.success('Очередь очищена');
  };

  const allComplete = pendingProducts.length > 0 && pendingProducts.every(p =>
    p.name && p.category && p.purchasePrice && p.retailPrice && p.quantity
  );

  return (
    <div className="space-y-4">
      <Card className="w-full bg-card">
        <div className="p-6 border-b space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-lg">Очередь товаров</h3>
            </div>
            <span className="text-sm text-muted-foreground font-medium">
              Всего: {pendingProducts.length}
            </span>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleSaveAllProducts}
              disabled={!allComplete}
              className="flex-1 h-10"
            >
              <Save className="h-4 w-4 mr-2" />
              Занести все ({pendingProducts.length})
            </Button>
            <Button
              onClick={handleClearAllProducts}
              variant="outline"
              size="icon"
              disabled={pendingProducts.length === 0}
              className="h-10 w-10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-6">
          {pendingProducts.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-base font-medium">Очередь пуста</p>
              <p className="text-sm mt-2">Отсканируйте товары в разделе "Товары" для добавления в очередь</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingProducts.map((product) => (
                <PendingProductItem
                  key={product.id}
                  product={product}
                  onUpdate={handleUpdatePendingProduct}
                  onRemove={handleRemovePendingProduct}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
