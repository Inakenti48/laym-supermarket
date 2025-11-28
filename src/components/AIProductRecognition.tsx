import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getAllProducts } from '@/lib/storage';
import { compressForAI } from '@/lib/imageCompression';
import { retryOperation } from '@/lib/retryUtils';
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

  useEffect(() => {
    isMountedRef.current = true;
    startCamera();

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

  const saveToTemporaryStorage = async (imageBase64: string, barcode: string, productName: string): Promise<string | null> => {
    try {
      // Конвертируем base64 в blob с высоким качеством
      const base64Data = imageBase64.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      // Генерируем уникальное имя файла
      const fileName = `temp-${barcode}-${Date.now()}.jpg`;
      const filePath = `temporary/${fileName}`;

      // Загружаем в storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('product-photos')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return null;
      }

      // Получаем публичный URL
      const { data: urlData } = supabase.storage
        .from('product-photos')
        .getPublicUrl(filePath);

      // Проверяем, есть ли уже такой товар во временной базе
      const { data: existing } = await supabase
        .from('vremenno_product_foto')
        .select('id')
        .eq('barcode', barcode)
        .eq('product_name', productName)
        .maybeSingle();

      // Если товара нет, добавляем в временную базу с повторными попытками
      if (!existing) {
        await retryOperation(
          async () => {
            const { error: dbError } = await supabase
              .from('vremenno_product_foto')
              .insert({
                barcode,
                product_name: productName,
                image_url: urlData.publicUrl,
                storage_path: filePath
              });

            if (dbError) throw dbError;
            
            console.log('Photo saved to temporary storage');
          },
          {
            maxAttempts: 5,
            initialDelay: 1000,
            onRetry: (attempt) => {
              console.log(`🔄 Повторная попытка сохранения в очередь (попытка ${attempt})...`);
            }
          }
        );
      } else {
        console.log('Product already exists in temporary storage');
      }

      return urlData.publicUrl;
    } catch (err) {
      console.error('Error saving to temporary storage:', err);
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

  const recognizeProduct = async (imageBase64: string, type: 'product' | 'barcode' | 'expiry' | 'dual'): Promise<{ barcode: string; name?: string; category?: string; photoUrl?: string }> => {
    // Сжимаем изображение сразу для всех операций
    console.log('📦 Сжатие изображения...');
    const compressedImage = await compressForAI(imageBase64);
    
    // Упрощаем логику: сразу обращаемся к AI, без предварительного поиска по фото,
    // чтобы сканирование работало максимально быстро
    console.log('🤖 AI распознавание (без предварительного поиска по фото)...');
    const allProducts = await getAllProducts();
    
    const { data, error } = await supabase.functions.invoke('recognize-product', {
      body: {
        imageUrl: compressedImage,  // Используем сжатое изображение
        recognitionType: type,
        allProducts: allProducts.map(p => ({
          barcode: p.barcode,
          name: p.name,
          category: p.category,
          photos: p.photos
        }))
      }
    });

    if (error) {
      console.error('Recognition error:', error);
      throw error;
    }

    const result = data?.result || {};
    
    // Возвращаем результат с захваченным изображением для сохранения
    return {
      barcode: result.barcode || '',
      name: result.name || '',
      category: result.category || '',
      photoUrl: imageBase64  // Передаем изображение для последующего сохранения
    };
  };

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
      
      // Если режим распознавания срока годности
      if (mode === 'expiry') {
        setNotification('🔍 Распознавание дат...');
        
        try {
          // Сжимаем изображение перед отправкой
          const compressedImage = await compressForAI(image);
          
          const { data, error } = await supabase.functions.invoke('recognize-expiry-date', {
            body: { imageBase64: compressedImage }
          });

          if (error) {
            console.error('Ошибка вызова recognize-expiry-date:', error);
            setNotification('❌ Ошибка');
            setTimeout(() => setNotification(''), 1500);
            toast.error('Ошибка при распознавании дат', { position: 'top-center' });
            return;
          }

          console.log('📅 Результат распознавания дат:', data);

          if (data?.manufacturingDate || data?.expiryDate) {
            setNotification('✅ Даты распознаны!');
            
            onProductFound({ 
              barcode: '', 
              capturedImage: image,
              expiryDate: data.expiryDate,
              manufacturingDate: data.manufacturingDate 
            });
            
            setTimeout(() => setNotification(''), 1000);
          } else {
            setNotification('❌ Даты не найдены');
            setTimeout(() => setNotification(''), 1500);
            toast.warning('⚠️ Даты не найдены на изображении', { position: 'top-center' });
          }
        } catch (err: any) {
          console.error('Ошибка распознавания срока годности:', err);
          setNotification('❌ Ошибка');
          setTimeout(() => setNotification(''), 1500);
          toast.error('Ошибка при распознавании дат', { position: 'top-center' });
        }
        
        setIsProcessing(false);
        return;
      }
      
      const result = await recognizeProduct(image, mode);
      
      if (mode === 'barcode') {
        if (result.barcode) {
          setNotification('✅ Готово!');
          
          const productKey = result.barcode;
          const currentQty = recognizedProducts.get(productKey) || 0;
          const newQty = currentQty + quantity;
          setRecognizedProducts(new Map(recognizedProducts.set(productKey, newQty)));
          
          onProductFound({ ...result, capturedImage: image, quantity: newQty });
          setTimeout(() => setNotification(''), 800);
        } else {
          setNotification('❌ Не найден');
          setTimeout(() => setNotification(''), 1000);
        }
      } else {
        if (result.name || result.category) {
          setNotification('✅ Готово!');
          
          const productKey = result.barcode || result.name || '';
          const currentQty = recognizedProducts.get(productKey) || 0;
          const newQty = currentQty + quantity;
          setRecognizedProducts(new Map(recognizedProducts.set(productKey, newQty)));
          
          onProductFound({ ...result, capturedImage: image, quantity: newQty });
          setTimeout(() => setNotification(''), 800);
        } else {
          setNotification('❌ Не распознан');
          setTimeout(() => setNotification(''), 1000);
        }
      }
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
    setNotification('🔍 AI сканирование фотографий...');
    
    try {
      // Сжимаем изображения перед отправкой
      console.log('📦 Сжатие изображений...');
      const compressedFront = await compressForAI(tempFrontPhoto);
      const compressedBarcode = await compressForAI(tempBarcodePhoto);
      
      console.log('📦 После сжатия:', {
        front: compressedFront.length,
        barcode: compressedBarcode.length
      });
      
      // КРИТИЧНО: Вызываем ТОЛЬКО scan-product-photos для режима dual
      console.log('📷 Вызов scan-product-photos edge function...');
      const { data: scanData, error: scanError } = await supabase.functions.invoke('scan-product-photos', {
        body: { 
          frontPhoto: compressedFront,
          barcodePhoto: compressedBarcode
        }
      });
      
      console.log('📦 Ответ от scan-product-photos:', { scanData, scanError });

      // Извлекаем данные из ответа (даже при ошибке пробуем получить что-то)
      const scannedBarcode = scanData?.barcode || '';
      const scannedName = scanData?.name || '';
      const scannedCategory = scanData?.category || '';

      console.log('📊 Данные из AI:', { scannedBarcode, scannedName, scannedCategory, hasError: !!scanError });

      // КРИТИЧНО: Всегда передаем товар с фотографиями, даже если AI не смог распознать
      // Пользователь заполнит данные вручную
      console.log('✅ Передача товара с фотографиями в форму');
      
      onProductFound({
        barcode: scannedBarcode,
        name: scannedName,
        category: scannedCategory,
        frontPhoto: tempFrontPhoto,
        barcodePhoto: tempBarcodePhoto
      });
      
      // Увеличиваем счетчик добавленных товаров
      setAddedProductsCount(prev => prev + 1);
      
      // СРАЗУ очищаем фотографии и готовим камеру для следующего товара
      // НЕ ЖДЕМ окончания обработки формы
      setDualPhotoStep('none');
      setTempFrontPhoto('');
      setTempBarcodePhoto('');
      setIsProcessing(false); // Разблокируем сразу для следующего товара
      
      // Для удобства оставляем только тихую текстовую подсказку в блоке камеры,
      // без всплывающих тостов
      if (scanError) {
        setNotification('⚠️ Не удалось распознать, заполните вручную');
      } else if (scannedBarcode && scannedName) {
        setNotification('✅ Товар распознан AI - готов к следующему');
      } else if (scannedBarcode) {
        setNotification('✅ Штрихкод распознан - готов к следующему');
      } else if (scannedName) {
        setNotification('✅ Название распознано - готов к следующему');
      } else {
        setNotification('📸 Фото сохранены - готов к следующему');
      }
      
      setTimeout(() => setNotification(''), 2000);
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

          <div className="relative rounded-b-lg overflow-hidden bg-black" style={{ minHeight: '500px' }}>
            <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ 
              width: '100%',
              height: 'auto',
              minHeight: '500px',
              maxHeight: '700px',
              objectFit: 'cover',
              display: 'block',
              backgroundColor: '#000'
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
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000000] space-y-3 bg-card/95 p-4 rounded-xl shadow-lg border">
              {mode === 'dual' && (
                <div className="mb-2 text-center space-y-1">
                  {!tempFrontPhoto && !tempBarcodePhoto && (
                    <p className="text-sm font-medium text-muted-foreground">📸 Шаг 1/2: Снимите лицевую сторону</p>
                  )}
                  {tempFrontPhoto && !tempBarcodePhoto && (
                    <p className="text-sm font-medium text-green-600">✅ Лицевая готова! Шаг 2/2: Снимите штрихкод</p>
                  )}
                  {tempFrontPhoto && tempBarcodePhoto && (
                    <p className="text-sm font-medium text-green-600">✅ Обе фото готовы! Нажмите кнопку ниже</p>
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
                  className="rounded-full shadow-lg w-full"
                  disabled={!cameraReady || isProcessing}
                >
                  <Camera className="h-5 w-5 mr-2" />
                  {!tempFrontPhoto ? 'Снять лицевую (1/2)' : 'Снять штрихкод (2/2)'}
                </Button>
              )}
              
              {mode === 'dual' && dualPhotoStep === 'ready' && (
                <div className="space-y-2 animate-in slide-in-from-bottom-4">
                  <div className="bg-green-50 dark:bg-green-950 border-2 border-green-500 rounded-lg p-3 mb-2">
                    <p className="text-sm font-bold text-green-700 dark:text-green-300 text-center flex items-center justify-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Обе фотографии готовы! Нажмите кнопку ниже
                    </p>
                  </div>
                  <Button
                    onClick={handleAIScan}
                    size="lg"
                    className="rounded-full shadow-xl w-full bg-green-600 hover:bg-green-700 text-white font-bold text-base py-7 animate-pulse"
                    disabled={!cameraReady || isProcessing || !tempFrontPhoto || !tempBarcodePhoto}
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Распознавание...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-6 w-6 mr-2" />
                        ✅ РАСПОЗНАТЬ ТОВАР
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => {
                      console.log('🔄 Сброс фотографий для повторной съемки');
                      setTempFrontPhoto('');
                      setTempBarcodePhoto('');
                      setDualPhotoStep('none');
                      toast.info('📸 Начните сначала: снимите лицевую сторону', { position: 'top-center' });
                    }}
                    variant="outline"
                    size="sm"
                    className="w-full"
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
