import { useState } from 'react';
import { ShoppingCart, Plus, Trash2, Calculator, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { getCurrentUser, addLog } from '@/lib/auth';
import { toast } from 'sonner';

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
  const user = getCurrentUser();

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
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Чек</title>
        <style>
          body { font-family: monospace; padding: 20px; max-width: 300px; }
          h2 { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 10px; }
          .line { margin: 5px 0; display: flex; justify-content: space-between; }
          .total { border-top: 2px solid #000; margin-top: 10px; padding-top: 10px; font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; border-top: 1px dashed #000; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h2>ЧЕК</h2>
        <div class="line"><span>Кассир:</span><span>${receipt.cashier}</span></div>
        <div class="line"><span>Дата:</span><span>${receipt.date}</span></div>
        <hr style="border: 1px dashed #000;">
        ${receipt.items.map((item: CartItem) => `
          <div class="line">
            <span>${item.name} x${item.quantity}</span>
            <span>${item.price * item.quantity}₽</span>
          </div>
        `).join('')}
        <div class="total">
          <div class="line"><span>ИТОГО:</span><span>${receipt.total}₽</span></div>
          ${receipt.change > 0 ? `
            <div class="line"><span>Получено:</span><span>${receipt.received}₽</span></div>
            <div class="line"><span>Сдача:</span><span>${receipt.change}₽</span></div>
          ` : ''}
        </div>
        <div class="footer">
          <p>Спасибо за покупку!</p>
          <p>Система Учета Товаров</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Quick items */}
      <div className="lg:col-span-1">
        <Card className="p-4">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Быстрые товары
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {QUICK_ITEMS.map((item, idx) => (
              <Button
                key={idx}
                variant="outline"
                className="h-20 flex flex-col items-center justify-center gap-1"
                onClick={() => addToCart(item.name, item.price)}
              >
                <span className="text-sm font-medium">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.price}₽</span>
              </Button>
            ))}
          </div>
        </Card>
      </div>

      {/* Cart */}
      <div className="lg:col-span-2 space-y-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Корзина ({cart.length})
            </h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCalculator(!showCalculator)}
              >
                <Calculator className="h-4 w-4 mr-2" />
                Калькулятор сдачи
              </Button>
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Корзина пуста
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-sm text-muted-foreground">{item.price}₽</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                      className="w-16 text-center"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </Button>
                  </div>
                  <div className="font-semibold w-20 text-right">
                    {item.price * item.quantity}₽
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFromCart(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Calculator and Total */}
        <Card className="p-4">
          {showCalculator && (
            <div className="mb-4 p-4 bg-primary/5 rounded-lg">
              <h4 className="font-semibold mb-3">Калькулятор сдачи</h4>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm w-32">Сумма к оплате:</span>
                  <span className="font-semibold">{total}₽</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm w-32">Получено:</span>
                  <Input
                    type="number"
                    value={receivedAmount}
                    onChange={(e) => setReceivedAmount(e.target.value)}
                    placeholder="Введите сумму"
                    className="flex-1"
                  />
                </div>
                {receivedAmount && parseFloat(receivedAmount) >= total && (
                  <div className="flex items-center gap-2 text-success">
                    <span className="text-sm w-32">Сдача:</span>
                    <span className="font-bold text-lg">{calculateChange()}₽</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <span className="text-2xl font-bold">Итого:</span>
            <span className="text-3xl font-bold text-primary">{total}₽</span>
          </div>

          <Button
            className="w-full h-14 text-lg"
            onClick={completeSale}
            disabled={cart.length === 0}
          >
            <Printer className="h-5 w-5 mr-2" />
            Завершить продажу
          </Button>
        </Card>
      </div>
    </div>
  );
};
