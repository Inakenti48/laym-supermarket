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
    let loadTimeout: NodeJS.Timeout;

    const fetchPendingProducts = async () => {
      // Защита от параллельных загрузок
      if (isLoading) return;
      
      setIsLoading(true);
      try {
        // Получаем общее количество
        const { count, error: countError } = await supabase
          .from('vremenno_product_foto')
          .select('*', { count: 'exact', head: true });
        
        if (countError) {
          console.error('Error counting pending products:', countError);
          if (isMounted) setIsLoading(false);
          return;
        }
        
        if (isMounted) {
          setTotalCount(count || 0);
        }

        // Загружаем товары с пагинацией
        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        const { data, error } = await supabase
          .from('vremenno_product_foto')
          .select('*')
          .order('created_at', { ascending: true })
          .range(from, to);

        if (error) {
          console.error('Error fetching pending products:', error);
          if (isMounted) {
            toast.error('Ошибка загрузки очереди товаров');
            setIsLoading(false);
          }
          return;
        }

        if (data && isMounted) {
          const products = data.map((item: any) => ({
            id: item.id,
            barcode: item.barcode || '',
            name: item.product_name || '',
            category: item.category || '',
            purchasePrice: item.purchase_price?.toString() || '',
            retailPrice: item.retail_price?.toString() || '',
            quantity: item.quantity?.toString() || '',
            unit: (item.unit || 'шт') as 'шт' | 'кг',
            expiryDate: item.expiry_date || '',
            supplier: item.supplier || '',
            frontPhoto: item.front_photo || undefined,
            barcodePhoto: item.barcode_photo || undefined,
            photos: item.image_url ? [item.image_url] : [],
          }));
          setPendingProducts(products);
          console.log(`✅ Загружено ${products.length} из ${count} товаров (стр. ${currentPage})`);
        }
      } catch (error: any) {
        console.error('Network error loading pending products:', error);
        if (isMounted) {
          toast.error('Ошибка сети при загрузке очереди');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    // Debounced загрузка для realtime обновлений
    const debouncedFetch = () => {
      clearTimeout(loadTimeout);
      loadTimeout = setTimeout(() => {
        if (isMounted) {
          fetchPendingProducts();
        }
      }, 500);
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
          debouncedFetch();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      clearTimeout(loadTimeout);
      supabase.removeChannel(channel);
    };
  }, [currentPage, isLoading]);

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

      if (error) {
        console.error('Error updating pending product:', error);
        toast.error('Ошибка обновления товара');
        return;
      }

      setPendingProducts(prev =>
        prev.map(p => p.id === id ? updatedProduct : p)
      );
    } catch (error: any) {
      console.error('Network error:', error);
      if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch')) {
        toast.error('Ошибка сети. Проверьте подключение к интернету');
      } else {
        toast.error('Ошибка обновления товара');
      }
    }
  };

  const handleRemovePendingProduct = async (id: string) => {
    try {
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
    } catch (error: any) {
      console.error('Network error:', error);
      if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch')) {
        toast.error('Ошибка сети. Проверьте подключение к интернету');
      } else {
        toast.error('Ошибка удаления товара');
      }
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
      console.log('💾 Начало сохранения товара:', product.name);
      
      // Получаем пользователя из Supabase сессии
      const loginUser = await getCurrentLoginUser();
      const userId = loginUser?.id;
      
      if (!userId) {
        console.error('❌ Не удалось получить ID пользователя');
        toast.error('Ошибка: не удалось определить пользователя. Попробуйте перезайти в систему.');
        return;
      }
      
      console.log('👤 Пользователь:', loginUser.login, 'ID:', userId);
      
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
        addedBy: userId,
        photos: [],
      };

      console.log('📝 Сохранение товара в базу данных...');
      await saveProduct(productData, userId);
      console.log('✅ Товар сохранен в products');

      // Сохраняем все фотографии включая лицевую и штрихкод
      const allPhotos = [
        ...(product.frontPhoto ? [product.frontPhoto] : []),
        ...(product.barcodePhoto ? [product.barcodePhoto] : []),
        ...product.photos
      ];

      console.log(`📸 Сохранение ${allPhotos.length} фотографий...`);
      for (const photo of allPhotos) {
        await saveProductImage(product.barcode, product.name, photo, userId);
      }
      console.log('✅ Фотографии сохранены');

      console.log('🗑️ Удаление товара из очереди...');
      const { error: deleteError } = await supabase
        .from('vremenno_product_foto')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('⚠️ Ошибка удаления из очереди:', deleteError);
        // Не прерываем процесс, товар уже сохранен
      } else {
        console.log('✅ Товар удален из очереди');
      }

      addLog(`Товар ${product.name} (${product.barcode}) добавлен через очередь`);

      setPendingProducts(prev => prev.filter(p => p.id !== id));
      toast.success(`✅ Товар "${product.name}" успешно добавлен`);
      console.log('🎉 Процесс сохранения завершен успешно');
    } catch (error: any) {
      console.error('❌ Ошибка при сохранении товара:', error);
      console.error('❌ Детали ошибки:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      
      if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch')) {
        toast.error('❌ Ошибка сети. Проверьте подключение к интернету');
      } else if (error.message?.includes('JWT')) {
        toast.error('❌ Ошибка авторизации. Попробуйте перезайти в систему');
      } else {
        toast.error(`❌ Ошибка при добавлении товара: ${error.message || 'Неизвестная ошибка'}`);
      }
    }
  };

  const handleTransferAllReady = async () => {
    if (totalCount === 0) {
      toast.info('Очередь пуста');
      return;
    }

    const confirmTransfer = window.confirm(
      `Перенести все ГОТОВЫЕ товары из очереди в базу?\n\n` +
      `Будут перенесены только товары с заполненными полями и фотографиями.\n` +
      `Незаполненные останутся в очереди.`
    );

    if (!confirmTransfer) return;

    try {
      toast.loading('Переношу готовые товары...');
      
      const { data, error } = await supabase.functions.invoke('transfer-queue-to-products');

      if (error) {
        console.error('Ошибка вызова функции:', error);
        toast.error('Ошибка при переносе товаров');
        return;
      }

      if (data.success) {
        const message = `✅ Перенесено: ${data.transferred}` + 
          (data.skipped > 0 ? `\nОсталось в очереди: ${data.skipped}` : '');
        toast.success(message);
        
        // Обновляем список
        setCurrentPage(1);
      } else {
        toast.error(`Ошибка: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Ошибка переноса:', error);
      toast.error('Ошибка при переносе товаров');
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
      console.log('💾 Начало массового сохранения товаров...');
      
      // Получаем пользователя из Supabase сессии
      const loginUser = await getCurrentLoginUser();
      const userId = loginUser?.id;
      
      if (!userId) {
        console.error('❌ Не удалось получить ID пользователя');
        toast.error('Ошибка: не удалось определить пользователя. Попробуйте перезайти в систему.');
        return;
      }
      
      console.log('👤 Пользователь:', loginUser.login, 'ID:', userId);

      let successCount = 0;
      let errorCount = 0;
      const skippedCount = pendingProducts.length - completeProducts.length;
      
      console.log(`📦 Будет обработано товаров: ${completeProducts.length}, пропущено: ${skippedCount}`);

      for (const product of completeProducts) {
        try {
          console.log(`\n📦 Обработка товара: ${product.name} (${product.barcode})`);
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
            addedBy: userId,
            photos: [],
          };

          await saveProduct(productData, userId);

          // Сохраняем все фотографии включая лицевую и штрихкод
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

          console.log(`✅ Товар ${product.name} успешно сохранен`);
          successCount++;
        } catch (error: any) {
          console.error(`❌ Ошибка сохранения товара ${product.name}:`, error);
          console.error('❌ Детали ошибки:', {
            message: error.message,
            code: error.code,
            details: error.details
          });
          errorCount++;
        }
      }
      
      console.log(`\n📊 Итоги: успешно ${successCount}, ошибок ${errorCount}, пропущено ${skippedCount}`);

      // Обновляем список, убирая только сохраненные товары
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
      console.error('Network error:', error);
      if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch')) {
        toast.error('Ошибка сети. Проверьте подключение к интернету');
      } else {
        toast.error('Ошибка при сохранении товаров');
      }
    }
  };

  const handleClearAllProducts = async () => {
    if (pendingProducts.length === 0) return;

    try {
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
    } catch (error: any) {
      console.error('Network error:', error);
      if (error.message?.includes('Failed to fetch') || error.message?.includes('fetch')) {
        toast.error('Ошибка сети. Проверьте подключение к интернету');
      } else {
        toast.error('Ошибка очистки очереди');
      }
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
              onClick={handleTransferAllReady}
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
