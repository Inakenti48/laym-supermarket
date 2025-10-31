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
      // Запуск камеры
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
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

      // Периодическое распознавание по изображению
      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const now = Date.now();
        if (now - lastScanTime < 3000) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        const product = await recognizeProduct(imageData);
        
        if (product) {
          setLastScanTime(now);
          onProductFound({ name: product.name, barcode: product.barcode });
          toast.success(`Распознан: ${product.name}`);
        }
      }, 2000);

      setIsScanning(true);
      toast.success('Сканер запущен');
    } catch (error) {
      console.error('Ошибка запуска сканера:', error);
      toast.error('Не удалось запустить камеру');
    }
  };

  const stopScanning = async () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (error) {
        console.error('Ошибка остановки сканера:', error);
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsScanning(false);
  };

  return (
    <>
      {/* Скрытая область для html5-qrcode */}
      <div id={scannerIdRef.current} className="hidden" />
      
      {/* Скрытое видео для OCR */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

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
            Остановить
          </>
        ) : (
          <>
            <Scan className="w-4 h-4" />
            Сканировать
          </>
        )}
        
        {/* Индикатор активного сканирования */}
        {isScanning && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
          </span>
        )}
      </Button>
    </>
  );
};
