import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Scan, Usb, Bluetooth } from 'lucide-react';
import { toast } from 'sonner';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  autoFocus?: boolean;
}

export const BarcodeScanner = ({ onScan, autoFocus = false }: BarcodeScannerProps) => {
  const [barcode, setBarcode] = useState('');
  const [scannerConnected, setScannerConnected] = useState(false);
  const [scannerType, setScannerType] = useState<'keyboard' | 'serial' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const barcodeBufferRef = useRef('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Keyboard scanner listener (USB scanners act as keyboards)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Игнорируем если фокус на input элементе (кроме нашего input)
      if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== inputRef.current) {
        return;
      }

      // Enter - завершение сканирования
      if (e.key === 'Enter' && barcodeBufferRef.current) {
        e.preventDefault();
        const scannedBarcode = barcodeBufferRef.current;
        barcodeBufferRef.current = '';
        
        if (scannedBarcode.length >= 3) {
          onScan(scannedBarcode);
          setBarcode('');
          toast.success('Штрихкод отсканирован');
        }
        return;
      }

      // Накапливаем символы
      if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;
        
        // Сброс буфера через 100мс (сканеры вводят очень быстро)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          barcodeBufferRef.current = '';
        }, 100);
      }
    };

    window.addEventListener('keypress', handleKeyPress);
    return () => {
      window.removeEventListener('keypress', handleKeyPress);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [onScan]);

  const connectSerialScanner = async () => {
    try {
      if (!('serial' in navigator)) {
        toast.error('Web Serial API не поддерживается');
        return;
      }

      // @ts-ignore - Web Serial API
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 9600 });
      
      setScannerConnected(true);
      setScannerType('serial');
      toast.success('Сканер подключен через Serial');

      // Читаем данные
      const reader = port.readable?.getReader();
      if (reader) {
        let buffer = '';
        
        const readLoop = async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              
              const decoder = new TextDecoder();
              const text = decoder.decode(value);
              buffer += text;
              
              // Если найден конец строки
              if (buffer.includes('\n') || buffer.includes('\r')) {
                const scannedBarcode = buffer.trim();
                if (scannedBarcode.length >= 3) {
                  onScan(scannedBarcode);
                  toast.success('Штрихкод отсканирован');
                }
                buffer = '';
              }
            }
          } catch (error) {
            console.error('Ошибка чтения сканера:', error);
          } finally {
            reader.releaseLock();
          }
        };
        
        readLoop();
      }
    } catch (error) {
      console.error('Ошибка подключения сканера:', error);
      toast.error('Не удалось подключить сканер');
    }
  };

  const connectKeyboardScanner = () => {
    setScannerConnected(true);
    setScannerType('keyboard');
    toast.success('Готов к сканированию (USB сканер)');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (barcode.trim()) {
      onScan(barcode.trim());
      setBarcode('');
      toast.success('Штрихкод введен');
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scan className="w-5 h-5" />
          <h3 className="font-semibold text-sm">Сканер штрихкодов</h3>
        </div>
        {scannerConnected && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
            Подключен
          </div>
        )}
      </div>

      {!scannerConnected ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Выберите тип подключения сканера:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={connectKeyboardScanner}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Usb className="w-4 h-4" />
              USB/Клавиатура
            </Button>
            <Button
              onClick={connectSerialScanner}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Bluetooth className="w-4 h-4" />
              Serial Port
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleManualSubmit} className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Отсканируйте или введите штрихкод"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="text-sm"
              autoFocus={autoFocus}
            />
            <Button type="submit" size="sm" disabled={!barcode.trim()}>
              <Scan className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {scannerType === 'keyboard' 
              ? 'Сканируйте товар или введите штрихкод вручную'
              : 'Сканер готов к работе через Serial Port'}
          </p>
        </form>
      )}

      {scannerConnected && (
        <Button
          onClick={() => {
            setScannerConnected(false);
            setScannerType(null);
            toast.info('Сканер отключен');
          }}
          variant="ghost"
          size="sm"
          className="w-full text-xs"
        >
          Отключить сканер
        </Button>
      )}
    </Card>
  );
};
