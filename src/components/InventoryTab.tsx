import { useState, useEffect } from 'react';
import { Scan, Plus, Package, X, Camera, Upload, CalendarClock, Sparkles, Users, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarcodeScanner } from './BarcodeScanner';
import { AIProductRecognition } from './AIProductRecognition';
import { CSVImportDialog } from './CSVImportDialog';
import { BulkImportButton } from './BulkImportButton';
import { BulkCSVImport } from './BulkCSVImport';
import { QuickSupplierDialog } from './QuickSupplierDialog';
import { PendingProduct } from './PendingProductItem';
import { ProductReturnsTab } from './ProductReturnsTab';

import { addLog, getCurrentUser } from '@/lib/auth';
import { toast } from 'sonner';
import { findProductByBarcode, saveProduct, StoredProduct, saveProductImage } from '@/lib/storage';
import { getSuppliers, Supplier } from '@/lib/suppliersDb';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useProductsSync } from '@/hooks/useProductsSync';
import { useFormSync } from '@/hooks/useFormSync';

export const InventoryTab = () => {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';

  // Realtime синхронизация товаров
  useProductsSync();

  const [suggestedProduct, setSuggestedProduct] = useState<StoredProduct | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [showAIScanner, setShowAIScanner] = useState(false);
  const [aiScanMode, setAiScanMode] = useState<'product' | 'barcode' | 'expiry' | 'dual'>('product');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [photoStep, setPhotoStep] = useState<'front' | 'barcode' | 'none'>('none');
  const [tempFrontPhoto, setTempFrontPhoto] = useState<string>('');
  const [tempBarcodePhoto, setTempBarcodePhoto] = useState<string>('');
  const [isRecognizingExpiry, setIsRecognizingExpiry] = useState(false);

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

  // Realtime синхронизация формы между админами
  const { otherUsersStates } = useFormSync({
    barcode: currentProduct.barcode,
    name: currentProduct.name,
    category: currentProduct.category,
    supplier: currentProduct.supplier,
    purchasePrice: currentProduct.purchasePrice,
    retailPrice: currentProduct.retailPrice,
    quantity: currentProduct.quantity,
    unit: currentProduct.unit,
    expiryDate: currentProduct.expiryDate
  }, isAdmin);

  // Подписка на изменения product_form_state для real-time синхронизации полей
  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('product_form_sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_form_state'
        },
        async (payload) => {
          console.log('📡 Form state change detected:', payload);
          
          // Получаем текущего пользователя
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          // Игнорируем свои собственные изменения
          if (payload.new && 'user_id' in payload.new && payload.new.user_id === user.id) {
            return;
          }

          // Применяем изменения из другой сессии ТОЛЬКО если поля заполнены
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const formData = payload.new as any;
            
            // Создаем обновление только с заполненными полями
            const updates: Partial<typeof currentProduct> = {};
            if (formData.barcode !== null && formData.barcode !== undefined) updates.barcode = formData.barcode;
            if (formData.name !== null && formData.name !== undefined) updates.name = formData.name;
            if (formData.category !== null && formData.category !== undefined) updates.category = formData.category;
            if (formData.purchase_price !== null && formData.purchase_price !== undefined) updates.purchasePrice = formData.purchase_price.toString();
            if (formData.retail_price !== null && formData.retail_price !== undefined) updates.retailPrice = formData.retail_price.toString();
            if (formData.quantity !== null && formData.quantity !== undefined) updates.quantity = formData.quantity.toString();
            if (formData.unit !== null && formData.unit !== undefined) updates.unit = formData.unit;
            if (formData.expiry_date !== null && formData.expiry_date !== undefined) updates.expiryDate = formData.expiry_date;
            if (formData.supplier !== null && formData.supplier !== undefined) updates.supplier = formData.supplier;

            // Применяем обновления только если есть что обновлять
            if (Object.keys(updates).length > 0) {
              setCurrentProduct(prev => ({
                ...prev,
                ...updates
              }));

              toast.info(`🔄 Данные обновлены из другой сессии (${formData.user_name})`);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  useEffect(() => {
    const loadSuppliers = async () => {
      const loadedSuppliers = await getSuppliers();
      setSuppliers(loadedSuppliers);
    };
    loadSuppliers();

    // Загрузка pending products из Supabase
    const loadPendingProducts = async () => {
      const { data, error } = await supabase
        .from('vremenno_product_foto')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        const loaded: PendingProduct[] = data.map(item => ({
          id: item.id,
          barcode: item.barcode,
          name: item.product_name,
          category: '',
          purchasePrice: '',
          retailPrice: '',
          quantity: '1',
          unit: 'шт',
          photos: [item.image_url],
          frontPhoto: item.image_url,
        }));
        setPendingProducts(loaded);
        console.log(`📦 Loaded ${loaded.length} pending products from database`);
      }
    };
    loadPendingProducts();

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

    // Подписка на реалтайм обновления временных фото товаров
    const tempPhotosChannel = supabase
      .channel('temp_photos_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'vremenno_product_foto'
        },
        (payload) => {
          console.log('🔄 New pending product added on another device');
          const newItem = payload.new as any;
          const newProduct: PendingProduct = {
            id: newItem.id,
            barcode: newItem.barcode,
            name: newItem.product_name,
            category: '',
            purchasePrice: '',
            retailPrice: '',
            quantity: '1',
            unit: 'шт',
            photos: [newItem.image_url],
            frontPhoto: newItem.image_url,
          };
          setPendingProducts(prev => {
            // Проверяем, не существует ли уже такой товар
            if (prev.some(p => p.id === newProduct.id)) {
              return prev;
            }
            return [newProduct, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'vremenno_product_foto'
        },
        (payload) => {
          console.log('🔄 Pending product deleted on another device');
          const deletedId = payload.old.id;
          setPendingProducts(prev => prev.filter(p => p.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(suppliersChannel);
      supabase.removeChannel(tempPhotosChannel);
    };
  }, []);

  const handleScan = async (data: { barcode: string; name?: string; category?: string; photoUrl?: string; capturedImage?: string; quantity?: number; frontPhoto?: string; barcodePhoto?: string; expiryDate?: string; manufacturingDate?: string; autoAddToProducts?: boolean; existingProductId?: string } | string) => {
    const barcodeData = typeof data === 'string' ? { barcode: data } : data;
    
    // КРИТИЧНО: Автоматическое добавление к существующему товару
    if (barcodeData.autoAddToProducts && barcodeData.existingProductId) {
      try {
        console.log('🚀 Автоматическое добавление к существующему товару:', barcodeData.existingProductId);
        
        // Получаем текущий товар
        const { data: existingProduct, error: fetchError } = await supabase
          .from('products')
          .select('*')
          .eq('id', barcodeData.existingProductId)
          .single();
        
        if (fetchError || !existingProduct) {
          toast.error('Ошибка получения товара из базы');
          return;
        }
        
        // Увеличиваем количество на 1
        const newQuantity = existingProduct.quantity + 1;
        
        const { error: updateError } = await supabase
          .from('products')
          .update({ quantity: newQuantity })
          .eq('id', barcodeData.existingProductId);
        
        if (updateError) {
          console.error('Ошибка обновления количества:', updateError);
          toast.error('Ошибка обновления количества товара');
          return;
        }
        
        // Сохраняем фото если есть
        const allPhotos = [
          ...(barcodeData.frontPhoto ? [barcodeData.frontPhoto] : []),
          ...(barcodeData.barcodePhoto ? [barcodeData.barcodePhoto] : [])
        ];
        
        if (allPhotos.length > 0 && barcodeData.barcode && barcodeData.name) {
          console.log('📸 Сохранение фото в product_images...');
          for (const photoUrl of allPhotos) {
            await saveProductImage(barcodeData.barcode, barcodeData.name, photoUrl);
          }
        }
        
        toast.success(`✅ Добавлено: ${existingProduct.name} (${newQuantity} ${existingProduct.unit})`);
        addLog(`Автодобавление: ${existingProduct.name} +1 (всего: ${newQuantity})`);
        
        setShowAIScanner(false);
        setAiScanMode('product');
        
        return;
      } catch (error: any) {
        console.error('Ошибка автодобавления:', error);
        toast.error('Ошибка при автоматическом добавлении товара');
        return;
      }
    }
    
    // Если это режим двух фото
    if (aiScanMode === 'dual' && barcodeData.frontPhoto && barcodeData.barcodePhoto) {
      try {
        const sanitizedBarcode = barcodeData.barcode?.trim().replace(/[<>'"]/g, '') || '';
        
        console.log('📸 Обработка режима двух фото (dual)');

        // Проверяем обязательные поля
        if (!sanitizedBarcode) {
          toast.error('❌ Штрихкод не распознан');
          return;
        }
        
        if (!barcodeData.name) {
          toast.error('❌ Название товара не распознано');
          return;
        }
        
        // 1. ЗАПОЛНЯЕМ ПОЛЯ ФОРМЫ ВНИЗУ
        console.log('✍️ Заполняем форму внизу:', { barcode: sanitizedBarcode, name: barcodeData.name });
        setCurrentProduct(prev => ({
          ...prev,
          barcode: sanitizedBarcode,
          name: barcodeData.name,
          category: barcodeData.category || prev.category
        }));
        
        // 2. Собираем все фотографии (до 3 штук) и добавляем в поле "фото"
        const allPhotos = [barcodeData.frontPhoto, barcodeData.barcodePhoto];
        setPhotos(allPhotos);
        setTempFrontPhoto(barcodeData.frontPhoto);
        setTempBarcodePhoto(barcodeData.barcodePhoto);
        
        // 3. Ищем товар в базе для автозаполнения цен
        const existing = await findProductByBarcode(sanitizedBarcode);
        
        if (existing) {
          // Автозаполняем цены из базы
          setCurrentProduct(prev => ({
            ...prev,
            category: existing.category,
            purchasePrice: existing.purchasePrice.toString(),
            retailPrice: existing.retailPrice.toString(),
            unit: existing.unit,
            supplier: existing.supplier || prev.supplier
          }));
        }
        
        // 4. ТАКЖЕ добавляем товар в очередь
        const newPendingProduct: PendingProduct = {
          id: `pending-${Date.now()}-${Math.random()}`,
          barcode: sanitizedBarcode,
          name: barcodeData.name,
          category: barcodeData.category || (existing?.category || ''),
          purchasePrice: existing?.purchasePrice.toString() || '',
          retailPrice: existing?.retailPrice.toString() || '',
          quantity: '1',
          unit: existing?.unit || 'шт',
          expiryDate: '',
          supplier: existing?.supplier || '',
          photos: allPhotos,
          frontPhoto: barcodeData.frontPhoto,
          barcodePhoto: barcodeData.barcodePhoto,
        };
        
        setPendingProducts(prev => [...prev, newPendingProduct]);
        
        // 5. Сохраняем фотографии в product_images для истории
        console.log(`💾 Сохраняем ${allPhotos.length} фото в базу...`);
        for (const photoUrl of allPhotos) {
          await saveProductImage(sanitizedBarcode, barcodeData.name, photoUrl);
        }
        
        // 6. Уведомления
        if (existing) {
          toast.success(`✅ "${barcodeData.name}" - форма заполнена и добавлен в очередь! Цены из базы`);
        } else {
          toast.success(`✅ "${barcodeData.name}" - форма заполнена и добавлен в очередь! Введите цены`);
        }
        
        addLog(`AI-сканирование: ${barcodeData.name} (${sanitizedBarcode}) - форма заполнена + в очередь`);
        
        // Закрываем сканер
        setShowAIScanner(false);
        setAiScanMode('product');
        
      } catch (error: any) {
        console.error('❌ Ошибка handleScan:', error);
        toast.error(`❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`);
      }
      return;
    }
    
    // Если это режим распознавания срока годности
    if (aiScanMode === 'expiry') {
      console.log('📅 Обработка распознанных дат:', { expiryDate: barcodeData.expiryDate, manufacturingDate: barcodeData.manufacturingDate });
      
      if (barcodeData.expiryDate) {
        setCurrentProduct({ ...currentProduct, expiryDate: barcodeData.expiryDate });
        toast.success(`✅ Срок годности: ${new Date(barcodeData.expiryDate).toLocaleDateString('ru-RU')}`);
      }
      
      if (barcodeData.manufacturingDate) {
        toast.info(`📦 Дата производства: ${new Date(barcodeData.manufacturingDate).toLocaleDateString('ru-RU')}`);
      }
      
      // Добавляем фото в список
      if (barcodeData.capturedImage && !photos.includes(barcodeData.capturedImage)) {
        setPhotos([...photos, barcodeData.capturedImage]);
      }
      
      setShowAIScanner(false);
      return;
    }
    
    const sanitizedBarcode = barcodeData.barcode?.trim().replace(/[<>'"]/g, '') || '';
    
    if (!sanitizedBarcode && !barcodeData.name && !barcodeData.category) {
      console.log('AI вернул пустые значения, пропускаем');
      return;
    }
    
    // Автозаполнение полей формы при обычном распознавании
    if (sanitizedBarcode) {
      setCurrentProduct(prev => ({ ...prev, barcode: sanitizedBarcode }));
    }
    if (barcodeData.name) {
      setCurrentProduct(prev => ({ ...prev, name: barcodeData.name || '' }));
    }
    if (barcodeData.category) {
      setCurrentProduct(prev => ({ ...prev, category: barcodeData.category || '' }));
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

  const handleRecognizeExpiry = async () => {
    if (photos.length === 0) {
      toast.error('Загрузите фото упаковки с датами');
      return;
    }

    setIsRecognizingExpiry(true);
    try {
      // Используем последнее загруженное фото
      const imageBase64 = photos[photos.length - 1];
      
      const { data: functionData, error: functionError } = await supabase.functions.invoke('recognize-expiry-date', {
        body: { imageBase64 }
      });

      if (functionError) {
        console.error('Ошибка функции:', functionError);
        throw functionError;
      }

      if (!functionData?.success) {
        throw new Error(functionData?.error || 'Не удалось распознать даты');
      }

      const { manufacturingDate, expiryDate, confidence } = functionData;

      if (expiryDate) {
        setCurrentProduct({ ...currentProduct, expiryDate });
        toast.success(`✅ Срок годности: ${expiryDate}${manufacturingDate ? `, изготовлено: ${manufacturingDate}` : ''} (точность: ${Math.round(confidence * 100)}%)`);
      } else if (manufacturingDate) {
        toast.info(`ℹ️ Найдена только дата изготовления: ${manufacturingDate}`);
      } else {
        toast.warning('⚠️ Даты не найдены на изображении. Попробуйте сфотографировать упаковку более четко.');
      }

    } catch (error: any) {
      console.error('Ошибка распознавания срока годности:', error);
      toast.error('Ошибка при распознавании дат. Попробуйте еще раз.');
    } finally {
      setIsRecognizingExpiry(false);
    }
  };

  const handleUpdatePendingProduct = (id: string, updates: Partial<PendingProduct>) => {
    setPendingProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  const handleRemovePendingProduct = async (id: string) => {
    setPendingProducts(prev => prev.filter(p => p.id !== id));
    
    // Также удаляем из временной таблицы
    try {
      const { error } = await supabase
        .from('vremenno_product_foto')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error('Ошибка удаления из временной таблицы:', error);
      }
    } catch (err) {
      console.error('Ошибка при удалении:', err);
    }
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

      const totalProducts = pendingProducts.length;
      toast.info(`📦 Начинаем сохранение ${totalProducts} товаров...`);

      let successCount = 0;
      let errorCount = 0;
      const savedProductIds: string[] = [];

      for (let i = 0; i < pendingProducts.length; i++) {
        const product = pendingProducts[i];
        
        // Проверка на дублирование
        if (product.barcode) {
          const { data: existing } = await supabase
            .from('products')
            .select('id')
            .eq('barcode', product.barcode)
            .maybeSingle();
          
          if (existing) {
            console.log(`⚠️ Товар с баркодом ${product.barcode} уже существует, пропускаем`);
            savedProductIds.push(product.id);
            continue;
          }
        }
        
        try {
          // Сохраняем фотографии - собираем все уникальные фото
          const allPhotos = [...new Set([
            ...product.photos,
            ...(product.frontPhoto ? [product.frontPhoto] : []),
            ...(product.barcodePhoto ? [product.barcodePhoto] : [])
          ])];

          console.log(`📸 [${i + 1}/${totalProducts}] Сохранение ${allPhotos.length} фото для товара ${product.name}`);

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
            savedProductIds.push(product.id);
            addLog(`Добавлен товар: ${product.name} (${product.quantity} ${product.unit})`);
            console.log(`✅ [${i + 1}/${totalProducts}] Товар "${product.name}" сохранен`);
          } else {
            errorCount++;
            console.error(`❌ [${i + 1}/${totalProducts}] Не удалось сохранить "${product.name}"`);
          }
        } catch (error) {
          console.error(`❌ [${i + 1}/${totalProducts}] Ошибка сохранения товара "${product.name}":`, error);
          errorCount++;
        }
      }

      // Удаляем успешно сохраненные товары из временной таблицы
      if (savedProductIds.length > 0) {
        console.log(`🗑️ Удаление ${savedProductIds.length} товаров из временной таблицы...`);
        
        for (const productId of savedProductIds) {
          try {
            const { error: deleteError } = await supabase
              .from('vremenno_product_foto')
              .delete()
              .eq('id', productId);
            
            if (deleteError) {
              console.error('Ошибка удаления из временной таблицы:', deleteError);
            }
          } catch (err) {
            console.error('Ошибка при удалении:', err);
          }
        }
      }

      // Очищаем список pending products
      if (successCount > 0) {
        toast.success(`✅ Сохранено товаров: ${successCount} из ${totalProducts}`);
        setPendingProducts([]);
      }
      
      if (errorCount > 0) {
        toast.error(`❌ Ошибок при сохранении: ${errorCount} из ${totalProducts}`);
      }
    } catch (error: any) {
      console.error('Ошибка массового сохранения:', error);
      toast.error('Ошибка при сохранении товаров');
    }
  };

  const handleClearAllProducts = async () => {
    if (confirm(`Очистить очередь из ${pendingProducts.length} товаров?`)) {
      // Удаляем все товары из временной таблицы
      try {
        const productIds = pendingProducts.map(p => p.id);
        
        if (productIds.length > 0) {
          const { error } = await supabase
            .from('vremenno_product_foto')
            .delete()
            .in('id', productIds);
          
          if (error) {
            console.error('Ошибка очистки временной таблицы:', error);
          }
        }
      } catch (err) {
        console.error('Ошибка при очистке:', err);
      }
      
      setPendingProducts([]);
      toast.info('Очередь очищена');
    }
  };

  const addProduct = async () => {
    try {
      console.log('🔄 Добавление товара в очередь...');
      
      console.log('🔐 Проверка авторизации...');
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.error('❌ Ошибка авторизации');
        toast.error('⚠️ Вы не авторизованы. Пожалуйста, войдите в систему.');
        return;
      }
      
      console.log('✅ Пользователь авторизован:', user.id);
      
      // Проверка только обязательных полей: штрихкод, название, категория
      console.log('📋 Проверка обязательных полей...');
      if (!currentProduct.barcode?.trim()) {
        console.error('❌ Штрихкод пустой');
        toast.error('❌ Введите штрихкод товара');
        return;
      }
      
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
      
      console.log('✅ Обязательные поля заполнены');

      // Определяем какие фотографии сохранять
      let frontPhoto = tempFrontPhoto || '';
      let barcodePhoto = tempBarcodePhoto || '';
      
      // Если нет отдельных фото, используем обычные загруженные
      if (!frontPhoto && !barcodePhoto && photos.length > 0) {
        frontPhoto = photos[0]; // Первая фото как лицевая
        if (photos.length > 1) {
          barcodePhoto = photos[1]; // Вторая как штрихкод
        }
      }

      const imageUrl = frontPhoto || barcodePhoto || `https://via.placeholder.com/150?text=${encodeURIComponent(currentProduct.name)}`;

      // Добавляем товар в очередь (vremenno_product_foto)
      const { error: insertError } = await supabase
        .from('vremenno_product_foto')
        .insert({
          barcode: currentProduct.barcode,
          product_name: currentProduct.name,
          category: currentProduct.category,
          supplier: currentProduct.supplier || null,
          unit: currentProduct.unit,
          purchase_price: currentProduct.purchasePrice ? parseFloat(currentProduct.purchasePrice) : null,
          retail_price: currentProduct.retailPrice ? parseFloat(currentProduct.retailPrice) : null,
          quantity: currentProduct.quantity ? parseFloat(currentProduct.quantity) : null,
          expiry_date: currentProduct.expiryDate || null,
          payment_type: 'full',
          paid_amount: (currentProduct.purchasePrice && currentProduct.quantity) 
            ? parseFloat(currentProduct.purchasePrice) * parseFloat(currentProduct.quantity) 
            : 0,
          debt_amount: 0,
          image_url: imageUrl,
          storage_path: `product-photos/${currentProduct.barcode}-${Date.now()}`,
          front_photo: frontPhoto || null,
          barcode_photo: barcodePhoto || null,
          front_photo_storage_path: frontPhoto ? `product-photos/${currentProduct.barcode}-front-${Date.now()}` : null,
          barcode_photo_storage_path: barcodePhoto ? `product-photos/${currentProduct.barcode}-barcode-${Date.now()}` : null,
          created_by: user.id,
        });

      if (insertError) {
        console.error('❌ Ошибка добавления в очередь:', insertError);
        toast.error(`❌ Ошибка: ${insertError.message}`);
        return;
      }

      console.log('✅ Товар добавлен в очередь');
      toast.success('✅ Товар добавлен в очередь!');
      addLog(`Товар ${currentProduct.name} (${currentProduct.barcode}) добавлен в очередь`);
      
      // Очищаем форму и временные фото
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
      setTempFrontPhoto('');
      setTempBarcodePhoto('');
      setSuggestedProduct(null);
      localStorage.removeItem('inventory_form_data');
      
    } catch (error: any) {
      console.error('❌ КРИТИЧЕСКАЯ ОШИБКА:', error);
      toast.error(`❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`);
    }
  };

  // Удалена функция saveAllProducts - товары теперь сохраняются сразу при добавлении

  return (
    <div className="space-y-4">
      {/* AI Product Recognition - только для админов */}
      {isAdmin && showAIScanner && (
        <div className="fixed inset-0 bg-background z-50">
          <AIProductRecognition 
            onProductFound={handleScan}
            mode={aiScanMode}
            hasIncompleteProducts={pendingProducts.some(p => !p.barcode || !p.name)}
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

      {/* Tabs for Inventory and Returns */}
      <Tabs defaultValue="inventory" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="inventory">
            <Package className="h-4 w-4 mr-2" />
            Склад
          </TabsTrigger>
          <TabsTrigger value="returns">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Возврат товара
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-3 md:space-y-4">
          {/* Панель активных пользователей */}
          {isAdmin && otherUsersStates.length > 0 && (
          <Card className="p-3 bg-muted/30 border-primary/20">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary animate-pulse" />
              <div className="flex-1">
                <p className="text-xs font-medium text-foreground mb-1">
                  Активные пользователи ({otherUsersStates.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {otherUsersStates.map((state, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {state.userName}
                      {state.name && (
                        <span className="ml-1 text-muted-foreground">
                          → {state.name.substring(0, 15)}{state.name.length > 15 ? '...' : ''}
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Scanner and Import - Оптимизировано для мобильных */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2 md:gap-3">
          {/* Левая часть - AI кнопки */}
          {isAdmin && (
            <div className="flex gap-1.5 md:gap-2 flex-wrap">
              <Button 
                onClick={() => {
                  setAiScanMode('dual');
                  setShowAIScanner(true);
                  toast.info('📸 Сделайте 2 фото: сначала лицевая сторона, потом штрихкод');
                }}
                variant="secondary"
                size="sm"
                className="flex-1 min-w-[140px] md:min-w-[160px] whitespace-nowrap h-9 text-xs md:text-sm"
              >
                <Sparkles className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 flex-shrink-0" />
                <span className="truncate">AI Скан</span>
              </Button>
              <Button 
                onClick={() => {
                  setAiScanMode('expiry');
                  setShowAIScanner(true);
                  toast.info('📸 Сфотографируйте упаковку с датой производства и сроком годности');
                }}
                variant="outline"
                size="sm"
                className="flex-1 min-w-[120px] md:min-w-[140px] whitespace-nowrap h-9 text-xs md:text-sm"
              >
                <CalendarClock className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 flex-shrink-0" />
                <span className="truncate hidden xs:inline">Срок годности</span>
                <span className="truncate xs:hidden">Срок</span>
              </Button>
              
              {/* Кнопки импорта - только на десктопе */}
              <div className="hidden lg:flex gap-2 flex-wrap">
                <Button 
                  onClick={() => setShowImportDialog(true)} 
                  variant="outline"
                  className="whitespace-nowrap"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Импорт CSV
                </Button>
                <BulkImportButton />
                <BulkCSVImport />
              </div>
            </div>
          )}
          
          {/* Правая часть - USB сканер */}
          <div className="w-full lg:min-w-[280px]">
            <BarcodeScanner onScan={handleScan} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
        {/* Add Product Form */}
        <Card className="p-4 md:p-4 lg:p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          <h3 className="text-base md:text-base lg:text-lg font-semibold mb-4 md:mb-3 lg:mb-4 flex items-center gap-2 md:gap-2 sticky top-0 bg-card z-10 pb-2">
            <Plus className="h-5 w-5 md:h-5 md:w-5 flex-shrink-0" />
            <span className="truncate">Добавить товар</span>
          </h3>

          {showSuggestion && suggestedProduct && (
            <div className="mb-2 md:mb-3 p-2 md:p-3 bg-primary/10 border border-primary rounded-lg">
              <div className="flex justify-between items-start gap-1.5 md:gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[10px] md:text-xs">Товар найден!</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1 truncate">{suggestedProduct.name}</p>
                  <div className="text-[10px] md:text-xs space-y-0.5 md:space-y-1 mt-1 md:mt-2">
                    <div>Закуп: {suggestedProduct.purchasePrice}₽</div>
                    {isAdmin && <div>Розница: {suggestedProduct.retailPrice}₽</div>}
                    <div className="truncate">Категория: {suggestedProduct.category}</div>
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={acceptSuggestion} className="text-[10px] md:text-xs px-1.5 md:px-2 h-7 md:h-8">
                    ✓
                  </Button>
                  <Button size="sm" variant="ghost" onClick={rejectSuggestion} className="px-1.5 md:px-2 h-7 md:h-8">
                    <X className="h-3 w-3 md:h-4 md:w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4 md:space-y-3">
            {/* Индикатор других пользователей */}
            {isAdmin && otherUsersStates.length > 0 && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-xs md:text-xs text-blue-700 dark:text-blue-300 font-medium mb-1">
                  👥 {otherUsersStates.length} админ(ов) заполняют форму:
                </p>
                {otherUsersStates.map((state, idx) => (
                  <div key={state.userId} className="text-[10px] md:text-[10px] text-blue-600 dark:text-blue-400">
                    • {state.userName}: {state.name || state.barcode || 'начинает заполнение...'}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className="text-sm md:text-xs font-medium mb-1.5 block">
                Штрихкод <span className="text-destructive">*</span>
              </label>
              <Input
                className="text-sm md:text-sm h-11 md:h-9"
                value={currentProduct.barcode}
                onChange={(e) => setCurrentProduct({ ...currentProduct, barcode: e.target.value })}
                placeholder="Сканируйте"
              />
              {isAdmin && otherUsersStates.some(s => s.barcode) && (
                <div className="text-[10px] md:text-[10px] text-primary/70 mt-1 bg-primary/5 px-2 py-1 rounded">
                  👥 {otherUsersStates.filter(s => s.barcode).map(s => `${s.userName}: ${s.barcode}`).join(', ')}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm md:text-xs font-medium mb-1.5 block">
                Название <span className="text-destructive">*</span>
              </label>
              <Input
                className="text-sm md:text-sm h-11 md:h-9"
                value={currentProduct.name}
                onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                placeholder="Название"
              />
              {isAdmin && otherUsersStates.some(s => s.name) && (
                <div className="text-[10px] md:text-[10px] text-primary/70 mt-1 bg-primary/5 px-2 py-1 rounded">
                  👥 {otherUsersStates.filter(s => s.name).map(s => `${s.userName}: ${s.name}`).join(' | ')}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm md:text-xs font-medium mb-1.5 block">
                Категория <span className="text-destructive">*</span>
              </label>
              <Input
                className="text-sm md:text-sm h-11 md:h-9"
                value={currentProduct.category}
                onChange={(e) => setCurrentProduct({ ...currentProduct, category: e.target.value })}
                placeholder="Категория"
              />
              {isAdmin && otherUsersStates.some(s => s.category) && (
                <div className="text-[10px] md:text-[10px] text-primary/70 mt-1 bg-primary/5 px-2 py-1 rounded">
                  👥 {otherUsersStates.filter(s => s.category).map(s => `${s.userName}: ${s.category}`).join(' | ')}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm md:text-xs font-medium mb-1.5 block">Поставщик</label>
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
                <SelectTrigger className="text-sm md:text-sm h-11 md:h-9">
                  <SelectValue placeholder="Выбрать" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="__add_new__" className="text-primary font-medium text-sm md:text-xs">
                    + Добавить
                  </SelectItem>
                  {[...suppliers]
                    .sort((a, b) => {
                      if (a.name === 'ААА') return -1;
                      if (b.name === 'ААА') return 1;
                      return a.name.localeCompare(b.name);
                    })
                    .map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.name} className="text-sm md:text-xs">
                        {supplier.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {isAdmin && otherUsersStates.some(s => s.supplier) && (
                <div className="text-[10px] md:text-[10px] text-primary/70 mt-1 bg-primary/5 px-2 py-1 rounded">
                  👥 {otherUsersStates.filter(s => s.supplier).map(s => `${s.userName}: ${s.supplier}`).join(' | ')}
                </div>
              )}
            </div>

            {/* Одна колонка на мобильных для цен */}
            <div>
              <label className="text-sm md:text-xs font-medium mb-1.5 block">
                Закуп (₽) <span className="text-destructive">*</span>
              </label>
              <Input
                className="text-sm md:text-sm h-11 md:h-9"
                type="number"
                step="0.01"
                value={currentProduct.purchasePrice}
                onChange={(e) => setCurrentProduct({ ...currentProduct, purchasePrice: e.target.value })}
                placeholder="0"
              />
              {isAdmin && otherUsersStates.some(s => s.purchasePrice) && (
                <div className="text-[10px] md:text-[10px] text-primary/70 mt-1 bg-primary/5 px-2 py-1 rounded">
                  👥 {otherUsersStates.filter(s => s.purchasePrice).map(s => `${s.userName}: ${s.purchasePrice}₽`).join(' | ')}
                </div>
              )}
            </div>

            {isAdmin && (
              <div>
                <label className="text-sm md:text-xs font-medium mb-1.5 block">
                  Розница (₽) <span className="text-destructive">*</span>
                </label>
                <Input
                  className="text-sm md:text-sm h-11 md:h-9"
                  type="number"
                  step="0.01"
                  value={currentProduct.retailPrice}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, retailPrice: e.target.value })}
                  placeholder="0"
                />
                {otherUsersStates.some(s => s.retailPrice) && (
                  <div className="text-[10px] md:text-[10px] text-primary/70 mt-1 bg-primary/5 px-2 py-1 rounded">
                    👥 {otherUsersStates.filter(s => s.retailPrice).map(s => `${s.userName}: ${s.retailPrice}₽`).join(' | ')}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 md:gap-2">
              <div>
                <label className="text-sm md:text-xs font-medium mb-1.5 block">
                  Кол-во <span className="text-destructive">*</span>
                </label>
                <Input
                  className="text-sm md:text-sm h-11 md:h-9"
                  type="number"
                  step="0.01"
                  value={currentProduct.quantity}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-sm md:text-xs font-medium mb-1.5 block">
                  Ед. <span className="text-destructive">*</span>
                </label>
                <Select
                  value={currentProduct.unit}
                  onValueChange={(value: 'шт' | 'кг') => 
                    setCurrentProduct({ ...currentProduct, unit: value })
                  }
                >
                  <SelectTrigger className="text-sm md:text-sm h-11 md:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="шт" className="text-sm md:text-xs">шт</SelectItem>
                    <SelectItem value="кг" className="text-sm md:text-xs">кг</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm md:text-xs font-medium mb-1.5 block">Срок</label>
              <div className="flex gap-2 md:gap-2">
                <Input
                  className="text-sm md:text-sm flex-1 h-11 md:h-9"
                  type="date"
                  value={currentProduct.expiryDate}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, expiryDate: e.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleRecognizeExpiry}
                  disabled={isRecognizingExpiry || photos.length === 0}
                  title="AI"
                  className="h-11 w-11 md:h-9 md:w-9 flex-shrink-0"
                >
                  <CalendarClock className={`h-5 w-5 md:h-4 md:w-4 ${isRecognizingExpiry ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              <p className="text-xs md:text-[10px] text-muted-foreground mt-1">
                {photos.length > 0 ? 'AI кнопка' : 'Загрузите фото'}
              </p>
            </div>

            <div>
              <label className="text-sm md:text-xs font-medium mb-1.5 block">Фото (до 3)</label>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="text-sm md:text-xs h-11 md:h-9"
              />
              {photos.length > 0 && (
                <div className="flex gap-2 md:gap-2 mt-2 md:mt-2 flex-wrap">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img src={photo} alt={`${idx + 1}`} className="h-16 w-16 md:h-14 md:w-14 object-cover rounded border" />
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-6 w-6 md:h-5 md:w-5 rounded-full p-0"
                        onClick={() => removePhoto(idx)}
                      >
                        <X className="h-3 w-3 md:h-3 md:w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={addProduct} className="w-full h-12 md:h-10 text-base md:text-sm font-medium mt-2">
              <Plus className="h-5 w-5 md:h-4 md:w-4 mr-2 md:mr-2" />
              В очередь
            </Button>
          </div>
        </Card>
        </div>
        </TabsContent>

        <TabsContent value="returns">
          <ProductReturnsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
