import { useState, useEffect } from 'react';
import { Scan, Plus, Package, X, Camera, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarcodeScanner } from './BarcodeScanner';
import { AIProductRecognition } from './AIProductRecognition';
import { CSVImportDialog } from './CSVImportDialog';
import { BulkImportButton } from './BulkImportButton';
import { BulkCSVImport } from './BulkCSVImport';
import { QuickSupplierDialog } from './QuickSupplierDialog';
import { PendingProductsList } from './PendingProductsList';
import { PendingProduct } from './PendingProductItem';

import { addLog, getCurrentUser } from '@/lib/auth';
import { toast } from 'sonner';
import { findProductByBarcode, saveProduct, StoredProduct, saveProductImage } from '@/lib/storage';
import { getSuppliers, Supplier } from '@/lib/suppliersDb';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

export const InventoryTab = () => {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  
  const [suggestedProduct, setSuggestedProduct] = useState<StoredProduct | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [showAIScanner, setShowAIScanner] = useState(false);
  const [aiScanMode, setAiScanMode] = useState<'product' | 'barcode'>('product');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [photoStep, setPhotoStep] = useState<'front' | 'barcode' | 'none'>('none');
  const [tempFrontPhoto, setTempFrontPhoto] = useState<string>('');
  const [tempBarcodePhoto, setTempBarcodePhoto] = useState<string>('');
  
  const [currentProduct, setCurrentProduct] = useState(() => {
    const saved = localStorage.getItem('inventory_form_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          barcode: '',
          name: '',
          category: '',
          purchasePrice: '',
          retailPrice: '',
          quantity: '',
          unit: 'шт' as 'шт' | 'кг',
          expiryDate: '',
          supplier: '',
        };
      }
    }
    return {
      barcode: '',
      name: '',
      category: '',
      purchasePrice: '',
      retailPrice: '',
      quantity: '',
      unit: 'шт' as 'шт' | 'кг',
      expiryDate: '',
      supplier: '',
    };
  });

  // Сохраняем состояние формы при изменении
  useEffect(() => {
    localStorage.setItem('inventory_form_data', JSON.stringify(currentProduct));
  }, [currentProduct]);

  useEffect(() => {
    const loadSuppliers = async () => {
      const loadedSuppliers = await getSuppliers();
      setSuppliers(loadedSuppliers);
    };
    loadSuppliers();

    // Подписка на реалтайм обновления товаров и фото
    const productsChannel = supabase
      .channel('products_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        () => {
          console.log('🔄 Products updated on another device');
        }
      )
      .subscribe();

    const imagesChannel = supabase
      .channel('product_images_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_images'
        },
        () => {
          console.log('🔄 Product images updated on another device');
        }
      )
      .subscribe();

    const suppliersChannel = supabase
      .channel('suppliers_changes_inventory')
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
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(imagesChannel);
      supabase.removeChannel(suppliersChannel);
    };
  }, []);

  const handleScan = async (data: { barcode: string; name?: string; category?: string; photoUrl?: string; capturedImage?: string; quantity?: number; frontPhoto?: string; barcodePhoto?: string } | string) => {
    const barcodeData = typeof data === 'string' ? { barcode: data } : data;
    
    const sanitizedBarcode = barcodeData.barcode?.trim().replace(/[<>'"]/g, '') || '';
    
    if (!sanitizedBarcode && !barcodeData.name && !barcodeData.category) {
      console.log('AI вернул пустые значения, пропускаем');
      return;
    }
    
    // Обработка двух фото
    if (photoStep === 'front' && barcodeData.capturedImage) {
      setTempFrontPhoto(barcodeData.capturedImage);
      setPhotoStep('barcode');
      setShowAIScanner(false);
      toast.info('📸 Отлично! Теперь нажмите кнопку "AI Сканирование" снова и сфотографируйте штрих-код');
      return;
    }
    
    if (photoStep === 'barcode' && barcodeData.capturedImage) {
      setTempBarcodePhoto(barcodeData.capturedImage);
      setPhotoStep('none');
      setShowAIScanner(false);
    }
    
    // Сохраняем capturedImage во временное состояние
    if (barcodeData.capturedImage) {
      setCapturedImage(barcodeData.capturedImage);
    }
    
    // Собираем все фотографии
    const allPhotos: string[] = [];
    if (tempFrontPhoto) allPhotos.push(tempFrontPhoto);
    if (tempBarcodePhoto || barcodeData.capturedImage) {
      const barcodeImg = tempBarcodePhoto || barcodeData.capturedImage;
      if (barcodeImg && !allPhotos.includes(barcodeImg)) {
        allPhotos.push(barcodeImg);
      }
    }
    if (barcodeData.photoUrl && !allPhotos.includes(barcodeData.photoUrl)) {
      allPhotos.push(barcodeData.photoUrl);
    }
    
    // Сохраняем все фото в постоянную базу если есть название
    if (barcodeData.name && allPhotos.length > 0) {
      console.log(`💾 Saving ${allPhotos.length} product photos to database...`);
      for (const photoUrl of allPhotos) {
        const saved = await saveProductImage(
          sanitizedBarcode || `no-barcode-${Date.now()}`,
          barcodeData.name,
          photoUrl
        );
        if (saved) {
          console.log('✅ Photo saved successfully');
        }
      }
    }
    
    if (sanitizedBarcode && sanitizedBarcode.length > 50) {
      toast.warning('Штрихкод слишком длинный');
      return;
    }

    // Добавляем товар в очередь
    const newPendingProduct: PendingProduct = {
      id: `pending-${Date.now()}-${Math.random()}`,
      barcode: sanitizedBarcode,
      name: barcodeData.name || '',
      category: barcodeData.category || '',
      purchasePrice: '',
      retailPrice: '',
      quantity: barcodeData.quantity?.toString() || '1',
      unit: 'шт',
      expiryDate: '',
      supplier: '',
      photos: allPhotos,
      frontPhoto: tempFrontPhoto || undefined,
      barcodePhoto: (tempBarcodePhoto || barcodeData.capturedImage) || undefined,
    };

    // Если есть штрихкод, ищем в базе для автозаполнения
    if (sanitizedBarcode) {
      const existing = await findProductByBarcode(sanitizedBarcode);
      if (existing) {
        newPendingProduct.category = existing.category;
        newPendingProduct.purchasePrice = existing.purchasePrice.toString();
        newPendingProduct.retailPrice = existing.retailPrice.toString();
        newPendingProduct.unit = existing.unit;
        // Объединяем фото из базы с новыми фото
        const existingPhotos = existing.photos || [];
        newPendingProduct.photos = [...new Set([...allPhotos, ...existingPhotos])];
        toast.info('✅ Товар найден в базе, цены автозаполнены');
      }
    }

    setPendingProducts(prev => [...prev, newPendingProduct]);
    
    // Очищаем временные фото после добавления в очередь
    setTempFrontPhoto('');
    setTempBarcodePhoto('');
    
    if (barcodeData.name) {
      toast.success(`📦 Добавлен в очередь: ${barcodeData.name}`);
    } else if (sanitizedBarcode) {
      toast.success(`📦 Штрихкод добавлен в очередь: ${sanitizedBarcode}`);
    }
  };

  const acceptSuggestion = () => {
    setShowSuggestion(false);
    toast.success('Данные из базы приняты');
  };

  const rejectSuggestion = () => {
    setShowSuggestion(false);
    setSuggestedProduct(null);
    setCurrentProduct({
      ...currentProduct,
      name: '',
      category: '',
      purchasePrice: '',
      retailPrice: '',
      quantity: '',
      unit: 'шт',
      expiryDate: '',
    });
    setPhotos([]);
    toast.info('Введите новые данные');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const maxPhotos = 3;
    if (photos.length >= maxPhotos) {
      toast.error(`Можно загрузить максимум ${maxPhotos} фото`);
      return;
    }

    Array.from(files).slice(0, maxPhotos - photos.length).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdatePendingProduct = (id: string, updates: Partial<PendingProduct>) => {
    setPendingProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleRemovePendingProduct = (id: string) => {
    setPendingProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleSaveAllProducts = async () => {
    if (pendingProducts.length === 0) {
      toast.error('Нет товаров для сохранения');
      return;
    }

    const incompleteProducts = pendingProducts.filter(p => 
      !p.name || !p.category || !p.purchasePrice || !p.retailPrice || !p.quantity
    );

    if (incompleteProducts.length > 0) {
      toast.error(`${incompleteProducts.length} товаров не заполнены полностью`);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Необходимо войти в систему');
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const product of pendingProducts) {
        try {
          // Сохраняем фотографии - собираем все уникальные фото
          const allPhotos = [...new Set([
            ...product.photos,
            ...(product.frontPhoto ? [product.frontPhoto] : []),
            ...(product.barcodePhoto ? [product.barcodePhoto] : [])
          ])];

          console.log(`📸 Сохранение ${allPhotos.length} фото для товара ${product.name}`);

          for (const photoUrl of allPhotos) {
            try {
              await saveProductImage(
                product.barcode || `product-${Date.now()}`,
                product.name,
                photoUrl
              );
            } catch (err) {
              console.error('Ошибка сохранения фото:', err);
            }
          }

          // Сохраняем товар
          const productData: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'> = {
            barcode: product.barcode,
            name: product.name,
            category: product.category,
            purchasePrice: parseFloat(product.purchasePrice),
            retailPrice: parseFloat(product.retailPrice),
            quantity: parseFloat(product.quantity),
            unit: product.unit,
            expiryDate: product.expiryDate || undefined,
            photos: allPhotos,
            paymentType: 'full',
            paidAmount: parseFloat(product.purchasePrice) * parseFloat(product.quantity),
            debtAmount: 0,
            addedBy: currentUser?.role || 'unknown',
            supplier: product.supplier || undefined,
          };

          const saved = await saveProduct(productData, currentUser?.username || 'unknown');
          
          if (saved) {
            successCount++;
            addLog(`Добавлен товар: ${product.name} (${product.quantity} ${product.unit})`);
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error('Ошибка сохранения товара:', error);
          errorCount++;
        }
      }

      if (successCount > 0) {
        toast.success(`✅ Сохранено товаров: ${successCount}`);
        setPendingProducts([]);
      }
      
      if (errorCount > 0) {
        toast.error(`❌ Ошибок: ${errorCount}`);
      }
    } catch (error: any) {
      console.error('Ошибка массового сохранения:', error);
      toast.error('Ошибка при сохранении товаров');
    }
  };

  const handleClearAllProducts = () => {
    if (confirm(`Очистить очередь из ${pendingProducts.length} товаров?`)) {
      setPendingProducts([]);
      toast.info('Очередь очищена');
    }
  };

  const addProduct = async () => {
    try {
      console.log('🔄 Начало добавления товара...');
      
      if (!navigator.onLine) {
        toast.info('⚠️ Нет соединения. Товар будет сохранен локально и синхронизирован позже.');
        console.warn('⚠️ Режим оффлайн - данные будут синхронизированы при восстановлении соединения');
      }
      
      console.log('🔐 Проверка авторизации...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('❌ Ошибка авторизации:', authError);
        toast.error(`Ошибка авторизации: ${authError.message}`);
        return;
      }
      
      if (!user) {
        console.error('❌ Пользователь не авторизован');
        toast.error('⚠️ Вы не авторизованы. Пожалуйста, войдите в систему.');
        return;
      }
      
      console.log('✅ Пользователь авторизован:', user.id);
      
      console.log('📋 Проверка обязательных полей...');
      if (!currentProduct.name?.trim()) {
        console.error('❌ Название товара пустое');
        toast.error('❌ Введите название товара');
        return;
      }
      
      if (!currentProduct.category?.trim()) {
        console.error('❌ Категория не выбрана');
        toast.error('❌ Выберите категорию товара');
        return;
      }
      
      if (!currentProduct.purchasePrice) {
        console.error('❌ Закупочная цена не указана');
        toast.error('❌ Укажите закупочную цену');
        return;
      }
      
      if (!currentProduct.quantity) {
        console.error('❌ Количество не указано');
        toast.error('❌ Укажите количество товара');
        return;
      }

      if (isAdmin && !currentProduct.retailPrice) {
        console.warn('⚠️ Администратор не указал розничную цену');
        toast.error('❌ Укажите розничную цену');
        return;
      }
      
      console.log('✅ Все обязательные поля заполнены');

      const purchasePrice = parseFloat(currentProduct.purchasePrice);
      const retailPrice = parseFloat(currentProduct.retailPrice) || purchasePrice;
      const quantity = parseFloat(currentProduct.quantity);
      
      if (quantity <= 0) {
        console.error('❌ Некорректное количество:', quantity);
        toast.error('❌ Количество должно быть больше 0');
        return;
      }
      
      if (purchasePrice < 0 || retailPrice < 0) {
        console.error('❌ Некорректные цены:', { purchasePrice, retailPrice });
        toast.error('❌ Цены не могут быть отрицательными');
        return;
      }

      console.log('📝 Валидированные данные товара:', {
        name: currentProduct.name,
        barcode: currentProduct.barcode || 'НЕТ',
        category: currentProduct.category,
        purchasePrice,
        retailPrice,
        quantity
      });

      if (photos.length > 0 || capturedImage) {
        const imagesToSave = [...photos];
        if (capturedImage && !photos.includes(capturedImage)) {
          imagesToSave.push(capturedImage);
        }
        
        console.log(`📷 Сохранение ${imagesToSave.length} фото товара...`);
        
        for (const imageUrl of imagesToSave) {
          try {
            const saved = await saveProductImage(
              currentProduct.barcode || `product-${Date.now()}`,
              currentProduct.name,
              imageUrl
            );
            if (saved) {
              console.log('✅ Фото сохранено');
            }
          } catch (imgError: any) {
            console.error('❌ Ошибка сохранения фото:', imgError.message);
          }
        }
      }
      
      const productData: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'> = {
        barcode: currentProduct.barcode,
        name: currentProduct.name,
        category: currentProduct.category,
        purchasePrice,
        retailPrice,
        quantity,
        unit: currentProduct.unit,
        expiryDate: currentProduct.expiryDate || undefined,
        photos,
        paymentType: 'full',
        paidAmount: purchasePrice * quantity,
        debtAmount: 0,
        addedBy: currentUser?.role || 'unknown',
        supplier: currentProduct.supplier || undefined,
      };

      console.log('💾 Начинается сохранение товара...');
      const saved = await saveProduct(productData, currentUser?.username || 'unknown');
      console.log('💾 Результат сохранения:', saved);
      
      if (saved) {
        addLog(`Добавлен товар: ${currentProduct.name} (${quantity} ${currentProduct.unit})`);
        
        if (suggestedProduct && 
            (suggestedProduct.purchasePrice !== purchasePrice || 
             suggestedProduct.retailPrice !== retailPrice)) {
          const priceDiff = purchasePrice - suggestedProduct.purchasePrice;
          addLog(`Изменение цены "${currentProduct.name}": ${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)}₽`);
        }
        
        console.log('✅ Товар успешно сохранен');
        toast.success('✅ Товар сохранён и доступен на кассе!');
        
        setCurrentProduct({
          barcode: '',
          name: '',
          category: '',
          purchasePrice: '',
          retailPrice: '',
          quantity: '',
          unit: 'шт',
          expiryDate: '',
          supplier: '',
        });
        setPhotos([]);
        setCapturedImage('');
        setSuggestedProduct(null);
        localStorage.removeItem('inventory_form_data');
      } else {
        throw new Error('saveProduct вернула false');
      }
    } catch (error: any) {
      console.error('❌ КРИТИЧЕСКАЯ ОШИБКА при добавлении товара:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        stack: error.stack,
        name: error.name
      });
      
      let errorMessage = 'Неизвестная ошибка при сохранении товара';
      
      if (error.message?.includes('duplicate')) {
        errorMessage = 'Товар с таким штрихкодом уже существует';
      } else if (error.code === '23505') {
        errorMessage = 'Товар с такими данными уже существует';
      } else if (error.message?.includes('не авторизован')) {
        errorMessage = 'Необходимо войти в систему';
      } else if (error.message?.includes('Network')) {
        errorMessage = 'Ошибка сети. Проверьте интернет-соединение';
      } else if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast.error(`❌ Ошибка: ${errorMessage}`);
    }

    setCurrentProduct({
      barcode: '',
      name: '',
      category: '',
      purchasePrice: '',
      retailPrice: '',
      quantity: '',
      unit: 'шт',
      expiryDate: '',
      supplier: '',
    });
    setPhotos([]);
    setCapturedImage('');
    setSuggestedProduct(null);
    localStorage.removeItem('inventory_form_data');
  };

  // Удалена функция saveAllProducts - товары теперь сохраняются сразу при добавлении

  return (
    <div className="flex gap-4 h-full">
      {/* AI Product Recognition - только для админов */}
      {isAdmin && showAIScanner && (
        <div className="fixed inset-0 bg-background z-50">
          <AIProductRecognition 
            onProductFound={handleScan}
            mode={aiScanMode}
          />
          <Button
            onClick={() => {
              setShowAIScanner(false);
              setAiScanMode('product');
              setPhotoStep('none');
              setTempFrontPhoto('');
              setTempBarcodePhoto('');
            }}
            variant="outline"
            className="absolute top-4 right-4 z-50"
          >
            <X className="h-4 w-4 mr-2" />
            Закрыть
          </Button>
        </div>
      )}

      {/* CSV Import Dialog */}
      {showImportDialog && (
        <CSVImportDialog
          onClose={() => setShowImportDialog(false)}
          onImportComplete={() => {
            toast.success('Товары успешно импортированы');
          }}
        />
      )}

      {/* Quick Supplier Dialog */}
      <QuickSupplierDialog
        open={showSupplierDialog}
        onClose={() => setShowSupplierDialog(false)}
        onSupplierAdded={async (newSupplier) => {
          const updatedSuppliers = await getSuppliers();
          setSuppliers(updatedSuppliers);
          setCurrentProduct({ ...currentProduct, supplier: newSupplier.name });
        }}
      />

      {/* Main Content */}
      <div className="flex-1 space-y-4">
        {/* Scanner and Import */}
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <BarcodeScanner onScan={handleScan} />
          </div>
          {isAdmin && (
            <>
              <Button 
                onClick={() => {
                  if (photoStep === 'barcode') {
                    // Продолжаем со второго фото
                    setAiScanMode('barcode');
                    setShowAIScanner(true);
                    toast.info('📸 Сфотографируйте штрих-код товара');
                  } else {
                    // Начинаем с первого фото
                    setPhotoStep('front');
                    setAiScanMode('product');
                    setShowAIScanner(true);
                    toast.info('📸 Шаг 1: Сфотографируйте лицевую сторону товара');
                  }
                }}
                variant={photoStep === 'barcode' ? 'default' : 'outline'}
              >
                <Camera className="h-4 w-4 mr-2" />
                {photoStep === 'none' && 'AI Сканирование (2 фото)'}
                {photoStep === 'front' && 'Шаг 1/2: Лицевая сторона'}
                {photoStep === 'barcode' && 'Шаг 2/2: Штрих-код'}
              </Button>
              <Button onClick={() => setShowImportDialog(true)} variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Импорт CSV
              </Button>
              <BulkImportButton />
              <BulkCSVImport />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Add Product Form */}
        <Card className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Добавить товар
          </h3>

          {showSuggestion && suggestedProduct && (
            <div className="mb-4 p-3 bg-primary/10 border border-primary rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">Товар найден в базе!</p>
                  <p className="text-xs text-muted-foreground mt-1">{suggestedProduct.name}</p>
                  <div className="text-xs space-y-1 mt-2">
                    <div>Закуп: {suggestedProduct.purchasePrice}₽</div>
                    {isAdmin && <div>Розница: {suggestedProduct.retailPrice}₽</div>}
                    <div>Категория: {suggestedProduct.category}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={acceptSuggestion}>
                    Принять
                  </Button>
                  <Button size="sm" variant="ghost" onClick={rejectSuggestion}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Штрихкод *</label>
              <Input
                className="text-sm"
                value={currentProduct.barcode}
                onChange={(e) => setCurrentProduct({ ...currentProduct, barcode: e.target.value })}
                placeholder="Используйте сканер выше"
              />
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Название товара *</label>
              <Input
                className="text-sm"
                value={currentProduct.name}
                onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                placeholder="Введите название"
              />
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Категория *</label>
              <Input
                className="text-sm"
                value={currentProduct.category}
                onChange={(e) => setCurrentProduct({ ...currentProduct, category: e.target.value })}
                placeholder="Например: Молочные продукты"
              />
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Поставщик</label>
              <Select
                value={currentProduct.supplier}
                onValueChange={(value) => {
                  if (value === '__add_new__') {
                    setShowSupplierDialog(true);
                  } else {
                    setCurrentProduct({ ...currentProduct, supplier: value });
                  }
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Выберите поставщика" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="__add_new__" className="text-primary font-medium">
                    + Добавить нового поставщика
                  </SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.name}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Закуп (₽) *</label>
                <Input
                  className="text-sm"
                  type="number"
                  step="0.01"
                  value={currentProduct.purchasePrice}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, purchasePrice: e.target.value })}
                  placeholder="0"
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Розница (₽) *</label>
                  <Input
                    className="text-sm"
                    type="number"
                    step="0.01"
                    value={currentProduct.retailPrice}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, retailPrice: e.target.value })}
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Количество *</label>
                <Input
                  className="text-sm"
                  type="number"
                  step="0.01"
                  value={currentProduct.quantity}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Единица *</label>
                <Select
                  value={currentProduct.unit}
                  onValueChange={(value: 'шт' | 'кг') => 
                    setCurrentProduct({ ...currentProduct, unit: value })
                  }
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="шт">Штуки</SelectItem>
                    <SelectItem value="кг">Килограммы</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Срок годности</label>
              <Input
                className="text-sm"
                type="date"
                value={currentProduct.expiryDate}
                onChange={(e) => setCurrentProduct({ ...currentProduct, expiryDate: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Фото товара (до 3 шт)</label>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="text-sm"
              />
              {photos.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img src={photo} alt={`Preview ${idx + 1}`} className="h-16 w-16 object-cover rounded border" />
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-5 w-5"
                        onClick={() => removePhoto(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={addProduct} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Сохранить товар
            </Button>
          </div>
        </Card>
        </div>
      </div>

      {/* Pending Products List - Right Side */}
      <PendingProductsList
        products={pendingProducts}
        onUpdateProduct={handleUpdatePendingProduct}
        onRemoveProduct={handleRemovePendingProduct}
        onSaveAll={handleSaveAllProducts}
        onClearAll={handleClearAllProducts}
      />
    </div>
  );
};
