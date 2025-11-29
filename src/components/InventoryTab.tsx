import { useState, useEffect } from 'react';
import { Scan, Plus, Package, X, Camera, Upload, CalendarClock, Sparkles, Users, ArrowLeft, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarcodeScanner } from './BarcodeScanner';
import { AIProductRecognition } from './AIProductRecognition';
import { PhotoGalleryRecognition } from './PhotoGalleryRecognition';
import { CSVImportDialog } from './CSVImportDialog';
import { BulkImportButton } from './BulkImportButton';
import { BulkCSVImport } from './BulkCSVImport';
import { QuickSupplierDialog } from './QuickSupplierDialog';
import { PendingProduct } from './PendingProductItem';
import { ProductReturnsTab } from './ProductReturnsTab';

import { addLog } from '@/lib/auth';
import { toast } from 'sonner';
import { findProductByBarcode, saveProduct, StoredProduct, saveProductImage, upsertProduct, getProductById, updateProductById } from '@/lib/storage';
import { saveProductWithBarcodeGeneration } from '@/lib/productWithBarcodePrint';
import { getSuppliers, Supplier } from '@/lib/suppliersDb';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { addToQueue, getQueueProducts, subscribeToQueue, deleteQueueItem } from '@/lib/firebaseCollections';
import { useFormSync } from '@/hooks/useFormSync';
import { useFirebaseProducts } from '@/hooks/useFirebaseProducts';
import { retryOperation } from '@/lib/retryUtils';

import { getCurrentLoginUser } from '@/lib/loginAuth';
import { findProductInDatabase } from '@/lib/productsDatabase';
import { findPricesByBarcode } from '@/lib/csvPriceLoader';

