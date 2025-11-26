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
import { getCurrentLoginUser } from '@/lib/loginAuth';

export const PendingProductsTab = () => {
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const ITEMS_PER_PAGE = 50;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Обработчик добавления нового поставщика
  const handleSupplierAdded = (newSupplier: Supplier) => {
    setSuppliers(prev => [...prev, newSupplier]);
  };

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

  // Загрузка временных товаров с пагинацией
  useEffect(() => {
    let isMounted = true;

    const fetchPendingProducts = async (forceLoad = false) => {
      if (!isMounted) return;
      
      setIsLoading(true);
      
      try {
        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        console.log(`Загрузка товаров: страница ${currentPage}, диапазон ${from}-${to}`);

        // Для первой загрузки считаем точное количество, дальше используем быстрый режим
        const { data, count, error } = await supabase
          .from('vremenno_product_foto')
          .select('*', { count: forceLoad ? 'exact' : 'planned' })
          .order('created_at', { ascending: true })
          .range(from, to);

        if (error) {
          console.error('Ошибка загрузки товаров:', error);
          throw error;
        }

        if (!isMounted) return;

        console.log(`Получено товаров: ${data?.length || 0} из ${count || 0}`);
        
        setTotalCount(count || 0);
        
        if (data && data.length > 0) {
          const products = data.map((item: any) => ({
            id: item.id,
            barcode: item.barcode || '',
            name: item.product_name || '',
            category: item.category || '',
            purchasePrice: item.purchase_price?.toString() || '',
            retailPrice: item.retail_price?.toString() || '',
            quantity: item.quantity?.toString() || '',
            unit: 'шт',
            expiryDate: item.expiry_date || '',
            supplier: item.supplier || '',
            frontPhoto: item.front_photo || undefined,
            barcodePhoto: item.barcode_photo || undefined,
            photos: item.image_url ? [item.image_url] : [],
          }));
          setPendingProducts(products);
        } else {
          setPendingProducts([]);
        }
      } catch (error: any) {
        console.error('Ошибка при загрузке товаров:', error);
        if (isMounted) {
          setPendingProducts([]);
          toast.error('Ошибка при загрузке товаров', { position: 'top-center' });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Мгновенная загрузка без задержек
    fetchPendingProducts(true);

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
          if (isMounted) {
            fetchPendingProducts();
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [currentPage]);

  const handleUpdatePendingProduct = async (id: string, updates: Partial<PendingProduct>) => {
    // Обновляем и в базе и в локальном state
    const product = pendingProducts.find(p => p.id === id);
    if (!product) return;

    const updatedProduct = { ...product, ...updates };

    try {
      const { error } = await supabase
        .from('vremenno_product_foto')
        .update({
          barcode: updatedProduct.barcode,
          product_name: updatedProduct.name,
          category: updatedProduct.category,
          supplier: updatedProduct.supplier || null,
          unit: updatedProduct.unit,
          purchase_price: updatedProduct.purchasePrice ? parseFloat(updatedProduct.purchasePrice) : null,
          retail_price: updatedProduct.retailPrice ? parseFloat(updatedProduct.retailPrice) : null,
          quantity: updatedProduct.quantity ? parseFloat(updatedProduct.quantity) : null,
          expiry_date: updatedProduct.expiryDate || null,
        })
        .eq('id', id);

      if (error) return;

      setPendingProducts(prev =>
        prev.map(p => p.id === id ? updatedProduct : p)
      );
    } catch (error: any) {
      // Silent fail
    }
  };

  const handleRemovePendingProduct = async (id: string) => {
    try {
      const { error } = await supabase
        .from('vremenno_product_foto')
        .delete()
        .eq('id', id);

      if (error) return;

      setPendingProducts(prev => prev.filter(p => p.id !== id));
      toast.success('Товар удален из очереди');
    } catch (error: any) {
      // Silent fail
    }
  };

  const handleSaveSingleProduct = async (id: string) => {
    const product = pendingProducts.find(p => p.id === id);
    if (!product) return;

    // Проверяем обязательные поля
    if (!product.barcode || !product.name || !product.category || !product.purchasePrice || !product.retailPrice || !product.quantity) {
      toast.error('Заполните все обязательные поля (штрихкод, название, категория, цены, количество)');
      return;
    }

    if (!product.frontPhoto && !product.barcodePhoto && product.photos.length === 0) {
      toast.error('Добавьте хотя бы одну фотографию');
      return;
    }

    try {
      
      const loginUser = await getCurrentLoginUser();
      const userId = loginUser?.id;
      
      if (!userId) {
        toast.error('Ошибка: не удалось определить пользователя. Попробуйте перезайти в систему.');
        return;
      }
      
      const supplier = suppliers.find(s => s.name === product.supplier);

      const productData = {
        barcode: product.barcode,
        name: product.name,
        category: product.category,
        purchasePrice: parseFloat(product.purchasePrice),
        retailPrice: parseFloat(product.retailPrice),
        quantity: parseFloat(product.quantity),
        unit: 'шт' as const,
        expiryDate: product.expiryDate || undefined,
        supplier: product.supplier,
        supplierPhone: supplier?.phone,
        paymentType: 'full' as const,
        paidAmount: parseFloat(product.purchasePrice) * parseFloat(product.quantity),
        debtAmount: 0,
        addedBy: userId,
        photos: [],
      };

      await saveProduct(productData, userId);

      const allPhotos = [
        ...(product.frontPhoto ? [product.frontPhoto] : []),
        ...(product.barcodePhoto ? [product.barcodePhoto] : []),
        ...product.photos
      ];

      for (const photo of allPhotos) {
        await saveProductImage(product.barcode, product.name, photo, userId);
      }

      const { error: deleteError } = await supabase
        .from('vremenno_product_foto')
        .delete()
        .eq('id', id);

      addLog(`Товар ${product.name} (${product.barcode}) добавлен через очередь`);

      setPendingProducts(prev => prev.filter(p => p.id !== id));
      toast.success(`✅ Товар "${product.name}" успешно добавлен`);
    } catch (error: any) {
      toast.error(`❌ Ошибка при добавлении товара`);
    }
  };

  const handleTransferAllReady = async (autoMode = false) => {
    if (totalCount === 0) {
      if (!autoMode) toast.info('Очередь пуста');
      return;
    }

    // Запрашиваем подтверждение только при первом ручном запуске
    if (!autoMode) {
      const confirmTransfer = window.confirm(
        `Запустить перенос ВСЕХ готовых товаров?\n\n` +
        `Незаполненные товары останутся в очереди.`
      );

      if (!confirmTransfer) return;
    }

    try {
      if (!autoMode) {
        toast.loading('🔄 Запуск переноса...', { id: 'transfer' });
      }
      
      console.log('🚀 Запуск переноса готовых товаров...');
      
      // Получаем все готовые товары из очереди
      const { data: queueItems, error } = await supabase
        .from('vremenno_product_foto')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Ошибка загрузки очереди:', error);
        toast.error('Ошибка при загрузке товаров', { id: 'transfer' });
        return;
      }

      if (!queueItems || queueItems.length === 0) {
        toast.info('Нет товаров для переноса', { id: 'transfer' });
        return;
      }

      const loginUser = await getCurrentLoginUser();
      const userId = loginUser?.id;
      
      if (!userId) {
        toast.error('Ошибка: не удалось определить пользователя', { id: 'transfer' });
        return;
      }

      let transferred = 0;
      let skipped = 0;

      for (const item of queueItems) {
        // Проверяем, готов ли товар
        const isReady = item.barcode && item.product_name && item.category && 
                       item.purchase_price && item.retail_price && item.quantity &&
                       (item.front_photo || item.barcode_photo || item.image_url);

        if (!isReady) {
          skipped++;
          continue;
        }

        try {
          const supplier = suppliers.find(s => s.name === item.supplier);

          const paymentType = (item.payment_type === 'debt' || item.payment_type === 'partial') 
            ? item.payment_type 
            : 'full';

          const productData = {
            barcode: String(item.barcode),
            name: String(item.product_name),
            category: String(item.category),
            purchasePrice: parseFloat(String(item.purchase_price)),
            retailPrice: parseFloat(String(item.retail_price)),
            quantity: parseFloat(String(item.quantity)),
            unit: 'шт' as const,
            expiryDate: item.expiry_date ? String(item.expiry_date) : undefined,
            supplier: item.supplier ? String(item.supplier) : undefined,
            supplierPhone: supplier?.phone,
            paymentType: paymentType as 'full' | 'partial' | 'debt',
            paidAmount: Number(item.paid_amount) || (parseFloat(String(item.purchase_price)) * parseFloat(String(item.quantity))),
            debtAmount: Number(item.debt_amount) || 0,
            addedBy: String(userId),
            photos: [],
          };

          await saveProduct(productData, userId);

          const allPhotos = [
            ...(item.front_photo ? [item.front_photo] : []),
            ...(item.barcode_photo ? [item.barcode_photo] : []),
            ...(item.image_url ? [item.image_url] : [])
          ];

          for (const photo of allPhotos) {
            await saveProductImage(item.barcode, item.product_name, photo, userId);
          }

          await supabase
            .from('vremenno_product_foto')
            .delete()
            .eq('id', item.id);

          addLog(`Товар ${item.product_name} (${item.barcode}) перенесен из очереди`);
          transferred++;

          if (transferred % 5 === 0) {
            toast.loading(`✅ Перенесено: ${transferred}`, { id: 'transfer' });
          }
        } catch (error) {
          console.error(`Ошибка при переносе товара ${item.product_name}:`, error);
          skipped++;
        }
      }

      setCurrentPage(1);
      
      toast.success(
        `✅ Перенос завершен!\nПеренесено: ${transferred} | Пропущено: ${skipped}`,
        { id: 'transfer', duration: 5000 }
      );
      
      console.log(`✅ Перенос завершен. Перенесено: ${transferred}, Пропущено: ${skipped}`);
    } catch (error: any) {
      console.error('Ошибка переноса:', error);
      toast.error('Ошибка при переносе товаров', { id: 'transfer' });
    }
  };

  const handleSaveAllProducts = async () => {
    if (pendingProducts.length === 0) {
      toast.info('Нет товаров для сохранения');
      return;
    }

    // Фильтруем только полностью заполненные товары
    const completeProducts = pendingProducts.filter(p =>
      p.barcode && p.name && p.category && p.purchasePrice && p.retailPrice && p.quantity &&
      (p.frontPhoto || p.barcodePhoto || p.photos.length > 0)
    );

    if (completeProducts.length === 0) {
      toast.error('Нет готовых товаров для сохранения. Заполните все обязательные поля и добавьте фотографии');
      return;
    }

    try {
      
      const loginUser = await getCurrentLoginUser();
      const userId = loginUser?.id;
      
      if (!userId) {
        toast.error('Не удалось получить ID пользователя');
        return;
      }

      let successCount = 0;
      let errorCount = 0;
      const skippedCount = pendingProducts.length - completeProducts.length;

      for (const product of completeProducts) {
        try {
          const supplier = suppliers.find(s => s.name === product.supplier);

          const productData = {
            barcode: product.barcode,
            name: product.name,
            category: product.category,
            purchasePrice: parseFloat(product.purchasePrice),
            retailPrice: parseFloat(product.retailPrice),
            quantity: parseFloat(product.quantity),
            unit: 'шт' as const,
            expiryDate: product.expiryDate || undefined,
            supplier: product.supplier,
            supplierPhone: supplier?.phone,
            paymentType: 'full' as const,
            paidAmount: parseFloat(product.purchasePrice) * parseFloat(product.quantity),
            debtAmount: 0,
            addedBy: userId,
            photos: [],
          };

          await saveProduct(productData, userId);

          const allPhotos = [
            ...(product.frontPhoto ? [product.frontPhoto] : []),
            ...(product.barcodePhoto ? [product.barcodePhoto] : []),
            ...product.photos
          ];

          for (const photo of allPhotos) {
            await saveProductImage(product.barcode, product.name, photo, userId);
          }

          await supabase
            .from('vremenno_product_foto')
            .delete()
            .eq('id', product.id);

          addLog(`Товар ${product.name} (${product.barcode}) добавлен через очередь`);

          successCount++;
        } catch (error: any) {
          errorCount++;
        }
      }

      setPendingProducts(prev => prev.filter(p => 
        !completeProducts.find(cp => cp.id === p.id)
      ));

      if (successCount > 0) {
        toast.success(`Успешно добавлено товаров: ${successCount}${skippedCount > 0 ? `. Пропущено: ${skippedCount}` : ''}`);
      }
      if (errorCount > 0) {
        toast.error(`Ошибок при добавлении: ${errorCount}`);
      }
    } catch (error: any) {
      toast.error('Ошибка при сохранении товаров');
    }
  };

  const handleClearAllProducts = async () => {
    if (pendingProducts.length === 0) return;

    try {
      await supabase
        .from('vremenno_product_foto')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      setPendingProducts([]);
      setTotalCount(0);
      toast.success('Очередь очищена');
    } catch (error: any) {
      // Silent fail
    }
  };

  const hasCompleteProducts = pendingProducts.length > 0 && pendingProducts.some(p =>
    p.barcode && p.name && p.category && p.purchasePrice && p.retailPrice && p.quantity &&
    (p.frontPhoto || p.barcodePhoto || p.photos.length > 0) // Хотя бы одна фотография
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
            <div className="flex flex-col items-end">
              <span className="text-lg font-bold text-primary">
                {totalCount} товаров
              </span>
              {totalPages > 1 && (
                <span className="text-xs text-muted-foreground">
                  Показано: {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => handleTransferAllReady(false)}
              disabled={totalCount === 0}
              variant="default"
              className="flex-1 h-10 bg-primary hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-2" />
              Перенести готовые
            </Button>
            <Button
              onClick={handleSaveAllProducts}
              disabled={!hasCompleteProducts}
              variant="outline"
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
          {isLoading ? (
            <div className="text-center text-muted-foreground py-12">
              <div className="h-16 w-16 mx-auto mb-4 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-base font-medium">Загрузка товаров...</p>
            </div>
          ) : pendingProducts.length === 0 ? (
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
                  suppliers={suppliers}
                  onUpdate={handleUpdatePendingProduct}
                  onRemove={handleRemovePendingProduct}
                  onSave={handleSaveSingleProduct}
                  onSupplierAdded={handleSupplierAdded}
                />
              ))}
            </div>
          )}

          {/* Пагинация */}
          {totalPages > 1 && (
            <div className="flex flex-col gap-3 mt-6 pt-6 border-t bg-muted/30 p-4 rounded-lg">
              <div className="text-center">
                <p className="text-sm font-medium mb-1">
                  Страница {currentPage} из {totalPages}
                </p>
                <p className="text-xs text-muted-foreground">
                  Товары {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)} из {totalCount}
                </p>
              </div>
              <div className="flex justify-center items-center gap-2">
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex-1 max-w-[140px]"
                >
                  ← Назад
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex-1 max-w-[140px]"
                >
                  Вперёд →
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
