import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
// AI распознавание через Gemini
import { compressForAI } from '@/lib/imageCompression';
import { retryOperation } from '@/lib/retryUtils';
import { initPriceCache, findPriceByBarcode, findPriceByName, getCacheSize } from '@/lib/localPriceCache';
import { saveOrUpdateLocalProduct } from '@/lib/localOnlyMode';
import { addToQueue } from '@/lib/mysqlCollections';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface AIProductRecognitionProps {
  onProductFound: (data: { barcode: string; name?: string; category?: string; photoUrl?: string; capturedImage?: string; quantity?: number; expiryDate?: string; manufacturingDate?: string; frontPhoto?: string; barcodePhoto?: string; autoAddToProducts?: boolean; existingProductId?: string }) => void;
  mode?: 'product' | 'barcode' | 'expiry' | 'dual';
  hidden?: boolean;
  hasIncompleteProducts?: boolean; // Есть ли незавершенные товары в очереди
}

export const AIProductRecognition = ({ onProductFound, mode = 'product', hidden = false, hasIncompleteProducts = false }: AIProductRecognitionProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isWaitingForSharpImage, setIsWaitingForSharpImage] = useState(false);
  const photo1Ref = useRef<string>('');
  const isMountedRef = useRef(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [recognizedProducts, setRecognizedProducts] = useState<Map<string, number>>(new Map());
  const [quantity, setQuantity] = useState(1);
  const [hasPermission, setHasPermission] = useState(false);
  const [dualPhotoStep, setDualPhotoStep] = useState<'front' | 'barcode' | 'ready' | 'none'>('none');
  const [tempFrontPhoto, setTempFrontPhoto] = useState<string>('');
  const [tempBarcodePhoto, setTempBarcodePhoto] = useState<string>('');
  const [showExistingProductDialog, setShowExistingProductDialog] = useState(false);
  const [existingProductData, setExistingProductData] = useState<any>(null);
  const [pendingRecognitionData, setPendingRecognitionData] = useState<any>(null);
  const [addedProductsCount, setAddedProductsCount] = useState(0);
  const [priceCacheLoaded, setPriceCacheLoaded] = useState(false);

  // Загружаем кэш цен при монтировании
  useEffect(() => {
    isMountedRef.current = true;
    startCamera();
    
    // Инициализируем кэш цен
    initPriceCache().then(count => {
      console.log(`📦 Кэш цен загружен: ${count} товаров`);
      setPriceCacheLoaded(true);
    });

    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, []);

  // При активном AI-скане скрываем глобальные тосты, чтобы они не мешали
  useEffect(() => {
    if (hidden) {
      document.body.classList.remove('ai-scan-active');
      return;
    }

    document.body.classList.add('ai-scan-active');

    return () => {
      document.body.classList.remove('ai-scan-active');
    };
  }, [hidden]);

  const startCamera = async () => {
    try {
      setCameraReady(false);
      
      // Проверяем сохраненное разрешение камеры
      const cameraPermission = localStorage.getItem('camera_permission');
      const permissionTimestamp = localStorage.getItem('camera_permission_timestamp');
      const now = Date.now();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      // Если разрешение было дано в последние 24 часа, не показываем уведомление
      const hasRecentPermission = cameraPermission === 'granted' && 
                                   permissionTimestamp && 
                                   (now - parseInt(permissionTimestamp)) < twentyFourHours;
      
      setHasPermission(hasRecentPermission);
      
      if (!hasRecentPermission) {
        console.log('Запрос доступа к камере...');
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      // Сохраняем разрешение на 24 часа
      localStorage.setItem('camera_permission', 'granted');
      localStorage.setItem('camera_permission_timestamp', now.toString());
      setHasPermission(true);
      
      console.log('Камера получена, настройка видео...');
      
      if (videoRef.current && isMountedRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        // Ждем события loadedmetadata
        const metadataPromise = new Promise<void>((resolve, reject) => {
          if (!videoRef.current) {
            reject(new Error('Video ref потерян'));
            return;
          }
          
          const video = videoRef.current;
          const timeout = setTimeout(() => {
            reject(new Error('Таймаут загрузки метаданных'));
          }, 5000);
          
          const handleMetadata = () => {
            clearTimeout(timeout);
            console.log('Метаданные загружены:', video.videoWidth, 'x', video.videoHeight);
            video.removeEventListener('loadedmetadata', handleMetadata);
            resolve();
          };
          
          video.addEventListener('loadedmetadata', handleMetadata);
        });
        
        await metadataPromise;
        
        // Запускаем воспроизведение
        if (videoRef.current) {
          await videoRef.current.play();
          console.log('Видео запущено успешно');
          setCameraReady(true);
          setError('');
        }
      }
    } catch (err: any) {
      console.error('Ошибка камеры:', err);
      setCameraReady(false);
      if (err.name === 'NotAllowedError') {
        setError('Доступ к камере запрещен. Нажмите "Разрешить" в браузере.');
      } else if (err.name === 'NotFoundError') {
        setError('Камера не найдена на устройстве.');
      } else if (err.message?.includes('таймаут') || err.message?.includes('Timeout')) {
        setError('Таймаут запуска камеры. Попробуйте перезагрузить страницу.');
      } else {
        setError(`Ошибка камеры: ${err.message || 'Неизвестная ошибка'}`);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const captureImage = (): string => {
    if (!videoRef.current || !canvasRef.current) return '';
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Увеличиваем разрешение для лучшего качества (макс 1024x768)
    const maxWidth = 1024;
    const maxHeight = 768;
    let width = video.videoWidth;
    let height = video.videoHeight;
    
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }
    
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    // Улучшаем качество рендеринга
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // Сохранение в Firebase очередь (без Supabase storage)
  const saveToTemporaryStorage = async (imageBase64: string, barcode: string, productName: string): Promise<string | null> => {
    try {
      // Сохраняем в Firebase очередь с base64 изображением
      await addToQueue({
        barcode,
        product_name: productName,
        front_photo: imageBase64,
        quantity: 1,
        created_by: 'system'
      });
      console.log('📋 Фото сохранено в Firebase очередь');
      return imageBase64; // Возвращаем base64 вместо URL
    } catch (err) {
      console.error('Error saving to Firebase queue:', err);
      return null;
    }
  };

  const checkImageSharpness = (canvas: HTMLCanvasElement): number => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Вычисляем резкость через анализ контраста соседних пикселей
    let sharpness = 0;
    const step = 8; // Проверяем каждый 8-й пиксель для большей скорости
    
    for (let y = step; y < canvas.height - step; y += step) {
      for (let x = step; x < canvas.width - step; x += step) {
        const i = (y * canvas.width + x) * 4;
        const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const rightBrightness = (data[i + 4] + data[i + 5] + data[i + 6]) / 3;
        const bottomBrightness = (data[i + canvas.width * 4] + data[i + canvas.width * 4 + 1] + data[i + canvas.width * 4 + 2]) / 3;
        
        sharpness += Math.abs(brightness - rightBrightness) + Math.abs(brightness - bottomBrightness);
      }
    }
    
    return sharpness;
  };

  const captureSharpImage = (): { image: string; isSharp: boolean } => {
    if (!videoRef.current || !canvasRef.current) return { image: '', isSharp: false };
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Проверяем что видео загружено
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn('Видео еще не загружено');
      return { image: '', isSharp: false };
    }
    
    // Увеличиваем разрешение для лучшего качества (макс 1024x768)
    const maxWidth = 1024;
    const maxHeight = 768;
    let width = video.videoWidth;
    let height = video.videoHeight;
    
    if (width > maxWidth) {
      height = (height * maxWidth) / width;
      width = maxWidth;
    }
    if (height > maxHeight) {
      width = (width * maxHeight) / height;
      height = maxHeight;
    }
    
    canvas.width = width;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return { image: '', isSharp: false };
    
    // Улучшаем качество рендеринга
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, width, height);
    
    // Проверяем резкость - реалистичный порог
    const sharpness = checkImageSharpness(canvas);
    const threshold = 50; // Снижен порог для работы в реальных условиях
    
    // Сохраняем в высоком качестве (85%)
    const image = canvas.toDataURL('image/jpeg', 0.85);
    
    console.log(`📊 Четкость изображения: ${Math.round(sharpness)} (требуется: ${threshold})`);
    
    return {
      image,
      isSharp: sharpness > threshold
    };
  };

  // AI распознавание реализовано в handleAIScan через Gemini

  const handleManualCapture = async () => {
    if (isProcessing) return;
    
    console.log('🎯 handleManualCapture вызван, mode:', mode, 'tempFrontPhoto:', !!tempFrontPhoto, 'tempBarcodePhoto:', !!tempBarcodePhoto);
    
    setIsProcessing(true);

    try {
      setNotification('📸 Захват...');
      
      const { image } = captureSharpImage();
      
      if (!image) {
        setNotification('❌ Ошибка');
        setTimeout(() => setNotification(''), 1000);
        setIsProcessing(false);
        return;
      }
      
      // КРИТИЧНО: Режим двух фото - ТОЛЬКО захват, БЕЗ распознавания
      if (mode === 'dual') {
        console.log('📷 Режим dual: захват фото');
        
        if (!tempFrontPhoto) {
          // Шаг 1: Захватываем ЛИЦЕВУЮ сторону
          console.log('📸 Захвачена лицевая сторона (фото 1/2)');
          setTempFrontPhoto(image);
          setDualPhotoStep('barcode');
          setNotification('✅ Фото 1/2 - лицевая');
          toast.success('📸 Лицевая сторона захвачена. Теперь снимите штрихкод', { position: 'top-center' });
          setTimeout(() => setNotification(''), 1500);
        } else if (!tempBarcodePhoto) {
          // Шаг 2: Захватываем ШТРИХКОД и АВТОМАТИЧЕСКИ запускаем распознавание
          console.log('📸 Захвачен штрихкод (фото 2/2) - автозапуск распознавания');
          setTempBarcodePhoto(image);
          setDualPhotoStep('ready');
          setNotification('✅ Фото 2/2 - запуск AI...');
          toast.success('📸 Запускаю AI распознавание...', { position: 'top-center' });
          
          // АВТОМАТИЧЕСКИ запускаем распознавание без ожидания нажатия кнопки
          setTimeout(() => {
            handleAIScan();
          }, 100);
          return; // Выходим, handleAIScan сам управляет isProcessing
        } else {
          // Если оба фото уже есть, игнорируем дополнительные нажатия
          console.log('⚠️ Обе фотографии уже захвачены, игнорируем нажатие');
          toast.warning('Обе фотографии уже захвачены. Нажмите кнопку распознавания.', { position: 'top-center' });
        }
        setIsProcessing(false);
        return; // ВАЖНО: выходим БЕЗ распознавания
      }
      
      // Другие режимы (expiry, barcode, product) - используйте AI dual режим
      setNotification('⚠️ Используйте AI режим');
      toast.warning('Используйте AI сканирование (режим dual)', { position: 'top-center' });
      setTimeout(() => setNotification(''), 1500);
    } catch (err: any) {
      console.error('Recognition error:', err);
      if (err.message?.includes('rate_limit') || err.message?.includes('429')) {
        toast.error('Слишком много запросов', { position: 'top-center' });
      } else if (err.message?.includes('payment_required') || err.message?.includes('402')) {
        toast.error('Требуется пополнить баланс', { position: 'top-center' });
      }
      setNotification('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Удалили автоматическое сканирование - только ручной захват

  const handleAIScan = async () => {
    if (isProcessing || !tempFrontPhoto || !tempBarcodePhoto) {
      console.log('⚠️ handleAIScan заблокирован:', { isProcessing, hasFront: !!tempFrontPhoto, hasBarcode: !!tempBarcodePhoto });
      toast.warning('⚠️ Нужны обе фотографии для распознавания', { position: 'top-center' });
      return;
    }
    
    console.log('🚀 handleAIScan НАЧАЛО: AI распознавание двух фото');
    console.log('📸 Размеры фото:', {
      front: tempFrontPhoto.length,
      barcode: tempBarcodePhoto.length
    });
    
    setIsProcessing(true);
    setNotification('⚡ Быстрое AI сканирование...');
    
    try {
      // Сжимаем изображения перед отправкой
      console.log('📦 Сжатие изображений...');
      const compressedFront = await compressForAI(tempFrontPhoto);
      const compressedBarcode = await compressForAI(tempBarcodePhoto);
      
      // Получаем deviceId для синхронизации между устройствами
      const deviceId = localStorage.getItem('device_id') || `device-${Date.now()}`;
      if (!localStorage.getItem('device_id')) {
        localStorage.setItem('device_id', deviceId);
      }
      const userName = localStorage.getItem('login_user_name') || 'Устройство';
      
      // Вызываем edge функцию fast-scan-product для AI распознавания
      console.log('🤖 Вызов AI распознавания через Gemini...');
      
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${SUPABASE_URL}/functions/v1/fast-scan-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frontPhoto: compressedFront,
          barcodePhoto: compressedBarcode,
          deviceId,
          userName
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ AI ошибка:', response.status, errorText);
        
        if (response.status === 429) {
          toast.error('⚠️ Превышен лимит запросов, подождите немного');
          throw new Error('rate_limit');
        }
        throw new Error(`AI error: ${response.status}`);
      }
      
      const aiResult = await response.json();
      console.log('✅ AI результат:', aiResult);
      
      const scannedBarcode = aiResult.barcode || '';
      const scannedName = aiResult.name || '';
      const scannedCategory = aiResult.category || '';
      
      // Поиск цены в кэше CSV
      console.log('🔍 Поиск цены для штрихкода:', scannedBarcode);
      let priceInfo = scannedBarcode ? findPriceByBarcode(scannedBarcode) : null;
      if (!priceInfo && scannedName) {
        priceInfo = findPriceByName(scannedName);
      }
      console.log('💰 Найдена цена:', priceInfo);
      
      let savedTo = aiResult.savedTo || '';
      let saveError = '';
      
      // Если AI уже сохранил - не дублируем
      if (savedTo) {
        console.log('✅ AI уже сохранил товар в:', savedTo);
      } else if (priceInfo && priceInfo.purchasePrice > 0) {
        try {
          const result = await saveOrUpdateLocalProduct({
            barcode: scannedBarcode,
            name: priceInfo.name || scannedName,
            purchasePrice: priceInfo.purchasePrice,
            salePrice: Math.round(priceInfo.purchasePrice * 1.3),
            quantity: 1,
            category: priceInfo.category || scannedCategory,
            addedBy: userName,
          });
          savedTo = result.isNew ? 'products' : 'products_updated';
        } catch (err: any) {
          saveError = err.message;
        }
      } else if (scannedBarcode) {
        try {
          await addToQueue({
            barcode: scannedBarcode,
            product_name: scannedName || 'Неизвестный товар',
            category: scannedCategory,
            front_photo: tempFrontPhoto,
            barcode_photo: tempBarcodePhoto,
            quantity: 1,
            created_by: userName,
          });
          savedTo = 'queue';
        } catch (err: any) {
          saveError = err.message;
        }
      }

      // Увеличиваем счетчик
      setAddedProductsCount(prev => prev + 1);
      
      // Очищаем для следующего товара
      setDualPhotoStep('none');
      setTempFrontPhoto('');
      setTempBarcodePhoto('');
      setIsProcessing(false);
      
      // Показываем статус
      if (saveError) {
        console.error('Save error:', saveError);
        setNotification(`⚠️ Ошибка: ${saveError.substring(0, 30)}`);
        toast.error(`Ошибка сохранения: ${saveError}`);
        onProductFound({
          barcode: scannedBarcode,
          name: scannedName,
          category: scannedCategory,
          frontPhoto: tempFrontPhoto,
          barcodePhoto: tempBarcodePhoto
        });
      } else if (savedTo === 'products' || savedTo === 'products_updated') {
        const price = priceInfo?.purchasePrice || 0;
        setNotification(`✅ ${scannedName} → база (${price}₽)`);
        toast.success(`✅ "${scannedName}" сохранён с ценой ${price}₽`, { duration: 2000 });
        // ВАЖНО: передаём данные в форму
        onProductFound({
          barcode: scannedBarcode,
          name: scannedName,
          category: scannedCategory,
          frontPhoto: tempFrontPhoto,
          barcodePhoto: tempBarcodePhoto
        });
      } else if (savedTo === 'queue') {
        setNotification(`📋 ${scannedName} → очередь`);
        toast.info(`📋 "${scannedName}" в очереди (нет цены)`, { duration: 2000 });
        onProductFound({
          barcode: scannedBarcode,
          name: scannedName,
          category: scannedCategory,
          frontPhoto: tempFrontPhoto,
          barcodePhoto: tempBarcodePhoto
        });
      } else if (savedTo === 'queue_exists') {
        setNotification(`⚠️ ${scannedName} уже в очереди`);
      } else {
        setNotification('📸 Сканировано');
        onProductFound({
          barcode: scannedBarcode,
          name: scannedName,
          category: scannedCategory,
          frontPhoto: tempFrontPhoto,
          barcodePhoto: tempBarcodePhoto
        });
      }
      
      setTimeout(() => setNotification(''), 2500);
    } catch (err: any) {
      console.error('Ошибка при AI-сканировании:', err);
      setNotification('❌ Ошибка AI, заполните данные вручную');
      setTimeout(() => setNotification(''), 1500);
      
      // Даже при ошибке сбрасываем для следующего товара
      setDualPhotoStep('none');
      setTempFrontPhoto('');
      setTempBarcodePhoto('');
      setIsProcessing(false);
    }
  };

  const handleConfirmExistingProduct = async () => {
    if (!existingProductData || !pendingRecognitionData) return;

    console.log('✅ Пользователь подтвердил использование существующих цен');
    
    // Отправляем в onProductFound с флагом автодобавления
    onProductFound({
      ...pendingRecognitionData,
      autoAddToProducts: true,
      existingProductId: existingProductData.id
    });

    // Увеличиваем счетчик добавленных товаров
    setAddedProductsCount(prev => prev + 1);

    // Очищаем состояние
    setShowExistingProductDialog(false);
    setExistingProductData(null);
    setPendingRecognitionData(null);
    setTempFrontPhoto('');
    setTempBarcodePhoto('');
    setDualPhotoStep('none');
    
    toast.success('✅ Товар добавлен в базу автоматически', { position: 'top-center' });
  };

  const handleRejectExistingProduct = () => {
    console.log('❌ Пользователь отклонил использование существующих цен');
    
    // Отправляем в очередь для редактирования
    if (pendingRecognitionData) {
      onProductFound(pendingRecognitionData);
    }

    // Очищаем состояние
    setShowExistingProductDialog(false);
    setExistingProductData(null);
    setPendingRecognitionData(null);
    setTempFrontPhoto('');
    setTempBarcodePhoto('');
    setDualPhotoStep('none');
  };

  const getStepIndicator = () => {
    return mode === 'barcode' ? '📷 Распознавание штрихкода' : '📷 Распознавание товара';
  };

  // Скрытый режим - только canvas и video без UI
  if (hidden) {
    return (
      <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}>
        <canvas ref={canvasRef} width="1" height="1" />
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          width="1"
          height="1"
        />
      </div>
    );
  }

  return (
    <>
      <AlertDialog open={showExistingProductDialog} onOpenChange={setShowExistingProductDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Товар найден в базе</AlertDialogTitle>
            <AlertDialogDescription>
              {existingProductData && (
                <div className="space-y-2 mt-4">
                  <p className="font-semibold text-foreground">
                    {existingProductData.name}
                  </p>
                  <div className="bg-muted p-3 rounded-md space-y-1">
                    <p className="text-sm">
                      <span className="font-medium">Закупочная цена:</span>{' '}
                      <span className="text-lg font-bold text-primary">
                        {existingProductData.purchase_price} ₽
                      </span>
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Розничная цена:</span>{' '}
                      <span className="text-lg font-bold text-primary">
                        {existingProductData.sale_price} ₽
                      </span>
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Категория:</span> {existingProductData.category}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Остаток:</span> {existingProductData.quantity} {existingProductData.unit}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    Хотите добавить товар с этими ценами? Он сразу попадет в базу.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRejectExistingProduct}>
              Нет, изменить
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExistingProduct}>
              Да, добавить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full">
        <canvas ref={canvasRef} className="hidden" />
        
        <div className="bg-card rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b bg-primary/5">
            <div className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold">AI-распознавание товаров</h3>
              {addedProductsCount > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-green-600 text-white text-xs font-bold rounded-full">
                  +{addedProductsCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {getStepIndicator()}
              </span>
              <div className="flex items-center gap-1 text-xs text-green-600">
                <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
                {cameraReady ? 'Готова' : 'Загрузка...'}
              </div>
            </div>
          </div>

          <div className="relative rounded-b-lg overflow-hidden bg-black" style={{ minHeight: '280px' }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full object-cover block bg-black"
              style={{ 
                height: 'auto',
                minHeight: '280px',
                maxHeight: '450px',
              }}
            />
          
          {/* Индикатор загрузки камеры - показываем только при первом запросе */}
          {!cameraReady && !error && !hasPermission && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/50">
              <div className="text-center p-6 rounded-xl bg-card shadow-lg">
                <Camera className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
                <p className="text-xl font-bold mb-2">Запрос доступа к камере</p>
                <p className="text-base text-muted-foreground mb-4">Нажмите "Разрешить" в диалоге браузера</p>
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            </div>
          )}

          {notification && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in z-[50]">
              {notification.includes('✅') ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <span className="font-medium">{notification}</span>
            </div>
          )}

          {/* Индикатор обработки - ниже кнопок */}
          {isProcessing && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[50]">
              <div className="flex flex-col items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl shadow-lg min-w-[200px]">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <div className="text-center space-y-0.5">
                  <span className="text-sm font-medium block">Обработка...</span>
                  <span className="text-[10px] opacity-90 block">Сжатие и отправка</span>
                </div>
              </div>
            </div>
          )}

          {/* Кнопки управления - поверх всех уведомлений */}
          {!isProcessing && (
            <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 z-[1000000] w-[calc(100%-1rem)] sm:w-auto sm:min-w-[280px] space-y-2 sm:space-y-3 bg-card/95 p-3 sm:p-4 rounded-xl shadow-lg border">
              {mode === 'dual' && (
                <div className="text-center">
                  {!tempFrontPhoto && !tempBarcodePhoto && (
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground">📸 1/2: Снимите лицевую сторону</p>
                  )}
                  {tempFrontPhoto && !tempBarcodePhoto && (
                    <p className="text-xs sm:text-sm font-medium text-green-600">✅ Лицевая готова! 2/2: Штрихкод</p>
                  )}
                  {tempFrontPhoto && tempBarcodePhoto && (
                    <p className="text-xs sm:text-sm font-medium text-green-600">✅ Готово! Нажмите кнопку</p>
                  )}
                </div>
              )}
              
              {mode !== 'dual' && (
                <div className="flex items-center gap-3 justify-center">
                  <span className="text-foreground text-sm font-medium">шт:</span>
                  <Button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    variant="outline"
                    size="sm"
                    className="h-8 w-8"
                  >
                    -
                  </Button>
                  <span className="text-foreground text-lg font-bold min-w-[40px] text-center">{quantity}</span>
                  <Button
                    onClick={() => setQuantity(quantity + 1)}
                    variant="outline"
                    size="sm"
                    className="h-8 w-8"
                  >
                    +
                  </Button>
                </div>
              )}
              
              {/* Кнопка захвата фото */}
              {mode === 'dual' && dualPhotoStep !== 'ready' && (
                <Button
                  onClick={handleManualCapture}
                  size="lg"
                  className="rounded-full shadow-lg w-full h-11 sm:h-12 text-sm sm:text-base"
                  disabled={!cameraReady || isProcessing}
                >
                  <Camera className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                  {!tempFrontPhoto ? '📷 Снять лицевую' : '📷 Снять штрихкод'}
                </Button>
              )}
              
              {mode === 'dual' && dualPhotoStep === 'ready' && (
                <div className="space-y-2 animate-in slide-in-from-bottom-4">
                  <Button
                    onClick={handleAIScan}
                    size="lg"
                    className="rounded-full shadow-xl w-full bg-green-600 hover:bg-green-700 text-white font-bold text-sm sm:text-base h-12 sm:h-14 animate-pulse"
                    disabled={!cameraReady || isProcessing || !tempFrontPhoto || !tempBarcodePhoto}
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Распознаю...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5 mr-2" />
                        ✅ РАСПОЗНАТЬ
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => {
                      setTempFrontPhoto('');
                      setTempBarcodePhoto('');
                      setDualPhotoStep('none');
                      toast.info('📸 Начните сначала', { position: 'top-center' });
                    }}
                    variant="outline"
                    size="sm"
                    className="w-full h-9"
                    disabled={isProcessing}
                  >
                    🔄 Переснять
                  </Button>
                </div>
              )}
              
              {/* Кнопка для других режимов */}
              {mode !== 'dual' && (
                <Button
                  onClick={handleManualCapture}
                  size="lg"
                  className="rounded-full shadow-lg w-full"
                  disabled={!cameraReady}
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Сфотографировать
                </Button>
              )}
            </div>
          )}
        </div>

        {error ? (
          <div className="p-6 text-center bg-destructive/10 border-t-2 border-destructive">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-3" />
            <div className="text-destructive text-base mb-4 font-semibold">{error}</div>
            <div className="space-y-2">
              <Button onClick={startCamera} variant="default" size="lg" className="w-full max-w-xs">
                <Camera className="h-5 w-5 mr-2" />
                Дать доступ к камере
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                При нажатии браузер запросит разрешение на использование камеры
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground font-medium">
              🤖 AI {mode === 'dual' ? 'распознавание товара (2 фото)' : mode === 'barcode' ? 'распознавание штрихкода' : 'распознавание товара'}
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              {mode === 'dual' ? (
                <>
                  <p>📱 Режим двух фотографий</p>
                  <p>📷 1. Снимите лицевую сторону товара</p>
                  <p>📷 2. Снимите штрихкод на обратной стороне</p>
                  <p>✅ 3. Нажмите кнопку для распознавания</p>
                </>
              ) : mode === 'barcode' ? (
                <>
                  <p>📱 Режим распознавания штрихкода</p>
                  <p>📷 Наведите камеру на штрихкод</p>
                  <p>📸 Нажмите кнопку для съемки</p>
                </>
              ) : (
                <>
                  <p>📱 Режим распознавания товара</p>
                  <p>📷 Покажите переднюю часть упаковки</p>
                  <p>📸 Нажмите кнопку для съемки</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
};
