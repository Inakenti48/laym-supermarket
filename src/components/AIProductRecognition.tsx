import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getAllProducts } from '@/lib/storage';

interface AIProductRecognitionProps {
  onProductFound: (data: { barcode: string; name?: string; category?: string; photoUrl?: string; capturedImage?: string }) => void;
  mode?: 'product' | 'barcode';
}

export const AIProductRecognition = ({ onProductFound, mode = 'product' }: AIProductRecognitionProps) => {
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

  useEffect(() => {
    isMountedRef.current = true;
    startCamera();

    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      setCameraReady(false);
      console.log('Запрос доступа к камере...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
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
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
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

      // Если товара нет, добавляем в временную базу
      if (!existing) {
        const { error: dbError } = await supabase
          .from('vremenno_product_foto')
          .insert({
            barcode,
            product_name: productName,
            image_url: urlData.publicUrl,
            storage_path: filePath
          });

        if (dbError) {
          console.error('Database insert error:', dbError);
        } else {
          console.log('Photo saved to temporary storage');
        }
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
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return { image: '', isSharp: false };
    
    ctx.drawImage(video, 0, 0);
    
    // Проверяем резкость
    const sharpness = checkImageSharpness(canvas);
    const threshold = 400; // Более низкий порог для быстрого распознавания
    
    // Сохраняем в высоком качестве (95%)
    const image = canvas.toDataURL('image/jpeg', 0.95);
    
    return {
      image,
      isSharp: sharpness > threshold
    };
  };

  const recognizeProduct = async (imageBase64: string, type: 'product' | 'barcode'): Promise<{ barcode: string; name?: string; category?: string; photoUrl?: string }> => {
    const allProducts = await getAllProducts();
    
    const { data, error } = await supabase.functions.invoke('recognize-product', {
      body: {
        imageUrl: imageBase64,
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
    const barcode = result.barcode || '';
    const name = result.name || '';
    
    // Сохраняем во временную базу если есть штрихкод и название
    let photoUrl: string | null = null;
    if (barcode && name) {
      photoUrl = await saveToTemporaryStorage(imageBase64, barcode, name);
    }
    
    return {
      barcode,
      name,
      category: result.category || '',
      photoUrl: photoUrl || undefined
    };
  };

  const handleManualCapture = async () => {
    if (isProcessing) return;
    
    setIsProcessing(true);

    try {
      setNotification(mode === 'barcode' ? '📸 Захват штрихкода...' : '📸 Захват товара...');
      
      const { image } = captureSharpImage();
      
      if (!image) {
        setNotification('❌ Камера не готова');
        setTimeout(() => setNotification(''), 1500);
        return;
      }
      
      setNotification('✅ Анализирую...');
      photo1Ref.current = image;
      
      const result = await recognizeProduct(image, mode);
      
      if (mode === 'barcode') {
        if (result.barcode) {
          setNotification('✅ Штрихкод распознан!');
          onProductFound({ ...result, capturedImage: image });
          setTimeout(() => setNotification(''), 1000);
        } else {
          setNotification('❌ Штрихкод не найден');
          setTimeout(() => setNotification(''), 1500);
        }
      } else {
        if (result.name || result.category) {
          setNotification('✅ Товар распознан!');
          onProductFound({ ...result, capturedImage: image });
          setTimeout(() => setNotification(''), 1000);
        } else {
          setNotification('❌ Товар не распознан');
          setTimeout(() => setNotification(''), 1500);
        }
      }
    } catch (err: any) {
      console.error('Recognition error:', err);
      if (err.message?.includes('rate_limit') || err.message?.includes('429')) {
        toast.error('Слишком много запросов, подождите немного');
      } else if (err.message?.includes('payment_required') || err.message?.includes('402')) {
        toast.error('Требуется пополнить баланс Lovable AI');
      }
      setNotification('');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!isProcessing && cameraReady) {
      const interval = setInterval(async () => {
        if (isProcessing || !isMountedRef.current || !cameraReady) return;

        setIsProcessing(true);

        try {
          setNotification(mode === 'barcode' ? '📷 Ищу штрихкод...' : '📷 Ищу товар...');
          
          const { image, isSharp } = captureSharpImage();
          
          if (!image || !isSharp) {
            setIsProcessing(false);
            setNotification('');
            return;
          }
          
          setNotification('✅ Анализирую...');
          photo1Ref.current = image;
          
          const result = await recognizeProduct(image, mode);
          
          if (mode === 'barcode') {
            if (result.barcode) {
              setNotification('✅ Штрихкод распознан!');
              onProductFound({ ...result, capturedImage: image });
              setTimeout(() => setNotification(''), 1000);
            } else {
              setNotification('');
            }
          } else {
            if (result.name || result.category) {
              setNotification('✅ Товар распознан!');
              onProductFound({ ...result, capturedImage: image });
              setTimeout(() => setNotification(''), 1000);
            } else {
              setNotification('');
            }
          }
        } catch (err: any) {
          console.error('Recognition cycle error:', err);
          if (err.message?.includes('rate_limit') || err.message?.includes('429')) {
            toast.error('Слишком много запросов, подождите немного');
          } else if (err.message?.includes('payment_required') || err.message?.includes('402')) {
            toast.error('Требуется пополнить баланс Lovable AI');
          }
          setNotification('');
        } finally {
          setIsProcessing(false);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isProcessing, mode, cameraReady]);

  const getStepIndicator = () => {
    return mode === 'barcode' ? '📷 Распознавание штрихкода' : '📷 Распознавание товара';
  };

  return (
    <div className="w-full">
      <canvas ref={canvasRef} className="hidden" />
      
      <div className="bg-card rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b bg-primary/5">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">AI-распознавание товаров</h3>
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
          
          {/* Индикатор загрузки камеры */}
          {!cameraReady && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/95">
              <div className="text-center text-white p-6">
                <Camera className="w-16 h-16 mx-auto mb-4 text-primary animate-pulse" />
                <p className="text-xl font-bold mb-2">Запрос доступа к камере</p>
                <p className="text-base text-gray-300 mb-4">Нажмите "Разрешить" в диалоге браузера</p>
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              </div>
            </div>
          )}

          {notification && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in z-10">
              {notification.includes('✅') ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <span className="font-medium">{notification}</span>
            </div>
          )}

          {isProcessing && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <div className="flex items-center gap-2 bg-black/70 text-white px-4 py-2 rounded-full">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Распознавание...</span>
              </div>
            </div>
          )}

          {!isProcessing && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
              <Button
                onClick={handleManualCapture}
                size="lg"
                className="rounded-full shadow-lg"
                disabled={!cameraReady}
              >
                <Camera className="h-5 w-5 mr-2" />
                Сфотографировать
              </Button>
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
              🤖 AI {mode === 'barcode' ? 'распознавание штрихкода' : 'распознавание товара'}
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              {mode === 'barcode' ? (
                <>
                  <p>📱 Режим распознавания штрихкода</p>
                  <p>📷 Наведите камеру на штрихкод</p>
                  <p>⚡ Автоматическое распознавание каждые 2 сек</p>
                  <p>📸 Или нажмите кнопку для мгновенной съемки</p>
                </>
              ) : (
                <>
                  <p>📱 Режим распознавания товара</p>
                  <p>📷 Покажите переднюю часть упаковки</p>
                  <p>⚡ Автоматическое распознавание каждые 2 сек</p>
                  <p>📸 Или нажмите кнопку для мгновенной съемки</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
