import { useState } from 'react';
import { Scan, Plus, Package, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CameraScanner } from './CameraScanner';
import { addLog, getCurrentUser } from '@/lib/auth';
import { toast } from 'sonner';
import { findProductByBarcode, saveProduct, StoredProduct } from '@/lib/storage';
import { Badge } from '@/components/ui/badge';

interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  purchasePrice: number;
  retailPrice: number;
  quantity: number;
  unit: 'шт' | 'кг';
  expiryDate?: string;
  photos: string[];
  paymentType: 'full' | 'partial' | 'debt';
  paidAmount: number;
  debtAmount: number;
}

export const InventoryTab = () => {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  
  const [showScanner, setShowScanner] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [suggestedProduct, setSuggestedProduct] = useState<StoredProduct | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  
  const [currentProduct, setCurrentProduct] = useState({
    barcode: '',
    name: '',
    category: '',
    purchasePrice: '',
    retailPrice: '',
    quantity: '',
    unit: 'шт' as 'шт' | 'кг',
    expiryDate: '',
    paymentType: 'full' as 'full' | 'partial' | 'debt',
    paidAmount: '',
  });

  const handleScan = (barcode: string) => {
    const existing = findProductByBarcode(barcode);
    
    if (existing) {
      setSuggestedProduct(existing);
      setShowSuggestion(true);
      setCurrentProduct({ 
        ...currentProduct, 
        barcode,
        name: existing.name,
        category: existing.category,
        purchasePrice: existing.purchasePrice.toString(),
        retailPrice: existing.retailPrice.toString(),
        unit: existing.unit,
      });
      setPhotos(existing.photos);
      toast.info('Товар найден в базе данных');
    } else {
      setCurrentProduct({ ...currentProduct, barcode });
      toast.success(`Штрихкод отсканирован: ${barcode}`);
    }
    
    setShowScanner(false);
    addLog(`Отсканирован штрихкод: ${barcode}`);
  };

  const acceptSuggestion = () => {
    setShowSuggestion(false);
    toast.success('Данные из базы приняты');
  };

  const rejectSuggestion = () => {
    setShowSuggestion(false);
    setSuggestedProduct(null);
    setCurrentProduct({
      ...currentProduct,
      name: '',
      category: '',
      purchasePrice: '',
      retailPrice: '',
      quantity: '',
      unit: 'шт',
      expiryDate: '',
      paidAmount: '',
    });
    setPhotos([]);
    toast.info('Введите новые данные');
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const maxPhotos = 3;
    if (photos.length >= maxPhotos) {
      toast.error(`Можно загрузить максимум ${maxPhotos} фото`);
      return;
    }

    Array.from(files).slice(0, maxPhotos - photos.length).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const calculateDebt = () => {
    const price = parseFloat(currentProduct.purchasePrice) || 0;
    const quantity = parseFloat(currentProduct.quantity) || 0;
    const total = price * quantity;
    const paid = parseFloat(currentProduct.paidAmount) || 0;
    return Math.max(0, total - paid);
  };

  const addProduct = () => {
    if (!currentProduct.barcode || !currentProduct.name || !currentProduct.category || 
        !currentProduct.purchasePrice || !currentProduct.quantity) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    if (isAdmin && !currentProduct.retailPrice) {
      toast.error('Администратор должен указать розничную цену');
      return;
    }

    const purchasePrice = parseFloat(currentProduct.purchasePrice);
    const retailPrice = parseFloat(currentProduct.retailPrice) || purchasePrice;
    const quantity = parseFloat(currentProduct.quantity);
    const total = purchasePrice * quantity;
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

    const productData: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'> = {
      barcode: currentProduct.barcode,
      name: currentProduct.name,
      category: currentProduct.category,
      purchasePrice,
      retailPrice,
      quantity,
      unit: currentProduct.unit,
      expiryDate: currentProduct.expiryDate || undefined,
      photos,
      paymentType: currentProduct.paymentType,
      paidAmount,
      debtAmount: Math.max(0, debtAmount),
      addedBy: currentUser?.role || 'unknown',
    };

    const savedProduct = saveProduct(productData, currentUser?.username || 'unknown');

    const newProduct: Product = {
      id: savedProduct.id,
      barcode: savedProduct.barcode,
      name: savedProduct.name,
      category: savedProduct.category,
      purchasePrice: savedProduct.purchasePrice,
      retailPrice: savedProduct.retailPrice,
      quantity: savedProduct.quantity,
      unit: savedProduct.unit,
      expiryDate: savedProduct.expiryDate,
      photos: savedProduct.photos,
      paymentType: savedProduct.paymentType,
      paidAmount: savedProduct.paidAmount,
      debtAmount: savedProduct.debtAmount,
    };

    setProducts([...products, newProduct]);
    
    const paymentStatus = 
      currentProduct.paymentType === 'full' ? 'Полная оплата' :
      currentProduct.paymentType === 'partial' ? `Частичная оплата (${paidAmount}₽ из ${total}₽)` :
      `Долг (${debtAmount}₽)`;
    
    addLog(`Добавлен товар: ${newProduct.name} (${quantity} ${newProduct.unit}) - ${paymentStatus}`);
    
    if (suggestedProduct && (suggestedProduct.purchasePrice !== purchasePrice || suggestedProduct.retailPrice !== retailPrice)) {
      const priceDiff = purchasePrice - suggestedProduct.purchasePrice;
      addLog(`Изменение цены "${newProduct.name}": ${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)}₽`);
    }
    
    toast.success('Товар добавлен');

    // Reset form
    setCurrentProduct({
      barcode: '',
      name: '',
      category: '',
      purchasePrice: '',
      retailPrice: '',
      quantity: '',
      unit: 'шт',
      expiryDate: '',
      paymentType: 'full',
      paidAmount: '',
    });
    setPhotos([]);
    setSuggestedProduct(null);
  };

  return (
    <div>
      {showScanner && (
        <CameraScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Add Product Form */}
        <Card className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-4 flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Добавить товар
          </h3>

          {showSuggestion && suggestedProduct && (
            <div className="mb-4 p-3 bg-primary/10 border border-primary rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">Товар найден в базе!</p>
                  <p className="text-xs text-muted-foreground mt-1">{suggestedProduct.name}</p>
                  <div className="text-xs space-y-1 mt-2">
                    <div>Закуп: {suggestedProduct.purchasePrice}₽</div>
                    {isAdmin && <div>Розница: {suggestedProduct.retailPrice}₽</div>}
                    <div>Категория: {suggestedProduct.category}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={acceptSuggestion}>
                    Принять
                  </Button>
                  <Button size="sm" variant="ghost" onClick={rejectSuggestion}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Штрихкод *</label>
              <div className="flex gap-2">
                <Input
                  className="text-sm"
                  value={currentProduct.barcode}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, barcode: e.target.value })}
                  placeholder="Введите или отсканируйте"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowScanner(true)}
                >
                  <Scan className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Название товара *</label>
              <Input
                className="text-sm"
                value={currentProduct.name}
                onChange={(e) => setCurrentProduct({ ...currentProduct, name: e.target.value })}
                placeholder="Введите название"
              />
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Категория *</label>
              <Input
                className="text-sm"
                value={currentProduct.category}
                onChange={(e) => setCurrentProduct({ ...currentProduct, category: e.target.value })}
                placeholder="Например: Молочные продукты"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Закуп (₽) *</label>
                <Input
                  className="text-sm"
                  type="number"
                  step="0.01"
                  value={currentProduct.purchasePrice}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, purchasePrice: e.target.value })}
                  placeholder="0"
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Розница (₽) *</label>
                  <Input
                    className="text-sm"
                    type="number"
                    step="0.01"
                    value={currentProduct.retailPrice}
                    onChange={(e) => setCurrentProduct({ ...currentProduct, retailPrice: e.target.value })}
                    placeholder="0"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Количество *</label>
                <Input
                  className="text-sm"
                  type="number"
                  step="0.01"
                  value={currentProduct.quantity}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Единица *</label>
                <Select
                  value={currentProduct.unit}
                  onValueChange={(value: 'шт' | 'кг') => 
                    setCurrentProduct({ ...currentProduct, unit: value })
                  }
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="шт">Штуки</SelectItem>
                    <SelectItem value="кг">Килограммы</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Срок годности</label>
              <Input
                className="text-sm"
                type="date"
                value={currentProduct.expiryDate}
                onChange={(e) => setCurrentProduct({ ...currentProduct, expiryDate: e.target.value })}
              />
            </div>

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Фото товара (до 3 шт)</label>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="text-sm"
              />
              {photos.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="relative">
                      <img src={photo} alt={`Preview ${idx + 1}`} className="h-16 w-16 object-cover rounded border" />
                      <Button
                        size="icon"
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-5 w-5"
                        onClick={() => removePhoto(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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
                <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Оплачено (₽)</label>
                <Input
                  className="text-sm"
                  type="number"
                  step="0.01"
                  value={currentProduct.paidAmount}
                  onChange={(e) => setCurrentProduct({ ...currentProduct, paidAmount: e.target.value })}
                  placeholder="0"
                />
                {currentProduct.purchasePrice && currentProduct.quantity && currentProduct.paidAmount && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Остаток долга: {calculateDebt()}₽
                  </p>
                )}
              </div>
            )}

            {currentProduct.paymentType === 'debt' && currentProduct.purchasePrice && currentProduct.quantity && (
              <div className="p-2 sm:p-3 bg-warning/10 border border-warning rounded-lg">
                <p className="text-xs sm:text-sm font-medium text-warning">
                  Сумма долга: {parseFloat(currentProduct.purchasePrice) * parseFloat(currentProduct.quantity)}₽
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
        <Card className="p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-4 flex items-center gap-2">
            <Package className="h-5 w-5" />
            Список товаров ({products.length})
          </h3>

          {products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Товары не добавлены
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {products.map((product) => (
                <div key={product.id} className="p-3 sm:p-4 bg-muted/50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="font-medium text-sm sm:text-base">{product.name}</div>
                      <div className="text-xs sm:text-sm text-muted-foreground space-y-0.5">
                        <div>Штрихкод: {product.barcode}</div>
                        <div>Категория: {product.category}</div>
                        {product.expiryDate && (
                          <div>Срок до: {new Date(product.expiryDate).toLocaleDateString('ru-RU')}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right ml-2">
                      <div className="font-semibold text-sm sm:text-base">
                        {product.purchasePrice * product.quantity}₽
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        {product.quantity} {product.unit} × {product.purchasePrice}₽
                      </div>
                      {isAdmin && (
                        <Badge variant="secondary" className="mt-1 text-xs">
                          Розница: {product.retailPrice}₽
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
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
                  {product.photos.length > 0 && (
                    <div className="flex gap-2 mt-2 overflow-x-auto">
                      {product.photos.map((photo, idx) => (
                        <img
                          key={idx}
                          src={photo}
                          alt={`${product.name} ${idx + 1}`}
                          className="h-12 w-12 object-cover rounded border"
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
