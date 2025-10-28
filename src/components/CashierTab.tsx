import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, Trash2, Calculator, Printer, Search, Minus, Usb, XCircle, X, Camera, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getCurrentUser, addLog } from '@/lib/auth';
import { toast } from 'sonner';
import { BarcodeScanner } from './BarcodeScanner';
import { AIProductRecognition } from './AIProductRecognition';
import { CartItem } from './CashierCartItem';
import {
  findProductByBarcode, 
  isProductExpired, 
  updateProductQuantity,
  createCancellationRequest,
  getAllProducts
} from '@/lib/storage';
import { 
  connectPrinter, 
  isPrinterConnected, 
  printReceipt as printToDevice,
  printReceiptBrowser,
  type ReceiptData 
} from '@/lib/printer';
import { supabase } from '@/integrations/supabase/client';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  barcode?: string;
}

const QUICK_ITEMS = [
  { name: 'Хлеб', price: 50 },
  { name: 'Молоко', price: 80 },
  { name: 'Яйца', price: 120 },
  { name: 'Сахар', price: 90 },
  { name: 'Соль', price: 30 },
  { name: 'Масло', price: 200 },
  { name: 'Мука', price: 70 },
  { name: 'Чай', price: 150 },
  { name: 'Кофе', price: 300 },
  { name: 'Вода', price: 40 },
];

