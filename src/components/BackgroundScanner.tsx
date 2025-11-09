import { useState, useRef, useEffect } from 'react';
import { Scan, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/integrations/supabase/client';
import { findProductByBarcode, getAllProducts } from '@/lib/storage';

interface BackgroundScannerProps {
  onProductFound: (data: { barcode?: string; name?: string }) => void;
  autoStart?: boolean;
}

export const BackgroundScanner = ({ onProductFound, autoStart = false }: BackgroundScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerIdRef = useRef<string>(`scanner-${Date.now()}`);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (autoStart) {
      startScanning();
    }
    return () => {
      stopScanning();
    };
  }, [autoStart]);

  const recognizeProduct = async (imageData: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('recognize-product-by-photo', {
        body: { imageBase64: imageData }
      });

      if (error) {
        console.error('❌ Ошибка распознавания:', error);
        return null;
      }

      const result = data?.result;
      if (result?.recognized && result.barcode) {
        console.log('✅ Товар распознан:', result.name);
        return { barcode: result.barcode, name: result.name };
      }

      return null;
    } catch (error) {
      console.error('❌ Ошибка распознавания:', error);
      return null;
    }
  };

  const startScanning = async () => {
    try {
      setIsScanning(true);
      
      // Запуск камеры
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Запуск сканирования штрихкода
      const scanner = new Html5Qrcode(scannerIdRef.current);
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          const now = Date.now();
          if (now - lastScanTime < 3000) return;

          console.log('📊 Штрихкод найден:', decodedText);
          
          const product = await findProductByBarcode(decodedText);
          if (product) {
            setLastScanTime(now);
            onProductFound({ barcode: decodedText, name: product.name });
            toast.success(`Найден: ${product.name}`);
          } else {
            toast.error('Товар не найден в базе');
          }
        },
        (errorMessage) => {
          // Игнорируем ошибки сканирования
        }
      );

      // Периодическое распознавание по изображению (каждые 3 секунды)
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current || !isScanning) return;
        
        const now = Date.now();
        if (now - lastScanTime < 3000) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        
        if (!ctx || video.videoWidth === 0) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        const product = await recognizeProduct(imageData);
        
        if (product) {
          setLastScanTime(now);
          onProductFound({ name: product.name, barcode: product.barcode });
          toast.success(`✅ Распознан: ${product.name}`);
        } else {
          console.log('🔍 Товар не распознан на кадре');
        }
      }, 3000);

      toast.success('Сканер запущен');
    } catch (error) {
      console.error('Ошибка запуска сканера:', error);
      toast.error('Не удалось запустить камеру');
    }
  };

  const stopScanning = async () => {
    console.log('🛑 Остановка сканера...');
    setIsScanning(false);

    // Останавливаем интервал распознавания
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
      console.log('✓ Интервал остановлен');
    }

    // Останавливаем HTML5 QR сканер
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
        console.log('✓ QR сканер остановлен');
      } catch (error) {
        console.error('Ошибка остановки QR сканера:', error);
      }
    }

    // Останавливаем видео поток
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('✓ Трек камеры остановлен:', track.kind);
      });
      streamRef.current = null;
    }

    // Очищаем видео элемент
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    toast.success('Сканер остановлен');
    console.log('✅ Сканер полностью остановлен');
  };

  return (
    <>
      {/* Скрытая область для html5-qrcode */}
      <div id={scannerIdRef.current} className="hidden" />
      
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex flex-col items-center gap-3">
        {/* Видео окно для сканирования */}
        {isScanning && (
          <div className="relative w-full max-w-sm rounded-lg overflow-hidden border-2 border-primary shadow-lg bg-black">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="w-full h-auto"
              style={{ maxHeight: '300px', objectFit: 'cover' }}
            />
            
            {/* Рамка сканирования */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-4 border-primary rounded-lg">
                {/* Углы рамки */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-500"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-500"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-500"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-500"></div>
                
                {/* Анимированная линия сканирования */}
                <div className="absolute inset-0 overflow-hidden">
                  <div className="w-full h-1 bg-green-500 animate-scan-line"></div>
                </div>
              </div>
            </div>
            
            {/* Статус индикатор */}
            <div className="absolute top-2 right-2 flex items-center gap-2 bg-black/70 px-3 py-1 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-xs text-white font-medium">Сканирование</span>
            </div>
          </div>
        )}

        {/* Кнопка управления сканированием */}
        <Button
          onClick={isScanning ? stopScanning : startScanning}
          variant={isScanning ? "destructive" : "default"}
          size="sm"
          className="gap-2 relative"
        >
          {isScanning ? (
            <>
              <X className="w-4 h-4" />
              Остановить камеру
            </>
          ) : (
            <>
              <Scan className="w-4 h-4" />
              Запустить камеру
            </>
          )}
        </Button>
      </div>
      
      <style>{`
        @keyframes scan-line {
          0% { transform: translateY(0); }
          100% { transform: translateY(192px); }
        }
        .animate-scan-line {
          animation: scan-line 2s linear infinite;
        }
      `}</style>
    </>
  );
};
