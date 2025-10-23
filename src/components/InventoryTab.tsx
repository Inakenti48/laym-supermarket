import { useState } from 'react';
import { Scan, Plus, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CameraScanner } from './CameraScanner';
import { addLog } from '@/lib/auth';
import { toast } from 'sonner';

interface Product {
  id: string;
  barcode: string;
  name: string;
  price: number;
  quantity: number;
  paymentType: 'full' | 'partial' | 'debt';
  paidAmount: number;
  debtAmount: number;
}

export const InventoryTab = () => {
  const [showScanner, setShowScanner] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [currentProduct, setCurrentProduct] = useState({
    barcode: '',
    name: '',
    price: '',
    quantity: '',
    paymentType: 'full' as 'full' | 'partial' | 'debt',
    paidAmount: '',
  });

  const handleScan = (barcode: string) => {
    setCurrentProduct({ ...currentProduct, barcode });
    setShowScanner(false);
    toast.success(`Штрихкод отсканирован: ${barcode}`);
    addLog(`Отсканирован штрихкод: ${barcode}`);
  };

  const calculateDebt = () => {
    const price = parseFloat(currentProduct.price) || 0;
    const quantity = parseFloat(currentProduct.quantity) || 0;
    const total = price * quantity;
    const paid = parseFloat(currentProduct.paidAmount) || 0;
    return Math.max(0, total - paid);
  };

  const addProduct = () => {
    if (!currentProduct.barcode || !currentProduct.name || !currentProduct.price || !currentProduct.quantity) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    const price = parseFloat(currentProduct.price);
    const quantity = parseFloat(currentProduct.quantity);
    const total = price * quantity;
    const paidAmount = currentProduct.paymentType === 'full' 
      ? total 
      : (parseFloat(currentProduct.paidAmount) || 0);
    const debtAmount = total - paidAmount;

    if (currentProduct.paymentType === 'partial' && paidAmount <= 0) {
      toast.error('Укажите сумму частичной оплаты');
      return;
    }

    if (currentProduct.paymentType === 'partial' && paidAmount >= total) {
      toast.error('Частичная оплата не может быть больше или равна полной сумме');
      return;
    }

    const newProduct: Product = {
      id: Date.now().toString(),
      barcode: currentProduct.barcode,
      name: currentProduct.name,
      price,
      quantity,
      paymentType: currentProduct.paymentType,
      paidAmount,
      debtAmount: Math.max(0, debtAmount),
    };

    setProducts([...products, newProduct]);
    
    const paymentStatus = 
      currentProduct.paymentType === 'full' ? 'Полная оплата' :
      currentProduct.paymentType === 'partial' ? `Частичная оплата (${paidAmount}₽ из ${total}₽)` :
      `Долг (${debtAmount}₽)`;
    
    addLog(`Добавлен товар: ${newProduct.name} (${quantity} шт.) - ${paymentStatus}`);
    toast.success('Товар добавлен');

    // Reset form
    setCurrentProduct({
      barcode: '',
      name: '',
      price: '',
      quantity: '',
      paymentType: 'full',
      paidAmount: '',
    });
  };

  return (
    <div>
      {showScanner && (
        <CameraScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Add Product Form */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Добавить товар
          </h3>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Штрихкод</label>
              <div className="flex gap-2">
                <Input
                  value={currentProduct.barcode}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, barcode: e.target.value })}
                  placeholder="Введите или отсканируйте"
                />
                <Button
                  variant="outline"
                  onClick={() => setShowScanner(true)}
                >
                  <Scan className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Название товара</label>
              <Input
                value={currentProduct.name}
                onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                placeholder="Введите название"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Цена (₽)</label>
                <Input
                  type="number"
                  value={currentProduct.price}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, price: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Количество</label>
                <Input
                  type="number"
                  value={currentProduct.quantity}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Тип оплаты</label>
              <Select
                value={currentProduct.paymentType}
                onValueChange={(value: 'full' | 'partial' | 'debt') => 
                  setCurrentProduct({ ...currentProduct, paymentType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Полная оплата</SelectItem>
                  <SelectItem value="partial">Частичная оплата</SelectItem>
                  <SelectItem value="debt">Долг</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {currentProduct.paymentType === 'partial' && (
              <div>
                <label className="text-sm font-medium mb-2 block">Оплачено (₽)</label>
                <Input
                  type="number"
                  value={currentProduct.paidAmount}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, paidAmount: e.target.value })}
                  placeholder="0"
                />
                {currentProduct.price && currentProduct.quantity && currentProduct.paidAmount && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Остаток долга: {calculateDebt()}₽
                  </p>
                )}
              </div>
            )}

            {currentProduct.paymentType === 'debt' && currentProduct.price && currentProduct.quantity && (
              <div className="p-3 bg-warning/10 border border-warning rounded-lg">
                <p className="text-sm font-medium text-warning">
                  Сумма долга: {parseFloat(currentProduct.price) * parseFloat(currentProduct.quantity)}₽
                </p>
              </div>
            )}

            <Button onClick={addProduct} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Добавить товар
            </Button>
          </div>
        </Card>

        {/* Products List */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="h-5 w-5" />
            Список товаров ({products.length})
          </h3>

          {products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Товары не добавлены
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {products.map((product) => (
                <div key={product.id} className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-medium">{product.name}</div>
                      <div className="text-sm text-muted-foreground">
                        Штрихкод: {product.barcode}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{product.price * product.quantity}₽</div>
                      <div className="text-sm text-muted-foreground">
                        {product.quantity} шт. × {product.price}₽
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {product.paymentType === 'full' && (
                      <span className="px-2 py-1 bg-success/10 text-success text-xs rounded">
                        Оплачено
                      </span>
                    )}
                    {product.paymentType === 'partial' && (
                      <>
                        <span className="px-2 py-1 bg-warning/10 text-warning text-xs rounded">
                          Частично: {product.paidAmount}₽
                        </span>
                        <span className="px-2 py-1 bg-destructive/10 text-destructive text-xs rounded">
                          Долг: {product.debtAmount}₽
                        </span>
                      </>
                    )}
                    {product.paymentType === 'debt' && (
                      <span className="px-2 py-1 bg-destructive/10 text-destructive text-xs rounded">
                        Долг: {product.debtAmount}₽
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