export const CashierTab = () => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('cashier_cart_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });
  const [showCalculator, setShowCalculator] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [scannerActive, setScannerActive] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [pendingReceiptData, setPendingReceiptData] = useState<ReceiptData | null>(null);
  const [showAIScanner, setShowAIScanner] = useState(false);
  const [aiScanMode, setAiScanMode] = useState<'product' | 'barcode'>('product');
  const searchRef = useRef<HTMLDivElement>(null);
  const user = getCurrentUser();

  // Сохраняем корзину при изменении
  useEffect(() => {
    localStorage.setItem('cashier_cart_data', JSON.stringify(cart));
  }, [cart]);

  // Закрытие результатов поиска при клике вне
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Поиск товаров по названию
  const [searchResults, setSearchResults] = React.useState<any[]>([]);

  React.useEffect(() => {
    const updateSearchResults = async () => {
      if (!searchQuery.trim() || searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }
      const query = searchQuery.toLowerCase();
      const allProducts = await getAllProducts();
      setSearchResults(
        allProducts
          .filter(p => p.name.toLowerCase().includes(query))
          .slice(0, 10)
      );
    };
    updateSearchResults();
  }, [searchQuery]);

  const handleConnectPrinter = async () => {
    const connected = await connectPrinter();
    if (connected) {
      setPrinterConnected(true);
      toast.success('Принтер чеков подключен');
    } else {
      toast.error('Не удалось подключить принтер');
    }
  };

  const handleScan = async (data: { barcode: string; name?: string; category?: string; photoUrl?: string; capturedImage?: string } | string) => {
    // Поддержка обратной совместимости: если передана строка, преобразуем в объект
    const barcodeData = typeof data === 'string' ? { barcode: data } : data;
    
    const sanitizedBarcode = barcodeData.barcode?.trim().replace(/[<>'"]/g, '') || '';
    const productName = barcodeData.name?.trim() || '';
    
    console.log('🎯 handleScan получил данные:', { sanitizedBarcode, productName, barcodeData });
    
    let product = null;
    let isTemporary = false;
    const isFromPhotoScan = !!productName || !!barcodeData.photoUrl || !!barcodeData.capturedImage;

    // Если есть штрихкод - ищем по штрихкоду только в основной базе
    if (sanitizedBarcode && sanitizedBarcode.length <= 50) {
      product = await findProductByBarcode(sanitizedBarcode);
      console.log('🔍 Поиск по штрихкоду:', sanitizedBarcode, '-> найден:', !!product);
    }
    
    // Если штрихкода нет или товар не найден по штрихкоду, ищем по названию
    if (!product && productName) {
      const allProducts = await getAllProducts();
      product = allProducts.find(p => 
        p.name.toLowerCase().includes(productName.toLowerCase()) ||
        productName.toLowerCase().includes(p.name.toLowerCase())
      );
      
      console.log('🔍 Поиск по названию:', productName, '-> найден:', !!product);
      
      if (product) {
        toast.info(`Товар найден по названию: ${product.name}`);
      }
    }
    
    console.log('📦 Итоговый результат поиска товара:', product ? product.name : 'НЕ НАЙДЕН');

    if (product) {
      // Проверка просрочки
      if (isProductExpired(product)) {
        toast.error(`❌ ПРОСРОЧКА! Товар "${product.name}" истёк ${new Date(product.expiryDate!).toLocaleDateString('ru-RU')}. Продажа запрещена!`, {
          duration: 5000,
        });
        return;
      }
      
      // Проверка наличия
      if (product.quantity <= 0) {
        toast.error(`ТОВАР ЗАКОНЧИЛСЯ ПОЭТОМУ НЕ ПРОБИВАЮ`);
        return;
      }
      
      // Звуковой сигнал успешного сканирования - типичный звук кассового сканера
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Настройка звука сканера: короткий высокий beep
        oscillator.frequency.value = 2800; // Высокая частота
        oscillator.type = 'square';
        
        gainNode.gain.setValueAtTime(0.6, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
      } catch (e) {
        console.log('Не удалось воспроизвести звук:', e);
      }
      
      addToCart(product.name, product.retailPrice, product.barcode);
      toast.success(`Добавлен: ${product.name}${isTemporary ? ' (из временной базы)' : ''}`);
      setShowAIScanner(false);
    } else if (isFromPhotoScan) {
      // Если это был фото-скан и товар не найден
      toast.error('Товар не распознан. Попробуйте еще раз или добавьте вручную');
      setShowAIScanner(false);
    }
    setShowScanner(false);
  };

  const addToCart = (name: string, price: number, barcode?: string) => {
    // Безопасность: санитизация входных данных
    const sanitizedName = name.trim().substring(0, 100).replace(/[<>]/g, '');
    if (!sanitizedName || price <= 0) {
      toast.error('Неверные данные товара');
      return;
    }

    const existingItem = cart.find(item => item.name === sanitizedName);
    if (existingItem) {
      setCart(cart.map(item => 
        item.name === sanitizedName 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { id: Date.now().toString(), name: sanitizedName, price, quantity: 1, barcode }]);
    }
    addLog(`Добавлен товар: ${sanitizedName} (${price}₽)`);
  };

  const removeFromCart = (id: string) => {
    const item = cart.find(i => i.id === id);
    if (item) {
      addLog(`Удален товар: ${item.name}`);
    }
    setCart(cart.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setCart(cart.map(item => 
      item.id === id ? { ...item, quantity } : item
    ));
  };

  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const calculateChange = () => {
    const received = parseFloat(receivedAmount);
    if (isNaN(received) || received < total) {
      toast.error('Недостаточная сумма');
      return;
    }
    return received - total;
  };

  const handleCancelItems = () => {
    if (cart.length === 0) {
      toast.error('Корзина пуста');
      return;
    }
    
    const itemsToCancel = cart.map(item => ({
      barcode: item.barcode || '',
      name: item.name,
      quantity: item.quantity,
      price: item.price
    }));
    
    createCancellationRequest(itemsToCancel, user?.cashierName || 'Кассир');
    toast.success('Запрос на отмену товаров отправлен администратору');
    setCart([]);
  };

  const completeSale = async () => {
    if (cart.length === 0) {
      toast.error('Корзина пуста');
      return;
    }

    const change = showCalculator ? calculateChange() : 0;
    if (showCalculator && (change === undefined || change < 0)) {
      return;
    }

    // Уменьшаем количество товаров в базе
    cart.forEach(item => {
      if (item.barcode) {
        updateProductQuantity(item.barcode, -item.quantity);
      }
    });

    const now = new Date();
    const receiptData: ReceiptData = {
      receiptNumber: now.getTime().toString().slice(-7),
      date: now.toLocaleDateString('ru-RU'),
      time: now.toLocaleTimeString('ru-RU'),
      cashier: user?.cashierName || 'Кассир',
      items: cart.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      })),
      total,
      received: showCalculator ? parseFloat(receivedAmount) : total,
      change: showCalculator ? change : 0
    };

    addLog(`Продажа завершена: ${total}₽ (${cart.length} товаров)`);
    
    // Показываем диалог выбора печати
    setPendingReceiptData(receiptData);
    setShowPrintDialog(true);
  };

  const handlePrintReceipt = async () => {
    if (!pendingReceiptData) return;

    // Печать на физическом принтере если подключен
    if (isPrinterConnected()) {
      try {
        await printToDevice(pendingReceiptData);
        toast.success('Чек отправлен на принтер');
      } catch (error) {
        toast.error('Ошибка печати на принтере');
      }
    } else {
      // Браузерная печать
      printReceiptBrowser(pendingReceiptData);
    }
    
    finalizeSale();
  };

  const handleSkipPrint = () => {
    toast.success('Продажа завершена без печати чека');
    finalizeSale();
  };

  const finalizeSale = () => {
    setCart([]);
    setReceivedAmount('');
    setShowCalculator(false);
    setShowPrintDialog(false);
    setPendingReceiptData(null);
    // Очищаем сохраненную корзину
    localStorage.removeItem('cashier_cart_data');
  };

  return (
    <div className="space-y-4">
      {/* Print Confirmation Dialog */}
      <AlertDialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Печать чека</AlertDialogTitle>
            <AlertDialogDescription>
              Хотите распечатать чек для этой продажи?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkipPrint}>
              <XCircle className="w-4 h-4 mr-2" />
              Без печати
            </AlertDialogCancel>
            <AlertDialogAction onClick={handlePrintReceipt}>
              <Printer className="w-4 h-4 mr-2" />
              Печатать чек
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden background AI scanner - always working */}
      <AIProductRecognition 
        onProductFound={handleScan}
        mode="product"
        hidden={true}
      />

      {/* Scanner */}
      <BarcodeScanner onScan={handleScan} autoFocus={scannerActive} />

      {/* Printer Connection */}
      {!printerConnected && (
        <Card className="p-3 bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-800">Принтер чеков не подключен</span>
            </div>
            <Button onClick={handleConnectPrinter} size="sm" variant="outline">
              <Usb className="w-4 h-4 mr-1" />
              Подключить
            </Button>
          </div>
        </Card>
      )}

      {printerConnected && (
        <Card className="p-3 bg-green-50 border-green-200">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
            <Printer className="w-4 h-4 text-green-600" />
            <span className="text-sm text-green-800">Принтер чеков подключен</span>
          </div>
        </Card>
      )}

      {/* Receipt Dialog */}
      {showReceipt && lastReceipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-primary">Кассовый чек</h2>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const printWindow = window.open('', '_blank');
                      if (!printWindow) return;
                      const now = new Date();
                      const receiptNumber = now.getTime().toString().slice(-7);
                      const date = now.toLocaleDateString('ru-RU');
                      const time = now.toLocaleTimeString('ru-RU');
                      
                      const html = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                          <title>Чек</title>
                          <meta charset="utf-8">
                          <style>
                            body { font-family: 'Courier New', monospace; padding: 20px; max-width: 350px; margin: 0 auto; }
                            .header { text-align: center; margin-bottom: 20px; }
                            .header h1 { font-size: 24px; margin: 5px 0; font-weight: bold; }
                            .header p { font-size: 12px; margin: 3px 0; color: #666; }
                            .divider { border-top: 2px dashed #000; margin: 15px 0; }
                            .info-line { display: flex; justify-content: space-between; margin: 5px 0; font-size: 14px; }
                            .item { margin: 10px 0; font-size: 14px; }
                            .item-name { font-weight: bold; }
                            .item-calc { display: flex; justify-content: space-between; color: #666; }
                            .total-section { border-top: 2px solid #000; margin-top: 15px; padding-top: 10px; }
                            .total-line { display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; margin: 5px 0; }
                            .footer { text-align: center; margin-top: 20px; padding-top: 15px; border-top: 1px dashed #000; }
                            .footer p { margin: 5px 0; font-size: 14px; }
                            .store-name { font-weight: bold; font-size: 16px; }
                          </style>
                        </head>
                        <body>
                          <div class="header">
                            <h1>МАГАЗИН</h1>
                            <p>Система управления складом</p>
                          </div>
                          <div class="divider"></div>
                          <div class="info-line"><span>Чек №:</span><span>${receiptNumber}</span></div>
                          <div class="info-line"><span>Дата:</span><span>${date}</span></div>
                          <div class="info-line"><span>Время:</span><span>${time}</span></div>
                          <div class="info-line"><span>Кассир:</span><span>${lastReceipt.cashier}</span></div>
                          <div class="divider"></div>
                          ${lastReceipt.items.map((item: CartItem) => `
                            <div class="item">
                              <div class="item-name">${item.name}</div>
                              <div class="item-calc">
                                <span>${item.quantity} × ${item.price.toFixed(2)} ₽</span>
                                <span>${(item.price * item.quantity).toFixed(2)} ₽</span>
                              </div>
                            </div>
                          `).join('')}
                          <div class="total-section">
                            <div class="total-line"><span>ИТОГО:</span><span>${lastReceipt.total.toFixed(2)} ₽</span></div>
                            ${lastReceipt.change > 0 ? `
                              <div class="info-line"><span>Получено:</span><span>${lastReceipt.received.toFixed(2)} ₽</span></div>
                              <div class="info-line"><span>Сдача:</span><span>${lastReceipt.change.toFixed(2)} ₽</span></div>
                            ` : ''}
                          </div>
                          <div class="footer">
                            <p>Спасибо за покупку!</p>
                            <p class="store-name">супермаркет лайм</p>
                          </div>
                        </body>
                        </html>
                      `;
                      printWindow.document.write(html);
                      printWindow.document.close();
                      setTimeout(() => printWindow.print(), 250);
                    }}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Печать
                  </Button>
                  <Button variant="ghost" onClick={() => setShowReceipt(false)}>
                    ✕
                  </Button>
                </div>
              </div>

              <div className="space-y-4 text-sm">
                <div className="text-center border-b pb-4">
                  <h3 className="text-xl font-bold">МАГАЗИН</h3>
                  <p className="text-muted-foreground text-xs">Система управления складом</p>
                </div>

                <div className="space-y-1 border-b pb-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Чек №:</span>
                    <span>{new Date().getTime().toString().slice(-7)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Дата:</span>
                    <span>{new Date().toLocaleDateString('ru-RU')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Время:</span>
                    <span>{new Date().toLocaleTimeString('ru-RU')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Кассир:</span>
                    <span>{lastReceipt.cashier}</span>
                  </div>
                </div>

                <div className="space-y-3 border-b pb-3">
                  {lastReceipt.items.map((item: CartItem) => (
                    <div key={item.id}>
                      <div className="font-medium">{item.name}</div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{item.quantity} × {item.price.toFixed(2)} ₽</span>
                        <span>{(item.price * item.quantity).toFixed(2)} ₽</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-lg font-bold">
                    <span>ИТОГО:</span>
                    <span className="text-primary">{lastReceipt.total.toFixed(2)} ₽</span>
                  </div>
                  {lastReceipt.change > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Получено:</span>
                        <span>{lastReceipt.received.toFixed(2)} ₽</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Сдача:</span>
                        <span>{lastReceipt.change.toFixed(2)} ₽</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="text-center pt-4 border-t space-y-1">
                  <p className="text-muted-foreground">Спасибо за покупку!</p>
                  <p className="font-bold">супермаркет лайм</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Quick items */}
        <div className="lg:col-span-1">
          <Card className="p-4">
            <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
              <Plus className="h-5 w-5" />
              Быстрые товары
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ITEMS.map((item, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  className="h-16 sm:h-20 flex flex-col items-center justify-center gap-1 text-xs sm:text-sm"
                  onClick={() => addToCart(item.name, item.price)}
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground">{item.price}₽</span>
                </Button>
              ))}
            </div>
          </Card>
        </div>

        {/* Cart */}
        <div className="lg:col-span-2 space-y-4">
          {/* Scanner and Search */}
          <Card className="p-3 sm:p-4">
            <div className="space-y-3 mb-3">
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                <div className="flex items-center gap-2 sm:gap-3">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  <span className="font-medium text-sm sm:text-base">Сканер активен</span>
                </div>
                <Switch
                  checked={scannerActive}
                  onCheckedChange={(checked) => {
                    setScannerActive(checked);
                    if (checked) setShowScanner(true);
                  }}
                />
              </div>
              
              {/* AI Scanning Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => {
                    setAiScanMode('product');
                    setShowAIScanner(true);
                  }}
                  variant="outline"
                  className="w-full"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  AI Лицевая
                </Button>
                <Button
                  onClick={() => {
                    setAiScanMode('barcode');
                    setShowAIScanner(true);
                  }}
                  variant="outline"
                  className="w-full"
                >
                  <Scan className="h-4 w-4 mr-2" />
                  AI Штрихкод
                </Button>
              </div>
              
            </div>
            <div className="relative" ref={searchRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Поиск товара по названию..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearchResults(true);
                }}
                onFocus={() => setShowSearchResults(true)}
                className="pl-10 text-sm sm:text-base"
              />
              
              {/* Результаты поиска */}
              {showSearchResults && searchResults.length > 0 && (
                <Card className="absolute top-full left-0 right-0 mt-2 z-50 max-h-80 overflow-y-auto shadow-lg">
                  <div className="p-2">
                    {searchResults.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => {
                          handleScan(product.barcode);
                          setSearchQuery('');
                          setShowSearchResults(false);
                        }}
                        className="w-full text-left p-3 hover:bg-primary/5 rounded-lg transition-colors"
                      >
                        <div className="font-medium text-sm">{product.name}</div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mt-1">
                          <span>{product.category}</span>
                          <span className="font-semibold text-primary">{product.retailPrice} ₽</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Остаток: {product.quantity} {product.unit}
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </Card>

          {/* Cart Items */}
          <Card className="p-3 sm:p-4">
            <h3 className="font-semibold mb-3 sm:mb-4 text-base sm:text-lg">Корзина</h3>

            {cart.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Корзина пуста
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <CartItem 
                    key={item.id} 
                    item={item}
                    onUpdateQuantity={(id, quantity) => updateQuantity(id, quantity)}
                    onRemove={(id) => removeFromCart(id)}
                  />
                ))}
              </div>
            )}
          </Card>

          {/* Calculator and Total */}
          <Card className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
              <Button
                variant={showCalculator ? "default" : "outline"}
                onClick={() => setShowCalculator(!showCalculator)}
                className="text-xs sm:text-sm"
              >
                <Calculator className="h-4 w-4 mr-2" />
                Калькулятор сдачи
              </Button>
              <Button
                variant="outline"
                onClick={handleCancelItems}
                className="text-xs sm:text-sm"
                disabled={cart.length === 0}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Отмена товара
              </Button>
            </div>

            {showCalculator && (
              <div className="mb-4 p-3 sm:p-4 bg-primary/5 rounded-lg">
                <div className="space-y-2 sm:space-y-3">
                  <div className="flex items-center justify-between text-sm sm:text-base">
                    <span>Сумма к оплате:</span>
                    <span className="font-semibold">{total.toFixed(2)}₽</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm sm:text-base whitespace-nowrap">Получено:</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={receivedAmount}
                      onChange={(e) => setReceivedAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 text-sm sm:text-base"
                    />
                  </div>
                  {receivedAmount && parseFloat(receivedAmount) >= total && (
                    <div className="flex items-center justify-between text-success pt-2 border-t">
                      <span className="text-sm sm:text-base">Сдача:</span>
                      <span className="font-bold text-lg sm:text-xl">{calculateChange()?.toFixed(2)}₽</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-4 py-3 border-t border-b">
              <span className="text-xl sm:text-2xl font-bold">Итого:</span>
              <span className="text-2xl sm:text-3xl font-bold text-primary">{total.toFixed(2)} ₽</span>
            </div>

            <Button
              className="w-full h-12 sm:h-14 text-base sm:text-lg"
              onClick={completeSale}
              disabled={cart.length === 0}
            >
              <Printer className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              Завершить продажу
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};
