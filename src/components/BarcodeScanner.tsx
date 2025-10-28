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
  const [scannerConnected, setScannerConnected] = useState(true); // USB по умолчанию
  const [scannerType, setScannerType] = useState<'keyboard' | null>('keyboard'); // USB по умолчанию
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
      // Игнорируем только если фокус на textarea или contenteditable элементах
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'TEXTAREA' || 
          activeElement?.getAttribute('contenteditable') === 'true') {
        return;
      }
      
      // Для обычных input - пропускаем только если вводится текст (не штрихкод)
      // Сканеры вводят очень быстро, поэтому если это не наш input и происходит быстрый ввод - это сканер
      if (activeElement?.tagName === 'INPUT' && activeElement !== inputRef.current) {
        // Разрешаем сканирование, если это быстрый ввод (скорее всего сканер)
        // Сканеры вводят символы менее чем за 50мс между нажатиями
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

      <div>
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
            USB-сканер подключен. Сканируйте товар или введите штрихкод вручную
          </p>
        </form>
      </div>

    </Card>
  );
};
