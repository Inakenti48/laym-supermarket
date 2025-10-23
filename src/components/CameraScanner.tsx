import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, CheckCircle, ArrowLeft } from 'lucide-react';

interface CameraScannerProps {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

interface ScanNotification {
  barcode: string;
  timestamp: number;
}

export const CameraScanner = ({ onScan, onClose }: CameraScannerProps) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string>('');
  const [notification, setNotification] = useState<ScanNotification | null>(null);
  const isStoppingRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastScanRef = useRef<string>('');
  const lastScanTimeRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    startScanner();

    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const cleanup = async () => {
    isStoppingRef.current = true;
    await stopScanner();
  };

  const startScanner = async () => {
    try {
      const scanner = new Html5Qrcode('camera-scanner');
      scannerRef.current = scanner;

      const config = {
        fps: 120, // Увеличена скорость сканирования
        qrbox: { width: 200, height: 200 }, // Уменьшен размер для быстрого распознавания
        aspectRatio: 1.0,
        disableFlip: false,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        },
        formatsToSupport: [
          0,  // QR_CODE
          8,  // EAN_13
          9,  // EAN_8
          13, // CODE_128
          14, // CODE_39
          16, // UPC_A
          17, // UPC_E
          19, // CODE_93
        ],
      };

      await scanner.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          if (!isMountedRef.current) return;

          const now = Date.now();
          // Уменьшена задержка между сканированиями до 300мс для быстроты
          if (decodedText === lastScanRef.current && now - lastScanTimeRef.current < 300) {
            return;
          }

          lastScanRef.current = decodedText;
          lastScanTimeRef.current = now;

          setNotification({
            barcode: decodedText,
            timestamp: now
          });

          if (navigator.vibrate) {
            navigator.vibrate(100); // Короче вибрация для быстроты
          }

          const beep = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjKH0fPTgjMGHm7A7+OZSA0PVqzn77BdGAg+ltryxnMpBSl+zPLaizsIGGS57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsI');
          beep.play().catch(() => {});

          onScan(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      console.error('Camera error:', err);
      if (!isMountedRef.current) return;

      if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
        setError('Доступ к камере запрещен. Разрешите доступ в настройках браузера.');
      } else if (err.message?.includes('not found') || err.name === 'NotFoundError') {
        setError('Камера не найдена. Проверьте подключение камеры.');
      } else {
        setError('Не удалось запустить камеру. Попробуйте перезагрузить страницу.');
      }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
  };

  const handleClose = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    await cleanup();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b bg-primary/5">
          <div className="flex items-center gap-3">
            <Camera className="h-6 w-6 text-primary" />
            <h3 className="text-lg font-semibold">Сканирование штрихкода</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative bg-black">
          <div id="camera-scanner" className="w-full aspect-video"></div>

          {notification && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-success text-success-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Отсканировано: {notification.barcode}</span>
            </div>
          )}
        </div>

        {error ? (
          <div className="p-6 text-center">
            <div className="text-destructive mb-4">{error}</div>
            <button
              onClick={handleClose}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              type="button"
            >
              Закрыть
            </button>
          </div>
        ) : (
          <div className="p-6 text-center space-y-4">
            <p className="text-muted-foreground">
              Наведите камеру на штрихкод или QR-код товара
            </p>
            <button
              onClick={handleClose}
              className="px-6 py-3 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors inline-flex items-center gap-2"
              type="button"
            >
              <ArrowLeft className="h-5 w-5" />
              Закрыть камеру
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
