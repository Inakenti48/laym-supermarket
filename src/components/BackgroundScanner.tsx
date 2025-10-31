import { useState, useRef, useEffect } from 'react';
import { Scan, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Html5Qrcode } from 'html5-qrcode';
import { findProductByBarcode } from '@/lib/storage';

interface BackgroundScannerProps {
  onProductFound: (data: { barcode?: string; name?: string }) => void;
  autoStart?: boolean;
}

export const BackgroundScanner = ({ onProductFound, autoStart = false }: BackgroundScannerProps) => {
  const [isScanning, setIsScanning] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerIdRef = useRef<string>(`scanner-${Date.now()}`);

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
          // Игнорируем ошибки сканирования (нормально, когда штрихкод не виден)
        }
      );

      setIsScanning(true);
    } catch (error) {
      console.error('Ошибка запуска сканера:', error);
      toast.error('Не удалось запустить камеру');
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
        scannerRef.current = null;
      } catch (error) {
        console.error('Ошибка остановки сканера:', error);
      }
    }
    setIsScanning(false);
  };

  return (
    <>
      {/* Область для сканера (скрыта, но нужна для html5-qrcode) */}
      <div id={scannerIdRef.current} className="hidden" />

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
