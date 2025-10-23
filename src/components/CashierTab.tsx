import { useState } from 'react';
import { ShoppingCart, Plus, Trash2, Calculator, Printer, Search, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { getCurrentUser, addLog } from '@/lib/auth';
import { toast } from 'sonner';
import { CameraScanner } from './CameraScanner';
import { findProductByBarcode } from '@/lib/storage';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCalculator, setShowCalculator] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [scannerActive, setScannerActive] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const user = getCurrentUser();

  const handleScan = (barcode: string) => {
    const product = findProductByBarcode(barcode);
    if (product) {
      addToCart(product.name, product.retailPrice);
      toast.success(`Добавлен: ${product.name}`);
    } else {
      toast.error('Товар не найден');
    }
    setShowScanner(false);
  };

  const addToCart = (name: string, price: number) => {
    const existingItem = cart.find(item => item.name === name);
    if (existingItem) {
      setCart(cart.map(item => 
        item.name === name 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, { id: Date.now().toString(), name, price, quantity: 1 }]);
    }
    addLog(`Добавлен товар: ${name} (${price}₽)`);
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

  const completeSale = () => {
    if (cart.length === 0) {
      toast.error('Корзина пуста');
      return;
    }

    const change = showCalculator ? calculateChange() : 0;
    if (showCalculator && (change === undefined || change < 0)) {
      return;
    }

    // Generate receipt
    const receipt = {
      cashier: user?.cashierName || 'Кассир',
      date: new Date().toLocaleString('ru-RU'),
      items: cart,
      total,
      received: showCalculator ? parseFloat(receivedAmount) : total,
      change: showCalculator ? change : 0
    };

    addLog(`Продажа завершена: ${total}₽ (${cart.length} товаров)`);
    
    // Print receipt (in real app would connect to printer)
    printReceipt(receipt);
    
    // Clear cart
    setCart([]);
    setReceivedAmount('');
    setShowCalculator(false);
    toast.success('Продажа завершена!');
  };

  const printReceipt = (receipt: any) => {
    setLastReceipt(receipt);
    setShowReceipt(true);
  };

  return (
    <div className="space-y-4">
      {showScanner && (
        <CameraScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
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
            <div className="flex items-center justify-between mb-3 p-3 bg-primary/5 rounded-lg">
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
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Поиск товара по названию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 text-sm sm:text-base"
              />
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
                  <div key={item.id} className="flex items-center gap-3 py-3 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm sm:text-base truncate">{item.name}</div>
                      <div className="text-xs sm:text-sm text-primary font-medium">{item.price.toFixed(2)} ₽</div>
                      <div className="text-xs text-muted-foreground">Остаток: 48 шт</div>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      >
                        <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                        className="w-12 sm:w-14 h-8 sm:h-10 text-center text-sm sm:text-base"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg ml-1 sm:ml-2"
                        onClick={() => removeFromCart(item.id)}
                      >
                        <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                    <div className="font-bold text-base sm:text-lg w-16 sm:w-20 text-right">
                      {(item.price * item.quantity).toFixed(2)} ₽
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Calculator and Total */}
          <Card className="p-3 sm:p-4">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <Button
                variant={showCalculator ? "default" : "outline"}
                onClick={() => setShowCalculator(!showCalculator)}
                className="text-xs sm:text-sm"
              >
                <Calculator className="h-4 w-4 mr-2" />
                Калькулятор сдачи
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
