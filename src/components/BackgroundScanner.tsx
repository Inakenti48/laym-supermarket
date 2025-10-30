import { useState, useRef, useEffect } from 'react';
import { Scan, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Tesseract from 'tesseract.js';
import { BrowserMultiFormatReader } from '@zxing/library';
import { findProductByBarcode, getAllProducts } from '@/lib/storage';

interface BackgroundScannerProps {
  onProductFound: (data: { barcode?: string; name?: string }) => void;
  autoStart?: boolean;
}

export const BackgroundScanner = ({ onProductFound, autoStart = false }: BackgroundScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [lastScanTime, setLastScanTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Определяем тип устройства
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  useEffect(() => {
    if (autoStart) {
      startScanning();
    }
    return () => {
      stopScanning();
    };
  }, [autoStart]);

  const startScanning = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: isMobile ? 'environment' : 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      setCameraStream(stream);
      setIsScanning(true);
      
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Начинаем постоянное сканирование
          startContinuousScan();
        }
      }, 100);
    } catch (error) {
      console.error('Ошибка доступа к камере:', error);
      toast.error('Не удалось получить доступ к камере');
    }
  };

  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsScanning(false);
  };

  const startContinuousScan = () => {
    // Сканируем каждые 2 секунды
    scanIntervalRef.current = setInterval(() => {
      captureAndAnalyze();
    }, 2000);
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const now = Date.now();
    // Защита от слишком частых сканирований одного и того же товара
    if (now - lastScanTime < 3000) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0);
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

    // Сначала пробуем распознать штрихкод (быстрее)
    try {
      const codeReader = new BrowserMultiFormatReader();
      const result = await codeReader.decodeFromImage(undefined, imageBase64);
      const barcodeText = result.getText();
      
      if (barcodeText) {
        console.log('📊 Штрихкод найден:', barcodeText);
        
        // Проверяем, есть ли товар с таким штрихкодом
        const product = await findProductByBarcode(barcodeText);
        if (product) {
          setLastScanTime(now);
          onProductFound({ barcode: barcodeText, name: product.name });
          return;
        }
      }
    } catch (error) {
      // Штрихкод не найден, пробуем OCR
    }

    // Если штрихкод не найден, пробуем OCR названия
    try {
      const result = await Tesseract.recognize(imageBase64, 'rus+eng', {
        logger: () => {} // Отключаем логирование для производительности
      });

      const text = result.data.text.trim();
      if (text.length > 3) {
        const lines = text.split('\n').filter(line => line.trim().length > 3);
        
        // Берем первые несколько строк как потенциальное название
        for (const line of lines.slice(0, 3)) {
          const cleanLine = line.trim();
          if (cleanLine.length < 3) continue;
          
          // Ищем товар по названию
          const allProducts = await getAllProducts();
          const product = allProducts.find(p => {
            const productLower = p.name.toLowerCase();
            const searchLower = cleanLine.toLowerCase();
            return productLower.includes(searchLower) || searchLower.includes(productLower);
          });
          
          if (product) {
            console.log('📝 Товар найден по названию:', cleanLine, '->', product.name);
            setLastScanTime(now);
            onProductFound({ name: product.name });
            return;
          }
        }
      }
    } catch (error) {
      // Не удалось распознать текст
    }
  };

  return (
    <>
      {/* Скрытое видео (работает в фоне) */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline
        muted
        className="hidden"
      />
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
