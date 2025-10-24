import { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getAllProducts } from '@/lib/storage';

interface AIProductRecognitionProps {
  onProductFound: (barcode: string) => void;
}

type RecognitionStep = 'photo1' | 'photo2' | 'retry';

export const AIProductRecognition = ({ onProductFound }: AIProductRecognitionProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [currentStep, setCurrentStep] = useState<RecognitionStep>('photo1');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<string>('');
  const [error, setError] = useState<string>('');
  const photo1Ref = useRef<string>('');
  const isMountedRef = useRef(true);

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

  const recognizeProduct = async (imageBase64: string, type: 'product' | 'barcode'): Promise<string> => {
    const allProducts = getAllProducts();
    
    const { data, error } = await supabase.functions.invoke('recognize-product', {
      body: {
        imageBase64,
        recognitionType: type,
        allProducts: allProducts.map(p => ({
          barcode: p.barcode,
          name: p.name,
          retailPrice: p.retailPrice
        }))
      }
    });

    if (error) {
      console.error('Recognition error:', error);
      throw error;
    }

    return data?.result || '';
  };

  useEffect(() => {
    if (!isProcessing) {
      const interval = setInterval(async () => {
        if (isProcessing || !isMountedRef.current) return;

        setIsProcessing(true);

        try {
          if (currentStep === 'photo1') {
            // Шаг 1: Фото лицевой стороны
            setNotification('📷 Сканирую лицевую сторону...');
            const image = captureImage();
            photo1Ref.current = image;
            
            const barcode = await recognizeProduct(image, 'product');
            
            if (barcode) {
              setNotification(`✅ Товар распознан!`);
              onProductFound(barcode);
              setTimeout(() => setNotification(''), 1000);
            } else {
              // Не распознали, переходим к фото штрихкода
              setCurrentStep('photo2');
              setNotification('🔄 Переверните на штрихкод');
              setTimeout(() => setNotification(''), 2000);
            }
          } else if (currentStep === 'photo2') {
            // Шаг 2: Фото штрихкода
            setNotification('📷 Сканирую штрихкод...');
            const image = captureImage();
            
            const barcode = await recognizeProduct(image, 'barcode');
            
            if (barcode) {
              setNotification(`✅ Штрихкод распознан!`);
              onProductFound(barcode);
              setTimeout(() => {
                setNotification('');
                setCurrentStep('photo1');
                photo1Ref.current = '';
              }, 1000);
            } else {
              // Не распознали, возвращаемся к более тщательному анализу первого фото
              setCurrentStep('retry');
              setNotification('🔄 Повторный анализ...');
            }
          } else if (currentStep === 'retry') {
            // Шаг 3: Повторный тщательный анализ первого фото
            setNotification('🔍 Тщательный анализ...');
            
            const barcode = await recognizeProduct(photo1Ref.current, 'product');
            
            if (barcode) {
              setNotification(`✅ Товар распознан!`);
              onProductFound(barcode);
              setTimeout(() => {
                setNotification('');
                setCurrentStep('photo1');
                photo1Ref.current = '';
              }, 1000);
            } else {
              // Снова не распознали, начинаем цикл заново
              setCurrentStep('photo1');
              photo1Ref.current = '';
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
          // Сбрасываем цикл при ошибке
          setCurrentStep('photo1');
          photo1Ref.current = '';
          setNotification('');
        } finally {
          setIsProcessing(false);
        }
      }, 3000); // Интервал между попытками распознавания

      return () => clearInterval(interval);
    }
  }, [currentStep, isProcessing]);

  const getStepIndicator = () => {
    switch (currentStep) {
      case 'photo1':
        return '1️⃣ Лицевая сторона';
      case 'photo2':
        return '2️⃣ Штрихкод';
      case 'retry':
        return '3️⃣ Повторный анализ';
    }
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
        </div>

        {error ? (
          <div className="p-4 text-center">
            <div className="text-destructive text-sm mb-3">{error}</div>
          </div>
        ) : (
          <div className="p-4 text-center space-y-2">
            <p className="text-sm text-muted-foreground font-medium">
              🤖 AI автоматически распознаёт товары по фото и штрихкоду
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>1️⃣ Покажите лицевую сторону товара</p>
              <p>2️⃣ Если не распознал - переверните на штрихкод</p>
              <p>3️⃣ Система будет пробовать до успешного распознавания</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
