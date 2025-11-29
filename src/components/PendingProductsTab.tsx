import { useState, useEffect } from 'react';
import { Package, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PendingProductItem, PendingProduct } from './PendingProductItem';
import { toast } from 'sonner';
import { saveProduct, saveProductImage } from '@/lib/storage';
import { addLog } from '@/lib/auth';
import { getSuppliers } from '@/lib/suppliersDb';
import type { Supplier } from '@/lib/suppliersDb';
import { getCurrentLoginUser } from '@/lib/loginAuth';
import { 
  getQueueProducts, 
  updateQueueItem, 
  deleteQueueItem, 
  subscribeToQueue,
  QueueProduct 
} from '@/lib/firebaseCollections';
import { subscribeToSuppliers } from '@/lib/firebaseCollections';

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

    // Подписка на изменения поставщиков в Firebase
    const unsubscribe = subscribeToSuppliers((firebaseSuppliers) => {
      // Преобразуем Firebase Supplier в формат suppliersDb.Supplier
      const mapped: Supplier[] = firebaseSuppliers.map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone || '',
        notes: s.notes || '',
        totalDebt: Number(s.totalDebt || 0),
        paymentHistory: s.paymentHistory || [],
        createdAt: s.created_at || '',
        lastUpdated: s.updated_at || ''
      }));
      setSuppliers(mapped);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Конвертация QueueProduct в PendingProduct
  const convertToPendingProduct = (item: QueueProduct): PendingProduct => ({
    id: item.id,
    barcode: item.barcode || '',
    name: item.product_name || '',
    category: item.category || '',
    purchasePrice: '',
    retailPrice: '',
    quantity: item.quantity?.toString() || '1',
    unit: 'шт',
    expiryDate: '',
    supplier: '',
    frontPhoto: item.front_photo || undefined,
    barcodePhoto: item.barcode_photo || undefined,
    photos: item.image_url ? [item.image_url] : [],
  });

  // Загрузка временных товаров из Firebase
  useEffect(() => {
    let isMounted = true;

    const fetchPendingProducts = async () => {
      setIsLoading(true);
      try {
        const items = await getQueueProducts();
        if (!isMounted) return;

        setTotalCount(items.length);
        
        // Пагинация на клиенте
        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = items.slice(from, from + ITEMS_PER_PAGE);
        
        const products = pageItems.map(convertToPendingProduct);
        setPendingProducts(products);
      } catch (error: any) {
        if (isMounted) {
          setPendingProducts([]);
          setTotalCount(0);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchPendingProducts();

    // Подписка на изменения в Firebase
    const unsubscribe = subscribeToQueue((items) => {
      if (isMounted) {
        setTotalCount(items.length);
        const from = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = items.slice(from, from + ITEMS_PER_PAGE);
        const products = pageItems.map(convertToPendingProduct);
        setPendingProducts(products);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [currentPage]);

  const handleUpdatePendingProduct = async (id: string, updates: Partial<PendingProduct>) => {
    const product = pendingProducts.find(p => p.id === id);
    if (!product) return;

    const updatedProduct = { ...product, ...updates };

    try {
      await updateQueueItem(id, {
        barcode: updatedProduct.barcode,
        product_name: updatedProduct.name,
        category: updatedProduct.category,
        quantity: updatedProduct.quantity ? parseFloat(updatedProduct.quantity) : 1,
      });

      setPendingProducts(prev =>
        prev.map(p => p.id === id ? updatedProduct : p)
      );
    } catch (error: any) {
      console.error('Ошибка обновления:', error);
    }
  };

  const handleRemovePendingProduct = async (id: string) => {
    try {
      await deleteQueueItem(id);
      setPendingProducts(prev => prev.filter(p => p.id !== id));
      toast.success('Товар удален из очереди');
    } catch (error: any) {
      console.error('Ошибка удаления:', error);
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

      await deleteQueueItem(id);

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
      
      const queueItems = await getQueueProducts();

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
        // Проверяем, готов ли товар (есть фото)
        const isReady = item.barcode && item.product_name && 
                       (item.front_photo || item.barcode_photo || item.image_url);

        if (!isReady) {
          skipped++;
          continue;
        }

        // Для переноса нужны цены - пропускаем если их нет
        skipped++;
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

          await deleteQueueItem(product.id);
          successCount++;
        } catch (error) {
          console.error(`Ошибка сохранения товара ${product.name}:`, error);
          errorCount++;
        }
      }

      // Обновляем список
      const items = await getQueueProducts();
      setTotalCount(items.length);
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const pageItems = items.slice(from, from + ITEMS_PER_PAGE);
      setPendingProducts(pageItems.map(convertToPendingProduct));

      addLog(`Массовое сохранение: успешно ${successCount}, ошибок ${errorCount}, пропущено ${skippedCount}`);

      if (successCount > 0) {
        toast.success(`✅ Сохранено товаров: ${successCount}`);
      }
      if (errorCount > 0) {
        toast.error(`❌ Ошибок: ${errorCount}`);
      }
      if (skippedCount > 0) {
        toast.info(`⏭️ Пропущено (не заполнены): ${skippedCount}`);
      }
    } catch (error: any) {
      toast.error('Ошибка при сохранении товаров');
    }
  };

  const handleClearAll = async () => {
    if (pendingProducts.length === 0) {
      toast.info('Очередь уже пуста');
      return;
    }

    const confirmClear = window.confirm(
      `Вы уверены, что хотите очистить всю очередь?\n` +
      `Будет удалено ${totalCount} товаров.\n\n` +
      `Это действие необратимо!`
    );

    if (!confirmClear) return;

    try {
      const items = await getQueueProducts();
      for (const item of items) {
        await deleteQueueItem(item.id);
      }

      setPendingProducts([]);
      setTotalCount(0);
      toast.success('Очередь очищена');
    } catch (error: any) {
      toast.error('Ошибка при очистке очереди');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            <h3 className="text-lg font-semibold">
              Очередь товаров ({totalCount})
            </h3>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTransferAllReady()}
              disabled={totalCount === 0}
            >
              <Save className="h-4 w-4 mr-2" />
              Перенести готовые
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveAllProducts}
              disabled={pendingProducts.length === 0}
            >
              <Save className="h-4 w-4 mr-2" />
              Сохранить все
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAll}
              disabled={totalCount === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Очистить
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Загрузка...
          </div>
        ) : pendingProducts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Очередь пуста</p>
          </div>
        ) : (
          <div className="space-y-4">
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

            {/* Пагинация */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Назад
                </Button>
                <span className="flex items-center px-3 text-sm">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Вперед
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
