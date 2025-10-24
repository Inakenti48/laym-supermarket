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
        fps: 60, // Оптимальная скорость для баланса производительности и точности
        qrbox: { width: 250, height: 250 }, // Оптимальный размер для точного распознавания
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
          1,  // AZTEC
          2,  // CODABAR
          3,  // CODE_39
          4,  // CODE_93
          5,  // CODE_128
          6,  // DATA_MATRIX
          7,  // MAXICODE
          10, // ITF
          11, // PDF_417
          12, // RSS_14
          15, // RSS_EXPANDED
        ]
      };

      await scanner.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          if (!isMountedRef.current) return;

          const now = Date.now();
          // Оптимальная задержка 200мс для предотвращения дублей
          if (decodedText === lastScanRef.current && now - lastScanTimeRef.current < 200) {
            return;
          }

          lastScanRef.current = decodedText;
          lastScanTimeRef.current = now;

          setNotification({
            barcode: decodedText,
            timestamp: now
          });

          if (navigator.vibrate) {
            navigator.vibrate([50]); // Короткая вибрация для подтверждения
          }

          const beep = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjKH0fPTgjMGHm7A7+OZSA0PVqzn77BdGAg+ltryxnMpBSl+zPLaizsIGGS57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsIGWW57OihUQ0NTKXh8bllHAU2jdXzx3YsBS1+zPDajTsI');
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
    <div className="w-full">
      <div className="bg-card rounded-lg shadow-lg overflow-hidden">
        <div className="flex items-center justify-between p-3 border-b bg-primary/5">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <h3 className="text-base font-semibold">Камера распознавания товаров</h3>
          </div>
          <div className="flex items-center gap-1 text-xs text-green-600">
            <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
            Активна
          </div>
        </div>

        <div className="relative bg-black rounded-b-lg overflow-hidden">
          <div id="camera-scanner" className="w-full aspect-video"></div>

          {notification && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-success text-success-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Отсканировано: {notification.barcode}</span>
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
              📷 Наведите камеру на штрихкод товара для автоматического добавления в чек
            </p>
            <p className="text-xs text-muted-foreground">
              💡 Держите камеру на расстоянии 10-20 см от штрихкода. Поддерживаются: EAN-13, EAN-8, CODE-128, UPC
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
