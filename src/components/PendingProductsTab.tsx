import { useState, useEffect, useCallback, useRef } from 'react';
import { Package, Save, Trash2, CheckCheck, RefreshCw, Zap } from 'lucide-react';
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
} from '@/lib/mysqlCollections';
import { subscribeToSuppliers } from '@/lib/mysqlCollections';
import { findPriceByBarcode, initPriceCache } from '@/lib/localPriceCache';
import { insertProduct } from '@/lib/mysqlDatabase';

export const PendingProductsTab = () => {
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [csvLoaded, setCsvLoaded] = useState(false);
  const [isAutoTransferring, setIsAutoTransferring] = useState(false);
  const autoTransferRan = useRef(false);
  const ITEMS_PER_PAGE = 50;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Автоматический перенос товаров с ценами в MySQL (products)
  const autoTransferProductsWithPrices = useCallback(async (products: PendingProduct[]) => {
    if (autoTransferRan.current || products.length === 0) return;
    autoTransferRan.current = true;
    
    // Находим товары с ценами
    const productsWithPrices = products.filter(p => {
      const purchasePrice = parseFloat(p.purchasePrice) || 0;
      const retailPrice = parseFloat(p.retailPrice) || 0;
      return p.barcode && p.name && purchasePrice > 0 && retailPrice > 0;
    });

    if (productsWithPrices.length === 0) {
      console.log('📋 Нет товаров с ценами для автопереноса');
      return;
    }

    console.log(`🚀 Автоперенос: найдено ${productsWithPrices.length} товаров с ценами`);
    setIsAutoTransferring(true);
    toast.loading(`🚀 Автоперенос ${productsWithPrices.length} товаров в базу...`, { id: 'auto-transfer' });

    const loginUser = await getCurrentLoginUser();
    const userId = loginUser?.id || 'system';

    let successCount = 0;
    let errorCount = 0;

    for (const product of productsWithPrices) {
      try {
        // Добавляем в таблицу products
        await insertProduct({
          barcode: product.barcode,
          name: product.name,
          category: product.category || 'Без категории',
          purchase_price: parseFloat(product.purchasePrice),
          sale_price: parseFloat(product.retailPrice),
          quantity: parseFloat(product.quantity) || 1,
          unit: 'шт',
          expiry_date: product.expiryDate || undefined,
          created_by: userId
        });

        // Удаляем из очереди
        await deleteQueueItem(product.id);
        successCount++;
        console.log(`✅ Перенесён: ${product.name} (${product.barcode})`);
      } catch (error) {
        console.error(`❌ Ошибка переноса ${product.barcode}:`, error);
        errorCount++;
      }
    }

    setIsAutoTransferring(false);

    if (successCount > 0) {
      addLog(`Автоперенос: перенесено ${successCount} товаров в базу`);
      toast.success(
        `✅ Автоперенос: ${successCount} в базу${errorCount > 0 ? ` | Ошибок: ${errorCount}` : ''}`,
        { id: 'auto-transfer', duration: 5000 }
      );
      
      // Обновляем список
      const items = await getQueueProducts();
      setTotalCount(items.length);
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const pageItems = items.slice(from, from + ITEMS_PER_PAGE);
      setPendingProducts(pageItems.map(convertToPendingProduct));
    } else {
      toast.dismiss('auto-transfer');
    }
  }, [currentPage]);

  // Загрузка CSV кэша при монтировании
  useEffect(() => {
    initPriceCache().then((count) => {
      console.log('📦 CSV кэш цен загружен:', count);
      setCsvLoaded(true);
    });
  }, []);

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

  // Конвертация QueueProduct в PendingProduct с авто-заполнением цен из CSV
  const convertToPendingProduct = (item: QueueProduct): PendingProduct => {
    let purchasePrice = item.purchase_price ? item.purchase_price.toString() : '';
    let retailPrice = item.sale_price ? item.sale_price.toString() : '';
    let name = item.product_name || '';
    let category = item.category || '';
    let quantity = item.quantity?.toString() || '1';
    
    // Если цены пустые или 0, ищем в CSV
    if (item.barcode && (!item.purchase_price || !item.sale_price)) {
      const csvData = findPriceByBarcode(item.barcode);
      if (csvData) {
        console.log(`📋 Найдены цены из CSV для ${item.barcode}:`, csvData);
        // Розничная = закупочная * 1.3 (30% маржа)
        if (!purchasePrice || purchasePrice === '0') {
          purchasePrice = csvData.purchasePrice.toString();
        }
        if (!retailPrice || retailPrice === '0') {
          retailPrice = Math.round(csvData.purchasePrice * 1.3).toString();
        }
        if (!name && csvData.name) {
          name = csvData.name;
        }
        if (!category && csvData.category) {
          category = csvData.category;
        }
        // Используем количество из CSV если в очереди 1 (по умолчанию)
        if (csvData.quantity > 0 && item.quantity === 1) {
          quantity = csvData.quantity.toString();
        }
      }
    }
    
    return {
      id: item.id,
      barcode: item.barcode || '',
      name,
      category,
      purchasePrice,
      retailPrice,
      quantity,
      unit: 'шт',
      expiryDate: '',
      supplier: item.supplier || '',
      frontPhoto: item.front_photo || undefined,
      barcodePhoto: item.barcode_photo || undefined,
      photos: item.image_url ? [item.image_url] : [],
    };
  };

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

  // Автоперенос товаров с ценами после загрузки CSV
  useEffect(() => {
    if (csvLoaded && pendingProducts.length > 0 && !isLoading && !isAutoTransferring) {
      autoTransferProductsWithPrices(pendingProducts);
    }
  }, [csvLoaded, pendingProducts, isLoading, isAutoTransferring, autoTransferProductsWithPrices]);

  // Ручной перенос товаров с ценами в MySQL
  const handleTransferWithPrices = async () => {
    const productsWithPrices = pendingProducts.filter(p => {
      const purchasePrice = parseFloat(p.purchasePrice) || 0;
      const retailPrice = parseFloat(p.retailPrice) || 0;
      return p.barcode && p.name && purchasePrice > 0 && retailPrice > 0;
    });

    if (productsWithPrices.length === 0) {
      toast.info('Нет товаров с ценами для переноса');
      return;
    }

    const confirmTransfer = window.confirm(
      `Перенести ${productsWithPrices.length} товаров с ценами в базу MySQL?`
    );

    if (!confirmTransfer) return;

    toast.loading(`🔄 Переносим ${productsWithPrices.length} товаров...`, { id: 'manual-transfer' });

    const loginUser = await getCurrentLoginUser();
    const userId = loginUser?.id || 'system';

    let successCount = 0;
    let errorCount = 0;

    for (const product of productsWithPrices) {
      try {
        await insertProduct({
          barcode: product.barcode,
          name: product.name,
          category: product.category || 'Без категории',
          purchase_price: parseFloat(product.purchasePrice),
          sale_price: parseFloat(product.retailPrice),
          quantity: parseFloat(product.quantity) || 1,
          unit: 'шт',
          expiry_date: product.expiryDate || undefined,
          created_by: userId
        });

        await deleteQueueItem(product.id);
        successCount++;
      } catch (error) {
        console.error(`❌ Ошибка переноса ${product.barcode}:`, error);
        errorCount++;
      }
    }

    // Обновляем список
    const items = await getQueueProducts();
    setTotalCount(items.length);
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = items.slice(from, from + ITEMS_PER_PAGE);
    setPendingProducts(pageItems.map(convertToPendingProduct));

    addLog(`Ручной перенос: ${successCount} товаров в базу`);
    toast.success(
      `✅ Перенесено: ${successCount}${errorCount > 0 ? ` | Ошибок: ${errorCount}` : ''}`,
      { id: 'manual-transfer', duration: 5000 }
    );
  };

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
        purchase_price: updatedProduct.purchasePrice ? parseFloat(updatedProduct.purchasePrice) : undefined,
        sale_price: updatedProduct.retailPrice ? parseFloat(updatedProduct.retailPrice) : undefined,
        supplier: updatedProduct.supplier,
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

  // Одобрить все - массовый перенос товаров с ценами
  const handleApproveAll = async () => {
    if (pendingProducts.length === 0) {
      toast.info('Очередь пуста');
      return;
    }

    // Фильтруем товары с заполненными ценами
    const readyProducts = pendingProducts.filter(p =>
      p.barcode && p.name && p.purchasePrice && p.retailPrice &&
      (p.frontPhoto || p.barcodePhoto || p.photos.length > 0)
    );

    if (readyProducts.length === 0) {
      toast.error('Нет товаров с заполненными ценами для переноса');
      return;
    }

    const confirmApprove = window.confirm(
      `Одобрить и перенести ${readyProducts.length} товаров с ценами?\n\n` +
      `Товары без цен останутся в очереди.`
    );

    if (!confirmApprove) return;

    try {
      toast.loading('🔄 Перенос товаров...', { id: 'approve-all' });

      const loginUser = await getCurrentLoginUser();
      const userId = loginUser?.id;

      if (!userId) {
        toast.error('Не удалось получить ID пользователя', { id: 'approve-all' });
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const product of readyProducts) {
        try {
          const supplier = suppliers.find(s => s.name === product.supplier);

          const productData = {
            barcode: product.barcode,
            name: product.name,
            category: product.category || 'Без категории',
            purchasePrice: parseFloat(product.purchasePrice),
            retailPrice: parseFloat(product.retailPrice),
            quantity: parseFloat(product.quantity) || 1,
            unit: 'шт' as const,
            expiryDate: product.expiryDate || undefined,
            supplier: product.supplier,
            supplierPhone: supplier?.phone,
            paymentType: 'full' as const,
            paidAmount: parseFloat(product.purchasePrice) * (parseFloat(product.quantity) || 1),
            debtAmount: 0,
            addedBy: userId,
            photos: [],
          };

          await saveProduct(productData, userId);

          // Сохраняем фотографии
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
          console.error(`Ошибка переноса товара ${product.name}:`, error);
          errorCount++;
        }
      }

      // Обновляем список
      const items = await getQueueProducts();
      setTotalCount(items.length);
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const pageItems = items.slice(from, from + ITEMS_PER_PAGE);
      setPendingProducts(pageItems.map(convertToPendingProduct));

      addLog(`Массовое одобрение: перенесено ${successCount}, ошибок ${errorCount}`);

      toast.success(
        `✅ Перенесено: ${successCount}${errorCount > 0 ? ` | Ошибок: ${errorCount}` : ''}`,
        { id: 'approve-all', duration: 5000 }
      );
    } catch (error: any) {
      console.error('Ошибка массового одобрения:', error);
      toast.error('Ошибка при переносе товаров', { id: 'approve-all' });
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

  // Авто-заполнение цен из CSV для всех товаров без цен
  const handleAutoFillPrices = async () => {
    if (!csvLoaded) {
      toast.error('CSV кэш ещё не загружен');
      return;
    }

    const productsWithoutPrices = pendingProducts.filter(
      p => p.barcode && (!p.purchasePrice || p.purchasePrice === '0' || !p.retailPrice || p.retailPrice === '0')
    );

    if (productsWithoutPrices.length === 0) {
      toast.info('Все товары уже имеют цены');
      return;
    }

    toast.loading(`🔄 Заполняем цены из CSV...`, { id: 'auto-fill' });

    let filledCount = 0;
    let notFoundCount = 0;

    for (const product of productsWithoutPrices) {
      const csvData = findPriceByBarcode(product.barcode);
      if (csvData) {
        const purchasePrice = csvData.purchasePrice;
        const retailPrice = Math.round(csvData.purchasePrice * 1.3); // 30% маржа
        const quantity = csvData.quantity > 0 ? csvData.quantity : parseFloat(product.quantity) || 1;
        
        try {
          await updateQueueItem(product.id, {
            product_name: csvData.name || product.name,
            category: csvData.category || product.category,
            purchase_price: purchasePrice,
            sale_price: retailPrice,
            quantity: quantity,
          });
          
          // Обновляем локальный стейт
          setPendingProducts(prev => prev.map(p => 
            p.id === product.id 
              ? { 
                  ...p, 
                  name: csvData.name || p.name,
                  category: csvData.category || p.category,
                  purchasePrice: purchasePrice.toString(),
                  retailPrice: retailPrice.toString(),
                  quantity: quantity.toString()
                }
              : p
          ));
          
          filledCount++;
          console.log(`✅ Заполнены цены для ${product.barcode}: закуп=${purchasePrice}, розница=${retailPrice}, кол-во=${quantity}`);
        } catch (error) {
          console.error(`Ошибка обновления ${product.barcode}:`, error);
        }
      } else {
        notFoundCount++;
        console.log(`❌ Не найден в CSV: ${product.barcode}`);
      }
    }

    toast.success(
      `✅ Заполнено: ${filledCount} | Не найдено: ${notFoundCount}`,
      { id: 'auto-fill', duration: 5000 }
    );
  };

  // Подсчёт товаров с ценами для отображения
  const productsWithPricesCount = pendingProducts.filter(p => {
    const purchasePrice = parseFloat(p.purchasePrice) || 0;
    const retailPrice = parseFloat(p.retailPrice) || 0;
    return purchasePrice > 0 && retailPrice > 0 && p.name;
  }).length;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            <h3 className="text-lg font-semibold">
              Очередь товаров ({totalCount})
              {productsWithPricesCount > 0 && (
                <span className="text-sm text-green-600 ml-2">
                  ({productsWithPricesCount} с ценами)
                </span>
              )}
            </h3>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAutoFillPrices}
              disabled={pendingProducts.length === 0 || !csvLoaded}
              title="Заполнить цены из CSV файлов"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Заполнить цены
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleTransferWithPrices}
              disabled={productsWithPricesCount === 0 || isAutoTransferring}
              className="bg-blue-600 hover:bg-blue-700"
              title="Перенести товары с ценами в базу MySQL"
            >
              <Zap className="h-4 w-4 mr-2" />
              В базу ({productsWithPricesCount})
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleApproveAll}
              disabled={pendingProducts.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCheck className="h-4 w-4 mr-2" />
              Одобрить все
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
