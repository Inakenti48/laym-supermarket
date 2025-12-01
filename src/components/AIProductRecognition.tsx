import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { SaveQueueIndicator } from '@/components/SaveQueueIndicator';
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
        if (!tempFrontPhoto) {
          // Шаг 1: Захватываем ЛИЦЕВУЮ сторону
          setTempFrontPhoto(image);
          setDualPhotoStep('barcode');
          setNotification('✅ Фото 1/2 - лицевая');
          toast.success('📸 Лицевая сторона захвачена. Теперь снимите штрихкод', { position: 'top-center' });
          setTimeout(() => setNotification(''), 1500);
        } else if (!tempBarcodePhoto) {
          // Шаг 2: Захватываем ШТРИХКОД и АВТОМАТИЧЕСКИ запускаем распознавание
          const barcodeImg = image;
          const frontImg = tempFrontPhoto;
          setTempBarcodePhoto(barcodeImg);
          setDualPhotoStep('ready');
          setNotification('✅ Фото 2/2 - запуск AI...');
          toast.success('📸 Запускаю AI распознавание...', { position: 'top-center' });
          setIsProcessing(false);
          
          // АВТОМАТИЧЕСКИ запускаем с ПРЯМОЙ передачей фото (не через state!)
          setTimeout(() => {
            handleAIScanWithPhotos(frontImg, barcodeImg);
          }, 50);
          return;
        } else {
          // Если оба фото уже есть, игнорируем
          toast.warning('Обе фотографии уже захвачены', { position: 'top-center' });
          setIsProcessing(false);
        }
        return;
      }
      
      // Другие режимы - используйте AI dual режим
      setNotification('⚠️ Используйте AI режим');
      toast.warning('Используйте AI сканирование (режим dual)', { position: 'top-center' });
      setTimeout(() => setNotification(''), 1500);
    } catch (err: any) {
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

  // Функция AI сканирования с прямой передачей фото (обход async state)
  const handleAIScanWithPhotos = async (frontPhoto: string, barcodePhoto: string) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    setNotification('⚡ AI сканирование...');
    
    try {
      const compressedFront = await compressForAI(frontPhoto);
      const compressedBarcode = await compressForAI(barcodePhoto);
      
      const deviceId = localStorage.getItem('device_id') || `device-${Date.now()}`;
      if (!localStorage.getItem('device_id')) {
        localStorage.setItem('device_id', deviceId);
      }
      const userName = localStorage.getItem('login_user_name') || 'Устройство';
      
      // AI вызов с таймаутом 20 секунд (flash-lite быстрая модель)
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const aiController = new AbortController();
      const aiTimeout = setTimeout(() => aiController.abort(), 20000);
      
      let response: Response;
      try {
        response = await fetch(`${SUPABASE_URL}/functions/v1/fast-scan-product`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            frontPhoto: compressedFront,
            barcodePhoto: compressedBarcode,
            deviceId,
            userName
          }),
          signal: aiController.signal
        });
        clearTimeout(aiTimeout);
      } catch (fetchError: any) {
        clearTimeout(aiTimeout);
        if (fetchError.name === 'AbortError') {
          throw new Error('Таймаут AI - попробуйте снова');
        }
        throw fetchError;
      }
      
      if (!response.ok) {
        if (response.status === 429) {
          toast.error('⚠️ Превышен лимит, подождите');
          throw new Error('rate_limit');
        }
        throw new Error(`AI error: ${response.status}`);
      }
      
      const aiResult = await response.json();
      
      const scannedBarcode = aiResult.barcode || '';
      const scannedName = aiResult.name || '';
      const scannedCategory = aiResult.category || '';
      
      // Кэш цен загружен при монтировании - просто проверяем
      let priceInfo = scannedBarcode ? findPriceByBarcode(scannedBarcode) : null;
      
      if (!priceInfo && scannedName) {
        priceInfo = findPriceByName(scannedName);
      }
      
      const hasPrices = priceInfo && priceInfo.purchasePrice > 0;
      
      // Загрузка фото в S3 в фоне (не блокирует)
      const purchasePrice = priceInfo?.purchasePrice || 0;
      const salePrice = purchasePrice > 0 ? Math.round(purchasePrice * 1.3) : 0;
      
      // Загружаем фото в фон (не ждём)
      let frontPhotoUrl: string | undefined;
      let barcodePhotoUrl: string | undefined;
      
      const uploadPhotosInBackground = async () => {
        try {
          const { uploadProductPhoto } = await import('@/lib/productScanner');
          const barcode = scannedBarcode || `unknown_${Date.now()}`;
          
          const [frontResult, barcodeResult] = await Promise.allSettled([
            frontPhoto ? uploadProductPhoto(barcode, frontPhoto, 'front') : Promise.resolve(null),
            barcodePhoto ? uploadProductPhoto(barcode, barcodePhoto, 'barcode') : Promise.resolve(null)
          ]);
          
          if (frontResult.status === 'fulfilled') frontPhotoUrl = frontResult.value || undefined;
          if (barcodeResult.status === 'fulfilled') barcodePhotoUrl = barcodeResult.value || undefined;
        } catch {
          // Фото не критично
        }
      };
      
      // Запускаем загрузку фото в фоне
      uploadPhotosInBackground();
      
      // СРАЗУ добавляем в очередь гарантированного сохранения
      const { addProductToSaveQueue } = await import('@/lib/saveQueue');
      
      const queueResult = await addProductToSaveQueue({
        barcode: scannedBarcode || `unknown_${Date.now()}`,
        name: priceInfo?.name || scannedName || 'Неизвестный товар',
        category: priceInfo?.category || scannedCategory,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        quantity: 1,
        front_photo_url: frontPhotoUrl,
        barcode_photo_url: barcodePhotoUrl,
        scanned_by: userName
      });
      
      const savedTo = queueResult.hasPrice ? 'products' : 'queue';
      
      // Увеличиваем счетчик
      setAddedProductsCount(prev => prev + 1);
      
      // Очищаем для следующего товара
      setDualPhotoStep('none');
      setTempFrontPhoto('');
      setTempBarcodePhoto('');
      setIsProcessing(false);
      
      // Показываем статус (товар добавлен в очередь сохранения)
      if (savedTo === 'products') {
        const price = priceInfo?.purchasePrice || purchasePrice || 0;
        setNotification(`✅ ${scannedName} → сохраняется (${price}₽)`);
        toast.success(`✅ "${scannedName}" сохраняется в базу`, { duration: 2000 });
      } else {
        setNotification(`📋 ${scannedName || scannedBarcode} → очередь`);
        toast.info(`📋 "${scannedName || scannedBarcode}" в очередь`, { duration: 2000 });
      }
      
      onProductFound({
        barcode: scannedBarcode,
        name: scannedName,
        category: scannedCategory,
        frontPhoto,
        barcodePhoto
      });
      
      setTimeout(() => setNotification(''), 2000);
      
    } catch (error: any) {
      setIsProcessing(false);
      
      // НЕ СБРАСЫВАЕМ фото при ошибке! Пользователь может повторить
      // Сбрасываем только dualPhotoStep чтобы можно было нажать кнопку повторно
      setDualPhotoStep('ready');
      
      if (error.message?.includes('rate_limit')) {
        setNotification('⚠️ Лимит - повторите');
        toast.error('Лимит запросов, нажмите кнопку повторно');
      } else if (error.message?.includes('Таймаут')) {
        setNotification('⚠️ Таймаут - повторите');
        toast.error('Сервер не ответил, нажмите кнопку повторно');
      } else {
        setNotification('⚠️ Ошибка - повторите');
        toast.error('Ошибка, нажмите кнопку распознавания повторно');
      }
      
      // Через 3 сек скрываем уведомление но НЕ сбрасываем фото
      setTimeout(() => setNotification(''), 3000);
    }
  };

  // Повторная попытка распознавания (фото уже есть)
  const handleRetryAIScan = async () => {
    if (isProcessing) return;
    
    if (tempFrontPhoto && tempBarcodePhoto) {
      await handleAIScanWithPhotos(tempFrontPhoto, tempBarcodePhoto);
    } else {
      toast.warning('Сначала сделайте 2 фото', { position: 'top-center' });
    }
  };

  const handleAIScan = async () => {
    if (isProcessing) {
      toast.info('Обработка...', { position: 'top-center' });
      return;
    }
    
    if (!tempFrontPhoto || !tempBarcodePhoto) {
      toast.warning('⚠️ Нужны обе фотографии', { position: 'top-center' });
      return;
    }
    
    await handleAIScanWithPhotos(tempFrontPhoto, tempBarcodePhoto);
  };

  const handleConfirmExistingProduct = async () => {
    if (!existingProductData || !pendingRecognitionData) return;
    
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
      <SaveQueueIndicator />
      
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