export const InventoryTab = () => {
  const [userRole, setUserRole] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserLogin, setCurrentUserLogin] = useState<string>('');
  const isAdmin = userRole === 'admin';
  const canUseAI = userRole === 'admin' || userRole === 'inventory' || userRole === 'system';

  // Получаем роль пользователя при загрузке
  useEffect(() => {
    const loadUserRole = async () => {
      const user = await getCurrentLoginUser();
      console.log('👤 InventoryTab: User loaded', user);
      if (user) {
        setUserRole(user.role);
        setCurrentUserId(user.id);
        setCurrentUserLogin(user.login);
        console.log('✅ InventoryTab: Role set to', user.role);
        console.log('🔐 canUseAI will be:', user.role === 'admin' || user.role === 'inventory');
      }
    };
    loadUserRole();
  }, []);

  // Firebase realtime синхронизация товаров
  const { refetch: refetchProducts } = useFirebaseProducts();

  const [suggestedProduct, setSuggestedProduct] = useState<StoredProduct | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [showAIScanner, setShowAIScanner] = useState(false);
  const [showPhotoGallery, setShowPhotoGallery] = useState(false);
  const [aiScanMode, setAiScanMode] = useState<'product' | 'barcode' | 'expiry' | 'dual'>('product');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [photoStep, setPhotoStep] = useState<'front' | 'barcode' | 'none'>('none');
  const [tempFrontPhoto, setTempFrontPhoto] = useState<string>('');
  const [tempBarcodePhoto, setTempBarcodePhoto] = useState<string>('');
  const [isRecognizingExpiry, setIsRecognizingExpiry] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [queuePage, setQueuePage] = useState(1);
  const [queueTotal, setQueueTotal] = useState(0);
  const ITEMS_PER_PAGE = 50;
  
  // Вычисляем права доступа на основе текущей роли (динамически)
  const canSaveSingle = (userRole === 'admin' || userRole === 'inventory') || (localStorage.getItem('can_save_single') !== 'false');
  const canSaveQueue = (userRole === 'admin' || userRole === 'inventory') || (localStorage.getItem('can_save_queue') !== 'false');

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
          unit: 'шт',
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
      unit: 'шт',
      expiryDate: '',
      supplier: '',
    };
  });

  // Функция автоопределения категории по названию товара
  const determineCategoryFromName = (productName: string): string => {
    const name = productName.toLowerCase();
    
    // Продукты питания
    if (name.includes('хлеб') || name.includes('молоко') || name.includes('сыр') || 
        name.includes('масло') || name.includes('мясо') || name.includes('колбаса') ||
        name.includes('сосиски') || name.includes('яйц') || name.includes('творог') ||
        name.includes('йогурт') || name.includes('кефир') || name.includes('сметана') ||
        name.includes('мука') || name.includes('сахар') || name.includes('соль')) {
      return 'Продукты питания';
    }
    
    // Напитки
    if (name.includes('вода') || name.includes('сок') || name.includes('газировка') ||
        name.includes('кола') || name.includes('пепси') || name.includes('фанта') ||
        name.includes('спрайт') || name.includes('лимонад') || name.includes('чай') ||
        name.includes('кофе') || name.includes('напиток') || name.includes('drink') ||
        name.includes('juice')) {
      return 'Напитки';
    }
    
    // Бытовая химия
    if (name.includes('порошок') || name.includes('моющ') || name.includes('чист') ||
        name.includes('мыло') || name.includes('гель') || name.includes('отбеливатель') ||
        name.includes('средство для')) {
      return 'Бытовая химия';
    }
    
    // Косметика
    if (name.includes('шампунь') || name.includes('кондиционер') || name.includes('крем') || 
        name.includes('лосьон') || name.includes('помада') || name.includes('тушь') || 
        name.includes('маска') || name.includes('скраб') || name.includes('дезодорант') || 
        name.includes('парфюм')) {
      return 'Косметика';
    }
    
    // Детские товары
    if (name.includes('детск') || name.includes('памперс') || name.includes('подгузник') ||
        name.includes('соска') || name.includes('бутылочка') || name.includes('игрушка') ||
        name.includes('baby') || name.includes('kid') || name.includes('cup')) {
      return 'Детские товары';
    }
    
    return 'Другое';
  };

  // Сохраняем состояние формы при изменении
  useEffect(() => {
    localStorage.setItem('inventory_form_data', JSON.stringify(currentProduct));
  }, [currentProduct]);

  // Автозаполнение категории при изменении названия
  useEffect(() => {
    if (currentProduct.name && !currentProduct.category) {
      const autoCategory = determineCategoryFromName(currentProduct.name);
      setCurrentProduct(prev => ({ ...prev, category: autoCategory }));
    }
  }, [currentProduct.name]);

  // Автосохранение при заполнении обязательных полей
  useEffect(() => {
    const autoSaveProduct = async () => {
      // Минимальные обязательные поля: штрихкод и название
      const hasMinimumFields = currentProduct.barcode?.trim() && currentProduct.name?.trim();
      
      if (!hasMinimumFields) return;
      if (!currentUserId) return;

      // Проверяем права доступа
      if (userRole !== 'admin' && userRole !== 'inventory' && !canSaveQueue) return;

      // Автоопределяем категорию, если не заполнена
      const category = currentProduct.category || determineCategoryFromName(currentProduct.name);

      const hasBothPrices = currentProduct.purchasePrice && 
                           currentProduct.retailPrice && 
                           parseFloat(currentProduct.purchasePrice) > 0 && 
                           parseFloat(currentProduct.retailPrice) > 0;

      const hasQuantity = currentProduct.quantity && parseFloat(currentProduct.quantity) > 0;

      // Если НЕ ВСЕ поля заполнены (нет обеих цен или количества), сохраняем
      if (!hasBothPrices || !hasQuantity) return;

      console.log('🔄 Автосохранение товара...');

      try {
        const purchasePrice = parseFloat(currentProduct.purchasePrice);
        const retailPrice = parseFloat(currentProduct.retailPrice);
        const quantity = parseFloat(currentProduct.quantity);

        // Определяем фото
        let frontPhoto = tempFrontPhoto || '';
        let barcodePhoto = tempBarcodePhoto || '';
        
        if (!frontPhoto && !barcodePhoto && photos.length > 0) {
          frontPhoto = photos[0];
          if (photos.length > 1) {
            barcodePhoto = photos[1];
          }
        }

        if (hasBothPrices && hasQuantity) {
          // Если обе цены и количество заполнены - сохраняем в Firebase (UPSERT)
          const result = await upsertProduct({
            barcode: currentProduct.barcode,
            name: currentProduct.name,
            category,
            supplier: currentProduct.supplier || null,
            unit: currentProduct.unit,
            purchase_price: purchasePrice,
            sale_price: retailPrice,
            quantity: quantity,
            expiry_date: currentProduct.expiryDate || null,
            created_by: currentUserId,
          });

          if (!result.success) {
            console.error('❌ Ошибка сохранения товара');
            toast.error('❌ Ошибка сохранения товара');
            return;
          }

          if (result.isUpdate) {
            toast.success(`✅ Товар "${currentProduct.name}" обновлен! Новое количество: ${result.newQuantity}`);
          } else {
            toast.success(`✅ Товар "${currentProduct.name}" добавлен в базу!`);
          }

          // Сохраняем фото если есть
          if (frontPhoto || barcodePhoto) {
            if (frontPhoto) await saveProductImage(currentProduct.barcode, currentProduct.name, frontPhoto, currentUserId);
            if (barcodePhoto) await saveProductImage(currentProduct.barcode, currentProduct.name, barcodePhoto, currentUserId);
          }

          addLog(`Автосохранение: ${currentProduct.name} (${currentProduct.barcode})`);
        }

        // Очищаем форму
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
        console.error('❌ Ошибка автосохранения:', error);
      }
    };

    // Debounce - ждем 1.5 секунды после последнего изменения
    const timer = setTimeout(() => {
      autoSaveProduct();
    }, 1500);

    return () => clearTimeout(timer);
  }, [currentProduct, currentUserId, userRole, canSaveQueue, photos, tempFrontPhoto, tempBarcodePhoto]);

  // Автоматическое добавление в очередь, если нет обеих цен но есть название и штрихкод
  useEffect(() => {
    const autoAddToQueue = async () => {
      // Проверяем минимальные поля
      const hasMinimumFields = currentProduct.barcode?.trim() && currentProduct.name?.trim();
      if (!hasMinimumFields) return;
      if (!currentUserId) return;

      // Проверяем права доступа
      if (userRole !== 'admin' && userRole !== 'inventory' && !canSaveQueue) return;

      // Автоопределяем категорию
      const category = currentProduct.category || determineCategoryFromName(currentProduct.name);

      const hasBothPrices = currentProduct.purchasePrice && 
                           currentProduct.retailPrice && 
                           parseFloat(currentProduct.purchasePrice) > 0 && 
                           parseFloat(currentProduct.retailPrice) > 0;

      // Если обе цены ЕСТЬ - не добавляем в очередь (товар сохранится через автосохранение в products)
      if (hasBothPrices) return;

      // Если нет обеих цен - добавляем в очередь
      console.log('🔄 Автоматическое добавление в очередь...');

      try {
        // Определяем фото
        let frontPhoto = tempFrontPhoto || '';
        let barcodePhoto = tempBarcodePhoto || '';
        
        if (!frontPhoto && !barcodePhoto && photos.length > 0) {
          frontPhoto = photos[0];
          if (photos.length > 1) {
            barcodePhoto = photos[1];
          }
        }

        const queueData = {
          product_name: currentProduct.name,
          barcode: currentProduct.barcode,
          category,
          purchase_price: currentProduct.purchasePrice ? parseFloat(currentProduct.purchasePrice) : null,
          retail_price: currentProduct.retailPrice ? parseFloat(currentProduct.retailPrice) : null,
          quantity: currentProduct.quantity ? parseInt(currentProduct.quantity) : null,
          supplier: currentProduct.supplier || null,
          expiry_date: currentProduct.expiryDate || null,
          unit: currentProduct.unit,
          payment_type: 'full',
          paid_amount: null,
          debt_amount: null,
          image_url: frontPhoto || '',
          storage_path: frontPhoto || '',
          front_photo: frontPhoto || null,
          barcode_photo: barcodePhoto || null,
          created_by: currentUserId,
        };

        // Добавляем в очередь Firebase
        await retryOperation(
          async () => {
            await addToQueue({
              barcode: currentProduct.barcode,
              product_name: currentProduct.name,
              category,
              quantity: currentProduct.quantity ? parseInt(currentProduct.quantity) : 1,
              front_photo: frontPhoto || undefined,
              barcode_photo: barcodePhoto || undefined,
              image_url: frontPhoto || barcodePhoto || undefined,
              created_by: currentUserId
            });
            toast.success(`✅ Товар "${currentProduct.name}" добавлен в очередь!`);
          },
          {
            maxAttempts: 5,
            initialDelay: 1000,
            onRetry: (attempt) => {
              console.log(`🔄 Повторная попытка сохранения "${currentProduct.name}" в очередь (попытка ${attempt})...`);
            }
          }
        ).catch((error) => {
          console.error('❌ Не удалось сохранить в очередь после нескольких попыток:', error);
          toast.error('Ошибка сохранения в очередь. Попробуйте еще раз.');
        });

        // Сохраняем фото если есть
        if (frontPhoto || barcodePhoto) {
          if (frontPhoto) await saveProductImage(currentProduct.barcode, currentProduct.name, frontPhoto, currentUserId);
          if (barcodePhoto) await saveProductImage(currentProduct.barcode, currentProduct.name, barcodePhoto, currentUserId);
        }

        toast.success(`✅ Товар "${currentProduct.name}" добавлен в очередь!`);
        addLog(`Добавлено в очередь: ${currentProduct.name} (${currentProduct.barcode})`);

        // Очищаем форму
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
        console.error('❌ Ошибка добавления в очередь:', error);
      }
    };

    // Debounce - ждем 2 секунды после последнего изменения
    const timer = setTimeout(() => {
      autoAddToQueue();
    }, 2000);

    return () => clearTimeout(timer);
  }, [currentProduct, currentUserId, userRole, canSaveQueue, photos, tempFrontPhoto, tempBarcodePhoto]);

  // Автоматический поиск товара в базе данных по штрихкоду
  useEffect(() => {
    const searchInDatabase = async () => {
      // Ищем только если штрихкод не пустой и цены еще не заполнены
      if (!currentProduct.barcode || currentProduct.barcode.trim().length < 3) {
        return;
      }

      // Не перезаписываем цены если они уже заполнены
      if (currentProduct.purchasePrice && currentProduct.retailPrice) {
        return;
      }

      const found = await findProductInDatabase(currentProduct.barcode);
      if (found) {
        console.log('💡 Автозаполнение из базы данных:', found);
        
        setCurrentProduct(prev => ({
          ...prev,
          // Заполняем название только если оно пустое
          name: prev.name || found.name,
          // Заполняем цены только если они пустые
          purchasePrice: prev.purchasePrice || found.purchasePrice.toString(),
          retailPrice: prev.retailPrice || found.retailPrice.toString(),
        }));

        toast.success(`Товар найден в базе: ${found.name}`, {
          description: `Закуп: ${found.purchasePrice} ₽, Розница: ${found.retailPrice} ₽`
        });
      }
    };

    // Добавляем небольшую задержку для избежания частых запросов при вводе
    const timeoutId = setTimeout(searchInDatabase, 500);
    return () => clearTimeout(timeoutId);
  }, [currentProduct.barcode]);

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

  // Подписка на изменения формы отключена (Supabase таблица убрана)
  // Синхронизация форм теперь через localStorage

  useEffect(() => {
    const loadSuppliers = async () => {
      const loadedSuppliers = await getSuppliers();
      setSuppliers(loadedSuppliers);
    };
    loadSuppliers();

    // Загрузка pending products из Firebase
    const loadPendingProducts = async () => {
      try {
        const items = await getQueueProducts();
        setQueueTotal(items.length);
        
        const from = (queuePage - 1) * ITEMS_PER_PAGE;
        const pageItems = items.slice(from, from + ITEMS_PER_PAGE);
        
        if (pageItems.length > 0) {
          const loaded: PendingProduct[] = pageItems.map(item => {
            const photos = [];
            if (item.front_photo) photos.push(item.front_photo);
            if (item.barcode_photo) photos.push(item.barcode_photo);
            if (photos.length === 0 && item.image_url) photos.push(item.image_url);
            
            return {
              id: item.id,
              barcode: item.barcode || '',
              name: item.product_name || '',
              category: item.category || '',
              purchasePrice: '',
              retailPrice: '',
              quantity: item.quantity ? String(item.quantity) : '1',
              unit: 'шт',
              supplier: '',
              expiryDate: '',
              photos: photos,
              frontPhoto: item.front_photo || item.image_url || '',
              barcodePhoto: item.barcode_photo || '',
            };
          });
          setPendingProducts(loaded);
          console.log(`✅ Загружено ${loaded.length} из ${items.length} товаров (стр. ${queuePage})`);
        } else {
          setPendingProducts([]);
          console.log('📦 Очередь пуста');
        }
      } catch (err) {
        console.error('❌ Ошибка загрузки очереди:', err);
      }
    };
    loadPendingProducts();

    // Подписка на Firebase очередь
    const unsubscribeQueue = subscribeToQueue((items: any[]) => {
      const from = (queuePage - 1) * ITEMS_PER_PAGE;
      const pageItems = items.slice(from, from + ITEMS_PER_PAGE);
      const products = pageItems.map((item: any) => ({
        id: item.id,
        barcode: item.barcode || '',
        name: item.product_name || '',
        category: item.category || '',
        purchasePrice: '',
        retailPrice: '',
        quantity: (item.quantity || 1).toString(),
        unit: 'шт',
        photos: item.image_url ? [item.image_url] : [],
        frontPhoto: item.front_photo || item.image_url,
        barcodePhoto: item.barcode_photo,
      }));
      setPendingProducts(products);
      setQueueTotal(items.length);
    });

    return () => {
      unsubscribeQueue();
    };
  }, [queuePage]);

  const handleScan = async (data: { barcode: string; name?: string; category?: string; photoUrl?: string; capturedImage?: string; quantity?: number; frontPhoto?: string; barcodePhoto?: string; expiryDate?: string; manufacturingDate?: string; autoAddToProducts?: boolean; existingProductId?: string } | string) => {
    const barcodeData = typeof data === 'string' ? { barcode: data } : data;
    
    // КРИТИЧНО: Автоматическое добавление к существующему товару
    if (barcodeData.autoAddToProducts && barcodeData.existingProductId) {
      try {
        console.log('🚀 Автоматическое добавление к существующему товару:', barcodeData.existingProductId);
        
        // Получаем текущий товар из Firebase
        const existingProduct = await getProductById(barcodeData.existingProductId);
        
        if (!existingProduct) {
          toast.error('Ошибка получения товара из базы', { position: 'top-center' });
          return;
        }
        
        // Увеличиваем количество на 1
        const newQuantity = existingProduct.quantity + 1;
        
        const updated = await updateProductById(barcodeData.existingProductId, { quantity: newQuantity });
        
        if (!updated) {
          console.error('Ошибка обновления количества');
          toast.error('Ошибка обновления количества товара', { position: 'top-center' });
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
            await saveProductImage(barcodeData.barcode, barcodeData.name, photoUrl, currentUserId);
          }
        }
        
        toast.success(`✅ Добавлено: ${existingProduct.name} (${newQuantity} шт)`, { position: 'top-center' });
        addLog(`Автодобавление: ${existingProduct.name} +1 (всего: ${newQuantity})`);
        
        // Камера остается открытой для продолжения сканирования
        setAiScanMode('product');
        
        return;
      } catch (error: any) {
        console.error('Ошибка автодобавления:', error);
        toast.error('Ошибка при автоматическом добавлении товара', { position: 'top-center' });
        return;
      }
    }
    
    // Если это режим двух фото
    if (aiScanMode === 'dual' && barcodeData.frontPhoto && barcodeData.barcodePhoto) {
      try {
        const sanitizedBarcode = barcodeData.barcode?.trim().replace(/[<>'"]/g, '') || '';
        
        console.log('📸 Обработка режима двух фото (dual)');

        // Даже если что‑то не распознано, все равно стараемся заполнить форму
        if (!sanitizedBarcode) {
          toast.warning('Штрихкод не распознан', { duration: 2000 });
        }
        
        if (!barcodeData.name) {
          toast.warning('Название не распознано', { duration: 2000 });
        }
        
        // 1. ЗАПОЛНЯЕМ ПОЛЯ ФОРМЫ ВНИЗУ
        console.log('✍️ Заполняем форму внизу:', { barcode: sanitizedBarcode, name: barcodeData.name, category: barcodeData.category });
        setCurrentProduct(prev => ({
          ...prev,
          barcode: sanitizedBarcode || prev.barcode,
          name: barcodeData.name || prev.name,
          category: barcodeData.category || prev.category,
          quantity: prev.quantity || '1' // Устанавливаем количество по умолчанию
        }));
        
        // 2. Собираем все фотографии (до 2 штук) и добавляем в поле "фото"
        const allPhotos = [barcodeData.frontPhoto, barcodeData.barcodePhoto].filter(Boolean);
        setPhotos(allPhotos);
        if (barcodeData.frontPhoto) setTempFrontPhoto(barcodeData.frontPhoto);
        if (barcodeData.barcodePhoto) setTempBarcodePhoto(barcodeData.barcodePhoto);
        
        // 3. Ищем товар в базе для автозаполнения цен
        const existingProduct = await findProductByBarcode(sanitizedBarcode);
        
        // Если не нашли в основной базе, ищем в загруженной базе данных
        let databaseProduct = null;
        if (!existingProduct) {
          databaseProduct = await findProductInDatabase(sanitizedBarcode);
          console.log('💡 Поиск в базе данных товаров:', databaseProduct);
        }
        
        // Если не нашли в загруженной базе, ищем цены в CSV
        let csvPrices = null;
        if (!existingProduct && !databaseProduct) {
          csvPrices = await findPricesByBarcode(sanitizedBarcode);
          console.log('💡 Поиск цен в CSV базе:', csvPrices);
        }
        
        let hasPrices = false;
        let finalPurchasePrice = '';
        let finalRetailPrice = '';
        let finalUnit = 'шт';
        let finalSupplier = '';
        let finalCategory = barcodeData.category || '';

        // Если штрихкода нет, дальше в базу не лезем – форма уже заполнена выше
        if (!sanitizedBarcode) {
          toast.info('Форма заполнена, введите штрихкод', { duration: 2000 });
          addLog(`AI-сканирование (без штрихкода): ${barcodeData.name || ''}`);
          return;
        }
        
        if (existingProduct) {
          // Автозаполняем из основной базы
          finalPurchasePrice = existingProduct.purchasePrice.toString();
          finalRetailPrice = existingProduct.retailPrice.toString();
          finalUnit = existingProduct.unit;
          finalSupplier = existingProduct.supplier || '';
          finalCategory = existingProduct.category || barcodeData.category || '';
          hasPrices = true;
          
          setCurrentProduct(prev => ({
            ...prev,
            category: finalCategory,
            purchasePrice: finalPurchasePrice,
            retailPrice: finalRetailPrice,
            quantity: prev.quantity || '1',
            unit: finalUnit,
            supplier: finalSupplier
          }));
        } else if (databaseProduct) {
          // Автозаполняем ТОЛЬКО цены из загруженной базы данных
          console.log('✅ Заполняем цены из базы данных:', databaseProduct);
          finalPurchasePrice = databaseProduct.purchasePrice.toString();
          finalRetailPrice = databaseProduct.retailPrice.toString();
          hasPrices = true;
          
          setCurrentProduct(prev => ({
            ...prev,
            purchasePrice: finalPurchasePrice,
            retailPrice: finalRetailPrice,
            quantity: prev.quantity || '1'
          }));
          toast.success(`💡 Цены найдены в базе: закуп ${finalPurchasePrice} ₽, розница ${finalRetailPrice} ₽`, { position: 'top-center' });
        } else if (csvPrices) {
          // Автозаполняем цены из CSV базы данных
          console.log('✅ Заполняем цены из CSV базы:', csvPrices);
          finalPurchasePrice = csvPrices.purchase_price.toString();
          finalRetailPrice = csvPrices.sale_price.toString();
          hasPrices = true;
          
          setCurrentProduct(prev => ({
            ...prev,
            purchasePrice: finalPurchasePrice,
            retailPrice: finalRetailPrice,
            quantity: prev.quantity || '1'
          }));
          toast.success(`💡 Цены найдены в CSV: закуп ${finalPurchasePrice} ₽, розница ${finalRetailPrice} ₽`, { position: 'top-center' });
        }
        
        // 4. Сохраняем фотографии в product_images для истории
        console.log(`💾 Сохраняем ${allPhotos.length} фото в базу...`);
        for (const photoUrl of allPhotos) {
          await saveProductImage(sanitizedBarcode, barcodeData.name, photoUrl, currentUserId);
        }
        
        // 5. Сохраняем в базу ТОЛЬКО если есть цены
        console.log('💾 Проверка наличия цен перед сохранением...');
        
        const purchasePrice = hasPrices && finalPurchasePrice ? parseFloat(finalPurchasePrice) : 0;
        const retailPrice = hasPrices && finalRetailPrice ? parseFloat(finalRetailPrice) : 0;
        
        // Если цен нет - добавляем в очередь для ручного заполнения
        if (purchasePrice === 0 || retailPrice === 0) {
          console.log('⚠️ Цены не найдены - добавляем в очередь');
          
          const newPendingProduct: PendingProduct = {
            id: `pending-${Date.now()}-${Math.random()}`,
            barcode: sanitizedBarcode,
            name: barcodeData.name || '',
            category: finalCategory,
            purchasePrice: '',
            retailPrice: '',
            quantity: '1',
            unit: 'шт',
            expiryDate: '',
            supplier: finalSupplier,
            photos: allPhotos,
            frontPhoto: barcodeData.frontPhoto,
            barcodePhoto: barcodeData.barcodePhoto,
          };
          
          setPendingProducts(prev => [...prev, newPendingProduct]);
          
          // Сохраняем в Firebase очередь для синхронизации между устройствами
          try {
            await addToQueue({
              barcode: sanitizedBarcode,
              product_name: barcodeData.name || '',
              category: finalCategory,
              quantity: 1,
              front_photo: barcodeData.frontPhoto || undefined,
              barcode_photo: barcodeData.barcodePhoto || undefined,
              image_url: barcodeData.frontPhoto || barcodeData.barcodePhoto || undefined,
            });
          } catch (e) {
            console.log('Ошибка сохранения в очередь Firebase:', e);
          }
          
          toast.info(`📦 Товар добавлен в очередь: ${barcodeData.name || sanitizedBarcode}`, { 
            position: 'top-center',
            duration: 3000 
          });
          
          // Очищаем форму
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
          setTempFrontPhoto('');
          setTempBarcodePhoto('');
          
          addLog(`AI-сканирование: ${barcodeData.name || sanitizedBarcode} - добавлен в очередь (без цен)`);
          return;
        }
        
        console.log('💾 Сохраняем товар в Firebase с ценами...');
        
        // Используем Firebase upsert
        const result = await upsertProduct({
          barcode: sanitizedBarcode,
          name: barcodeData.name || sanitizedBarcode,
          category: finalCategory,
          supplier: finalSupplier || null,
          unit: finalUnit,
          purchase_price: purchasePrice,
          sale_price: retailPrice,
          quantity: 1,
          expiry_date: null,
          created_by: currentUserId
        });
        
        if (!result.success) {
          console.error('❌ Ошибка сохранения товара в Firebase');
          toast.error('❌ Ошибка сохранения товара в базе', { position: 'top-center' });
        } else if (result.isUpdate) {
          const priceInfo = hasPrices ? '' : ' (без цен - установите позже)';
          toast.success(`✅ "${barcodeData.name}" обновлен в базе (количество: ${result.newQuantity})${priceInfo}!`, { position: 'top-center' });
          addLog(`AI-сканирование: ${barcodeData.name} (${sanitizedBarcode}) - обновлен`);
        } else {
          const priceInfo = hasPrices ? '' : ' (без цен - установите позже)';
          toast.success(`✅ "${barcodeData.name}" автоматически сохранен в базу${priceInfo}!`, { position: 'top-center' });
          addLog(`AI-сканирование: ${barcodeData.name} (${sanitizedBarcode}) - сохранен автоматически`);
        }

        // После успешного сохранения очищаем форму
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
        setTempFrontPhoto('');
        setTempBarcodePhoto('');
        
        // Не закрываем сканер автоматически - пользователь сам закроет
        // Показываем успешное сообщение
        toast.success(`✅ Форма заполнена! Проверьте поля ниже и нажмите "Добавить товар"`, { position: 'top-center' });
        addLog(`AI-сканирование: ${barcodeData.name} (${sanitizedBarcode}) - форма заполнена`);
        
      } catch (error: any) {
        console.error('❌ Ошибка handleScan:', error);
         toast.error(`❌ Ошибка: ${error.message || 'Неизвестная ошибка'}`, { position: 'top-center' });
      }
      return;
    }
    
    // Если это режим распознавания срока годности
    if (aiScanMode === 'expiry') {
      console.log('📅 Обработка распознанных дат:', { expiryDate: barcodeData.expiryDate, manufacturingDate: barcodeData.manufacturingDate });
      
      if (barcodeData.expiryDate) {
        setCurrentProduct({ ...currentProduct, expiryDate: barcodeData.expiryDate });
        toast.success(`✅ Срок годности: ${new Date(barcodeData.expiryDate).toLocaleDateString('ru-RU')}`, { position: 'top-center' });
      }
      
      if (barcodeData.manufacturingDate) {
        toast.info(`📦 Дата производства: ${new Date(barcodeData.manufacturingDate).toLocaleDateString('ru-RU')}`, { position: 'top-center' });
      }
      
      // Добавляем фото в список
      if (barcodeData.capturedImage && !photos.includes(barcodeData.capturedImage)) {
        setPhotos([...photos, barcodeData.capturedImage]);
      }
      
      // Камера остается открытой для следующего сканирования
      return;
    }
    
    const sanitizedBarcode = barcodeData.barcode?.trim().replace(/[<>'"]/g, '') || '';
    
    // Убираем раннюю проверку - даже если AI ничего не распознал, попробуем заполнить то, что есть
    // if (!sanitizedBarcode && !barcodeData.name && !barcodeData.category) {
    //   console.log('AI вернул пустые значения, пропускаем');
    //   return;
    // }
    
    // Автозаполнение полей формы при обычном распознавании
    if (sanitizedBarcode) {
      setCurrentProduct(prev => ({ ...prev, barcode: sanitizedBarcode }));
      console.log('✅ Заполнен штрихкод:', sanitizedBarcode);
    } else {
      toast.warning('Штрихкод не распознан', { duration: 2000 });
    }
    
    if (barcodeData.name) {
      setCurrentProduct(prev => ({ ...prev, name: barcodeData.name || '' }));
      console.log('✅ Заполнено название:', barcodeData.name);
    } else {
      toast.warning('Название не распознано', { duration: 2000 });
    }
    
    if (barcodeData.category) {
      setCurrentProduct(prev => ({ ...prev, category: barcodeData.category || '' }));
      console.log('✅ Заполнена категория:', barcodeData.category);
    }
    
    // Обработка двух фото
    if (photoStep === 'front' && barcodeData.capturedImage) {
      setTempFrontPhoto(barcodeData.capturedImage);
      setPhotoStep('barcode');
      // Камера остается открытой
      toast.info('📸 Отлично! Теперь сфотографируйте штрих-код', { position: 'top-center' });
      return;
    }
    
    if (photoStep === 'barcode' && barcodeData.capturedImage) {
      setTempBarcodePhoto(barcodeData.capturedImage);
      setPhotoStep('none');
      // Камера остается открытой
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
          photoUrl,
          currentUserId
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

  const handleUpdatePendingProduct = async (id: string, updates: Partial<PendingProduct>) => {
    // Находим товар и обновляем его
    const currentProduct = pendingProducts.find(p => p.id === id);
    if (!currentProduct) return;
    
    const productWithUpdates = { ...currentProduct, ...updates };
    
    // Обновляем состояние
    setPendingProducts(prev => prev.map(p => p.id === id ? productWithUpdates : p));
    
    // Проверяем заполнены ли все обязательные поля включая цены
    const hasAllFields = productWithUpdates.barcode && 
                        productWithUpdates.name && 
                        productWithUpdates.category &&
                        productWithUpdates.purchasePrice && 
                        productWithUpdates.retailPrice &&
                        parseFloat(productWithUpdates.purchasePrice) > 0 &&
                        parseFloat(productWithUpdates.retailPrice) > 0;
    
    if (hasAllFields) {
      // Автоматически сохраняем в Firebase
      console.log('💾 Товар из очереди заполнен - автосохранение в Firebase');
      
      try {
        const purchasePrice = parseFloat(productWithUpdates.purchasePrice);
        const retailPrice = parseFloat(productWithUpdates.retailPrice);
        const quantity = productWithUpdates.quantity ? parseFloat(productWithUpdates.quantity) : 1;
        
        const result = await upsertProduct({
          barcode: productWithUpdates.barcode,
          name: productWithUpdates.name,
          category: productWithUpdates.category,
          supplier: productWithUpdates.supplier || null,
          unit: productWithUpdates.unit,
          purchase_price: purchasePrice,
          sale_price: retailPrice,
          quantity: quantity,
          expiry_date: productWithUpdates.expiryDate || null,
          created_by: currentUserId,
        });

        if (!result.success) {
          console.error('❌ Ошибка автосохранения в Firebase');
          toast.error('❌ Ошибка сохранения товара');
          return;
        }

        // Сохраняем фото если есть
        if (productWithUpdates.frontPhoto || productWithUpdates.barcodePhoto) {
          if (productWithUpdates.frontPhoto) {
            await saveProductImage(productWithUpdates.barcode, productWithUpdates.name, productWithUpdates.frontPhoto, currentUserId);
          }
          if (productWithUpdates.barcodePhoto) {
            await saveProductImage(productWithUpdates.barcode, productWithUpdates.name, productWithUpdates.barcodePhoto, currentUserId);
          }
        }

        // Удаляем из очереди
        await handleRemovePendingProduct(id);
        
        toast.success(`✅ Товар "${productWithUpdates.name}" автоматически сохранен в базу!`);
        addLog(`Автосохранение: ${productWithUpdates.name} (${productWithUpdates.barcode})`);
        
      } catch (error: any) {
        console.error('❌ Ошибка автосохранения:', error);
        toast.error(`❌ Ошибка: ${error.message}`);
      }
    }
  };

  const handleRemovePendingProduct = async (id: string) => {
    setPendingProducts(prev => prev.filter(p => p.id !== id));
    
    // Удаляем из Firebase очереди
    try {
      await deleteQueueItem(id);
    } catch (err) {
      console.error('Ошибка при удалении:', err);
    }
  };

  const handleSaveAllProducts = async () => {
    console.log('💾 Начало сохранения всех товаров');
    console.log('👤 userRole:', userRole);
    console.log('🔐 canSaveSingle:', canSaveSingle);
    
    // Проверка прав доступа - для админа и складской всегда разрешено
    if (userRole !== 'admin' && userRole !== 'inventory' && !canSaveSingle) {
      toast.error('⚠️ У вас нет прав на сохранение товаров. Включите эту опцию в разделе Диагностика.');
      return;
    }

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
      if (!currentUserId) {
        toast.error('Ошибка загрузки пользователя');
        return;
      }

      const totalProducts = pendingProducts.length;
      toast.info(`📦 Начинаем сохранение ${totalProducts} товаров...`);

      let successCount = 0;
      let errorCount = 0;
      const savedProductIds: string[] = [];

      for (let i = 0; i < pendingProducts.length; i++) {
        const product = pendingProducts[i];
        
        // Проверка на дублирование через Firebase
        if (product.barcode) {
          const existing = await findProductByBarcode(product.barcode);
          
          if (existing) {
            console.log(`⚠️ Товар с баркодом ${product.barcode} уже существует в Firebase, пропускаем`);
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
                photoUrl,
                currentUserId
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
            unit: 'шт' as const,
            expiryDate: product.expiryDate || undefined,
            photos: allPhotos,
            paymentType: 'full',
            paidAmount: parseFloat(product.purchasePrice) * parseFloat(product.quantity),
            debtAmount: 0,
            addedBy: userRole || 'unknown',
            supplier: product.supplier || undefined,
          };

          const saved = await saveProductWithBarcodeGeneration(productData, currentUserId, true);
          
          if (saved.success) {
            successCount++;
            savedProductIds.push(product.id);
            addLog(`Добавлен товар: ${product.name} (${product.quantity} шт)`);
            console.log(`✅ [${i + 1}/${totalProducts}] Товар "${product.name}" сохранен`);
            
            // Если были сгенерированы новые штрих-коды, добавляем информацию в лог
            if (saved.isDuplicate && saved.generatedBarcodes) {
              console.log(`  🏷️ Сгенерировано ${saved.generatedBarcodes.length} новых штрих-кодов`);
            }
          } else {
            errorCount++;
            console.error(`❌ [${i + 1}/${totalProducts}] Не удалось сохранить "${product.name}"`);
          }
        } catch (error) {
          console.error(`❌ [${i + 1}/${totalProducts}] Ошибка сохранения товара "${product.name}":`, error);
          errorCount++;
        }
      }

      // Удаляем успешно сохраненные товары из Firebase очереди
      if (savedProductIds.length > 0) {
        console.log(`🗑️ Удаление ${savedProductIds.length} товаров из очереди...`);
        
        for (const productId of savedProductIds) {
          try {
            await deleteQueueItem(productId);
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
      // Удаляем все товары из Firebase очереди
      try {
        for (const product of pendingProducts) {
          await deleteQueueItem(product.id);
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
      console.log('🔄 Добавление товара...');
      console.log('👤 userRole:', userRole);
      console.log('🔐 canSaveQueue:', canSaveQueue);
      
      // Проверка прав доступа - для админа и складской всегда разрешено
      if (userRole !== 'admin' && userRole !== 'inventory' && !canSaveQueue) {
        toast.error('⚠️ У вас нет прав на добавление товаров в очередь. Включите эту опцию в разделе Диагностика.');
        return;
      }
      
      if (!currentUserId) {
        console.error('❌ Пользователь не загружен');
        toast.error('⚠️ Ошибка загрузки пользователя. Попробуйте перезагрузить страницу.');
        return;
      }
      
      console.log('✅ Пользователь:', currentUserId);
      
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

      // НОВАЯ ЛОГИКА: Проверяем заполнены ли цены
      const hasPrices = currentProduct.purchasePrice && currentProduct.retailPrice && 
                        parseFloat(currentProduct.purchasePrice) > 0 && 
                        parseFloat(currentProduct.retailPrice) > 0;

      if (hasPrices) {
        // СОХРАНЯЕМ СРАЗУ В FIREBASE
        console.log('💾 Цены заполнены - сохраняем в Firebase');
        
        const purchasePrice = parseFloat(currentProduct.purchasePrice);
        const retailPrice = parseFloat(currentProduct.retailPrice);
        const quantity = currentProduct.quantity ? parseFloat(currentProduct.quantity) : 1;
        
        // Используем Firebase upsert
        const result = await upsertProduct({
          barcode: currentProduct.barcode,
          name: currentProduct.name,
          category: currentProduct.category,
          supplier: currentProduct.supplier || null,
          unit: currentProduct.unit,
          purchase_price: purchasePrice,
          sale_price: retailPrice,
          quantity: quantity,
          expiry_date: currentProduct.expiryDate || null,
          created_by: currentUserId,
        });

        if (!result.success) {
          console.error('❌ Ошибка сохранения в Firebase');
          toast.error('❌ Ошибка сохранения товара');
          return;
        }

        if (result.isUpdate) {
          console.log(`✅ Количество обновлено: ${result.newQuantity}`);
          toast.success(`✅ Количество "${currentProduct.name}" обновлено: ${result.newQuantity}`);
        } else {
          console.log('✅ Новый товар сохранен');
          toast.success(`✅ Товар "${currentProduct.name}" добавлен в базу!`);
        }

        // Сохраняем фото если есть
        try {
          if (frontPhoto) await saveProductImage(currentProduct.barcode, currentProduct.name, frontPhoto, currentUserId);
          if (barcodePhoto) await saveProductImage(currentProduct.barcode, currentProduct.name, barcodePhoto, currentUserId);
        } catch (photoError) {
          console.error('⚠️ Ошибка сохранения фото:', photoError);
          // Не прерываем процесс, товар уже сохранен
        }

        addLog(`Товар ${currentProduct.name} (${currentProduct.barcode}) сохранен в Firebase`);
        
      } else {
        // ДОБАВЛЯЕМ В ОЧЕРЕДЬ для заполнения цен
        console.log('📋 Цены не заполнены - добавляем в очередь');
        
        // Проверяем дубликат в очереди через Firebase
        const queueItems = await getQueueProducts();
        const existingInQueue = queueItems.find(item => item.barcode === currentProduct.barcode);

        if (existingInQueue) {
          toast.info('⚠️ Товар уже есть в очереди');
          console.log('⚠️ Товар уже в очереди, пропускаем');
          return;
        }

        await retryOperation(
          async () => {
            await addToQueue({
              barcode: currentProduct.barcode,
              product_name: currentProduct.name,
              category: currentProduct.category || undefined,
              quantity: currentProduct.quantity ? parseInt(currentProduct.quantity) : 1,
              front_photo: frontPhoto || undefined,
              barcode_photo: barcodePhoto || undefined,
              image_url: imageUrl || undefined,
              created_by: currentUserId,
            });

            console.log('✅ Товар добавлен в очередь');
            toast.success('✅ Товар добавлен в очередь для заполнения цен!');
            addLog(`Товар ${currentProduct.name} (${currentProduct.barcode}) добавлен в очередь`);
          },
          {
            maxAttempts: 5,
            initialDelay: 1000,
            onRetry: (attempt) => {
              console.log(`🔄 Повторная попытка добавления "${currentProduct.name}" в очередь (попытка ${attempt})...`);
            }
          }
        ).catch((error) => {
          console.error('❌ Не удалось добавить в очередь после нескольких попыток:', error);
          toast.error(`❌ Ошибка добавления в очередь`);
          return;
        });
      }
      
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
      {/* AI Product Recognition - для админов и кладовщиков */}
      {canUseAI && showAIScanner && (
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

      {/* Photo Gallery Recognition - для админов и кладовщиков */}
      {canUseAI && showPhotoGallery && (
        <PhotoGalleryRecognition
          onProductFound={handleScan}
          onClose={() => setShowPhotoGallery(false)}
        />
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
          {canUseAI ? (
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
                  setShowPhotoGallery(true);
                  toast.info('📸 Загрузите 2 фото товара для распознавания');
                }}
                variant="outline"
                size="sm"
                className="flex-1 min-w-[120px] md:min-w-[140px] whitespace-nowrap h-9 text-xs md:text-sm"
              >
                <Image className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 flex-shrink-0" />
                <span className="truncate">Из фото</span>
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
          ) : (
            <div className="p-4 bg-muted/50 rounded-lg border border-dashed">
              <p className="text-sm text-muted-foreground">
                🔐 Роль: {userRole || 'загрузка...'} | canUseAI: {canUseAI ? 'да' : 'нет'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                AI функции доступны только для ролей: admin, inventory
              </p>
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
                onChange={(e) => {
                  const newValue = e.target.value;
                  setCurrentProduct({ 
                    ...currentProduct, 
                    barcode: newValue,
                    quantity: (!currentProduct.quantity || currentProduct.quantity === '' || currentProduct.quantity === '0') ? '1' : currentProduct.quantity
                  });
                }}
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
                onChange={(e) => {
                  const newValue = e.target.value;
                  setCurrentProduct({ 
                    ...currentProduct, 
                    name: newValue,
                    quantity: (!currentProduct.quantity || currentProduct.quantity === '' || currentProduct.quantity === '0') ? '1' : currentProduct.quantity
                  });
                }}
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
                onChange={(e) => {
                  const newValue = e.target.value;
                  setCurrentProduct({ 
                    ...currentProduct, 
                    category: newValue,
                    quantity: (!currentProduct.quantity || currentProduct.quantity === '' || currentProduct.quantity === '0') ? '1' : currentProduct.quantity
                  });
                }}
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
              <div className="space-y-2">
                <Input
                  placeholder="🔍 Поиск поставщика..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  className="text-sm md:text-sm h-11 md:h-9"
                />
                <Select
                  value={currentProduct.supplier}
                  onValueChange={(value) => {
                    if (value === '__add_new__') {
                      setShowSupplierDialog(true);
                    } else {
                      setCurrentProduct({ ...currentProduct, supplier: value });
                      setSupplierSearch('');
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
                      .filter(s => 
                        supplierSearch === '' || 
                        s.name.toLowerCase().includes(supplierSearch.toLowerCase())
                      )
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
              </div>
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
                <Input
                  value="шт"
                  disabled
                  className="text-sm md:text-sm h-11 md:h-9 bg-muted"
                />
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
              Добавить товар
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
