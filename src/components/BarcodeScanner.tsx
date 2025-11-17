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
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем только если фокус на textarea или contenteditable элементах
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'TEXTAREA' || 
          activeElement?.getAttribute('contenteditable') === 'true') {
        return;
      }

      // Enter - завершение сканирования
      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 3) {
          e.preventDefault();
          const scannedBarcode = barcodeBufferRef.current;
          console.log('🔍 Штрихкод отсканирован:', scannedBarcode);
          barcodeBufferRef.current = '';
          onScan(scannedBarcode);
          setBarcode('');
          toast.success(`✅ Отсканирован: ${scannedBarcode}`);
        }
        return;
      }

      // Накапливаем цифры и буквы (штрихкоды обычно содержат только их)
      if (/^[0-9a-zA-Z]$/.test(e.key)) {
        barcodeBufferRef.current += e.key;
        console.log('📝 Буфер:', barcodeBufferRef.current);
        
        // Сброс буфера через 150мс (сканеры вводят очень быстро)
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          if (barcodeBufferRef.current.length > 0) {
            console.log('⏱️ Таймаут - сброс буфера');
          }
          barcodeBufferRef.current = '';
        }, 150);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
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
    <Card className="p-3 md:p-4 space-y-2 md:space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0 flex-1">
          <Scan className="w-4 h-4 md:w-5 md:h-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
          <h3 className="font-semibold text-xs md:text-sm truncate">Сканер</h3>
        </div>
        {scannerConnected && (
          <div className="flex items-center gap-1 text-[10px] md:text-xs text-green-600 dark:text-green-400 flex-shrink-0">
            <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-green-600 dark:bg-green-400 animate-pulse" />
            <span className="hidden xs:inline">Подключен</span>
            <span className="xs:hidden">✓</span>
          </div>
        )}
      </div>

      <div>
        <form onSubmit={handleManualSubmit} className="space-y-1.5 md:space-y-2">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Input
              ref={inputRef}
              type="text"
              placeholder="Штрихкод"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="text-xs md:text-sm h-8 md:h-10"
              autoFocus={autoFocus}
            />
            <Button type="submit" size="sm" disabled={!barcode.trim()} className="h-8 w-8 md:h-10 md:w-10 p-0">
              <Scan className="w-3.5 h-3.5 md:w-4 md:h-4" />
            </Button>
          </div>
          <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-1">
            <span className="hidden md:inline">USB-сканер подключен. Сканируйте товар или введите вручную</span>
            <span className="md:hidden">Сканируйте или введите вручную</span>
          </p>
        </form>
      </div>

    </Card>
  );
};
