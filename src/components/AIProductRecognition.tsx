import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getAllProducts } from '@/lib/storage';

interface AIProductRecognitionProps {
  onProductFound: (data: { barcode: string; name?: string; category?: string; photoUrl?: string }) => void;
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
  const [manualCapture, setManualCapture] = useState(false);
  const failedAttemptsRef = useRef(0);
  const [autoCapturing, setAutoCapturing] = useState(false);

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1280, height: 720 }
      });
      
      if (videoRef.current && isMountedRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Доступ к камере запрещен. Разрешите доступ в настройках.');
      } else {
        setError('Не удалось запустить камеру.');
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

  const uploadPhotoToStorage = async (imageBase64: string): Promise<string | null> => {
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
      const fileName = `product-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
      const filePath = `scans/${fileName}`;

      // Загружаем в storage
      const { data, error } = await supabase.storage
        .from('product-photos')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (error) {
        console.error('Storage upload error:', error);
        return null;
      }

      // Получаем публичный URL
      const { data: urlData } = supabase.storage
        .from('product-photos')
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (err) {
      console.error('Error uploading photo:', err);
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
    // Сначала сохраняем фото в storage
    const photoUrl = await uploadPhotoToStorage(imageBase64);
    
    const allProducts = getAllProducts();
    
    const { data, error } = await supabase.functions.invoke('recognize-product', {
      body: {
        imageUrl: photoUrl || imageBase64, // Используем URL если есть, иначе base64
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
    return {
      barcode: result.barcode || '',
      name: result.name || '',
      category: result.category || '',
      photoUrl: photoUrl || undefined
    };
  };

  const handleManualCapture = async (isAuto: boolean = false) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    setManualCapture(true);
    if (isAuto) setAutoCapturing(true);

    try {
      if (isAuto) {
        setNotification(mode === 'barcode' ? '🤖 Автозахват штрихкода...' : '🤖 Автозахват товара...');
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        setNotification(mode === 'barcode' ? '📸 Захват штрихкода...' : '📸 Захват товара...');
      }
      
      const { image } = captureSharpImage();
      
      setNotification('✅ Анализирую...');
      photo1Ref.current = image;
      
      const result = await recognizeProduct(image, mode);
      
      if (mode === 'barcode') {
        // Режим штрихкода - принимаем только если есть штрихкод
        if (result.barcode) {
          setNotification('✅ Штрихкод распознан!');
          onProductFound(result);
          failedAttemptsRef.current = 0;
          setTimeout(() => {
            setNotification('');
            setManualCapture(false);
            setAutoCapturing(false);
          }, 1000);
        } else {
          setNotification('❌ Штрихкод не найден');
          setTimeout(() => {
            setNotification('');
            setManualCapture(false);
            setAutoCapturing(false);
          }, 1500);
        }
      } else {
        // Режим товара - принимаем если есть название или категория
        if (result.name || result.category) {
          setNotification('✅ Товар распознан!');
          onProductFound(result);
          failedAttemptsRef.current = 0;
          setTimeout(() => {
            setNotification('');
            setManualCapture(false);
            setAutoCapturing(false);
          }, 1000);
        } else {
          setNotification('❌ Товар не распознан');
          setTimeout(() => {
            setNotification('');
            setManualCapture(false);
            setAutoCapturing(false);
          }, 1500);
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
      setManualCapture(false);
      setAutoCapturing(false);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!isProcessing && !manualCapture && !autoCapturing) {
      const interval = setInterval(async () => {
        if (isProcessing || !isMountedRef.current) return;

        // Проверяем: если 3 неудачные попытки подряд, делаем автозахват
        if (failedAttemptsRef.current >= 3) {
          console.log('Переключение на режим автозахвата после неудачных попыток');
          failedAttemptsRef.current = 0;
          handleManualCapture(true);
          return;
        }

        setIsProcessing(true);

        try {
          setNotification(mode === 'barcode' ? '📷 Ищу штрихкод...' : '📷 Ищу товар...');
          setIsWaitingForSharpImage(true);
          
          const { image, isSharp } = captureSharpImage();
          
          if (!isSharp) {
            setIsWaitingForSharpImage(false);
            setIsProcessing(false);
            failedAttemptsRef.current++;
            return;
          }
          
          setNotification('✅ Анализирую...');
          setIsWaitingForSharpImage(false);
          photo1Ref.current = image;
          
          const result = await recognizeProduct(image, mode);
          
          if (mode === 'barcode') {
            // Режим штрихкода - принимаем только штрихкод
            if (result.barcode) {
              setNotification('✅ Штрихкод распознан!');
              onProductFound(result);
              failedAttemptsRef.current = 0;
              setTimeout(() => setNotification(''), 1000);
            } else {
              setNotification('');
              failedAttemptsRef.current++;
            }
          } else {
            // Режим товара - принимаем название/категорию
            if (result.name || result.category) {
              setNotification('✅ Товар распознан!');
              onProductFound(result);
              failedAttemptsRef.current = 0;
              setTimeout(() => setNotification(''), 1000);
            } else {
              setNotification('');
              failedAttemptsRef.current++;
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
          failedAttemptsRef.current++;
        } finally {
          setIsProcessing(false);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [isProcessing, manualCapture, autoCapturing, mode]);

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
              Активно
            </div>
          </div>
        </div>

        <div className="relative bg-black rounded-b-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-video object-cover"
          />

          {notification && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in">
              {notification.includes('✅') ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              <span className="font-medium">{notification}</span>
            </div>
          )}

          {isProcessing && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-2 bg-black/70 text-white px-4 py-2 rounded-full">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Распознавание...</span>
              </div>
            </div>
          )}

          {!isProcessing && !autoCapturing && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <Button
                onClick={() => handleManualCapture(false)}
                size="lg"
                className="rounded-full shadow-lg"
              >
                <Camera className="h-5 w-5 mr-2" />
                Сфотографировать
              </Button>
            </div>
          )}
          
          {autoCapturing && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
              <div className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-full">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Автозахват...</span>
              </div>
            </div>
          )}
        </div>

        {error ? (
          <div className="p-4 text-center">
            <div className="text-destructive text-sm mb-3">{error}</div>
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
                  <p>🤖 При неудачах - автоматический захват</p>
                  <p>📸 Или нажмите кнопку для мгновенной съемки</p>
                </>
              ) : (
                <>
                  <p>📱 Режим распознавания товара</p>
                  <p>📷 Покажите переднюю часть упаковки</p>
                  <p>⚡ Автоматическое распознавание каждые 2 сек</p>
                  <p>🤖 При неудачах - автоматический захват</p>
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
