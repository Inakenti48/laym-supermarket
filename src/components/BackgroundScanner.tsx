import { useState, useRef, useEffect } from 'react';
import { Scan, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Html5Qrcode } from 'html5-qrcode';
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

  useEffect(() => {
    if (autoStart) {
      startScanning();
    }
    return () => {
      stopScanning();
    };
  }, [autoStart]);

  // Поиск товара в локальной базе вместо AI распознавания
  const findProduct = async (barcode: string) => {
    try {
      const product = await findProductByBarcode(barcode);
      if (product) {
        return { barcode: product.barcode, name: product.name };
      }
      return { barcode, name: undefined };
    } catch (error) {
      console.error('❌ Ошибка поиска:', error);
      return null;
    }
  };

  const startScanning = async () => {
    try {
      setIsScanning(true);
      
      const scannerId = scannerIdRef.current;
      
      // Создаем элемент для сканера если его нет
      let scannerElement = document.getElementById(scannerId);
      if (!scannerElement) {
        scannerElement = document.createElement('div');
        scannerElement.id = scannerId;
        scannerElement.style.display = 'none';
        document.body.appendChild(scannerElement);
      }

      scannerRef.current = new Html5Qrcode(scannerId);
      
      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          const now = Date.now();
          // Предотвращаем повторное сканирование того же кода
          if (now - lastScanTime < 2000) return;
          setLastScanTime(now);

          console.log('📸 Сканирован штрихкод:', decodedText);
          
          const result = await findProduct(decodedText);
          if (result) {
            onProductFound(result);
            toast.success(`Найден: ${result.name || result.barcode}`);
          } else {
            onProductFound({ barcode: decodedText });
          }
        },
        () => {} // Игнорируем ошибки сканирования
      );
    } catch (error) {
      console.error('Ошибка запуска сканера:', error);
      setIsScanning(false);
    }
  };

  const stopScanning = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current = null;
      }
    } catch (error) {
      console.error('Ошибка остановки сканера:', error);
    }
    setIsScanning(false);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isScanning ? 'destructive' : 'outline'}
        size="sm"
        onClick={isScanning ? stopScanning : startScanning}
      >
        {isScanning ? (
          <>
            <X className="h-4 w-4 mr-2" />
            Стоп
          </>
        ) : (
          <>
            <Scan className="h-4 w-4 mr-2" />
            Сканер
          </>
        )}
      </Button>
    </div>
  );
};
