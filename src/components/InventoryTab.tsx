import { useState, useEffect } from 'react';
import { Scan, Plus, Package, X, Camera, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarcodeScanner } from './BarcodeScanner';
import { AIProductRecognition } from './AIProductRecognition';
import { CSVImportDialog } from './CSVImportDialog';
import { BulkImportButton } from './BulkImportButton';
import { QuickSupplierDialog } from './QuickSupplierDialog';
import { addLog, getCurrentUser } from '@/lib/auth';
import { toast } from 'sonner';
import { findProductByBarcode, saveProduct, StoredProduct, getSuppliers, Supplier } from '@/lib/storage';
import { Badge } from '@/components/ui/badge';

export const InventoryTab = () => {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  
  const [suggestedProduct, setSuggestedProduct] = useState<StoredProduct | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [showAIScanner, setShowAIScanner] = useState(false);
  const [aiScanMode, setAiScanMode] = useState<'product' | 'barcode'>('product');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  
  const [currentProduct, setCurrentProduct] = useState(() => {
    const saved = localStorage.getItem('inventory_form_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          barcode: '',
          name: '',
          category: '',
          purchasePrice: '',
          retailPrice: '',
          quantity: '',
          unit: 'шт' as 'шт' | 'кг',
          expiryDate: '',
          supplier: '',
        };
      }
    }
    return {
      barcode: '',
      name: '',
      category: '',
      purchasePrice: '',
      retailPrice: '',
      quantity: '',
      unit: 'шт' as 'шт' | 'кг',
      expiryDate: '',
      supplier: '',
    };
  });

  // Сохраняем состояние формы при изменении
  useEffect(() => {
    localStorage.setItem('inventory_form_data', JSON.stringify(currentProduct));
  }, [currentProduct]);

  useEffect(() => {
    const loadSuppliers = async () => {
      const loadedSuppliers = await getSuppliers();
      setSuppliers(loadedSuppliers);
    };
    loadSuppliers();
  }, []);

  const handleScan = async (data: { barcode: string; name?: string; category?: string; photoUrl?: string; capturedImage?: string } | string) => {
    // Поддержка обратной совместимости: если передана строка, преобразуем в объект
    const barcodeData = typeof data === 'string' ? { barcode: data } : data;
    
    const sanitizedBarcode = barcodeData.barcode.trim().replace(/[<>'"]/g, '');
    
    // Сохраняем capturedImage во временное состояние
    if (barcodeData.capturedImage) {
      setCapturedImage(barcodeData.capturedImage);
    }
    
    // Проверка только если штрихкод не пустой
    if (sanitizedBarcode && sanitizedBarcode.length > 50) {
      toast.warning('Штрихкод слишком длинный');
      return;
    }

    // Если есть штрихкод, ищем в базе
    if (sanitizedBarcode) {
      const existing = await findProductByBarcode(sanitizedBarcode);
      
      if (existing) {
        setSuggestedProduct(existing);
        setShowSuggestion(true);
        setCurrentProduct({ 
          ...currentProduct, 
          barcode: sanitizedBarcode,
          name: existing.name,
          category: existing.category,
          purchasePrice: existing.purchasePrice.toString(),
          retailPrice: existing.retailPrice.toString(),
          unit: existing.unit,
        });
        setPhotos(existing.photos);
        toast.info('Товар найден в базе данных');
        addLog(`Отсканирован штрихкод: ${sanitizedBarcode} (${existing.name})`);
        return;
      } else {
        // Штрихкод не найден в базе
        toast.info('Штрихкод нет в базе данных');
      }
    }

    // Заполняем данные из AI распознавания (с штрихкодом или без)
    const newPhotos = barcodeData.photoUrl ? [barcodeData.photoUrl] : [];
    setCurrentProduct({ 
      ...currentProduct, 
      barcode: sanitizedBarcode,
      name: barcodeData.name || '',
      category: barcodeData.category || ''
    });
    setPhotos(newPhotos);
    
    if (barcodeData.name) {
      toast.success(`Распознано: ${barcodeData.name}`);
      addLog(`Распознан товар: ${barcodeData.name}${sanitizedBarcode ? ` (штрихкод: ${sanitizedBarcode})` : ''}`);
    } else if (sanitizedBarcode) {
      toast.success(`Штрихкод отсканирован: ${sanitizedBarcode}`);
      addLog(`Отсканирован штрихкод: ${sanitizedBarcode}`);
    }
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

  const addProduct = async () => {
    if (!currentProduct.name || !currentProduct.category || 
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

    try {
      // Сохраняем товар сразу в localStorage
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
        paymentType: 'full',
        paidAmount: purchasePrice * quantity,
        debtAmount: 0,
        addedBy: currentUser?.role || 'unknown',
        supplier: currentProduct.supplier || undefined,
      };

      const saved = await saveProduct(productData, currentUser?.username || 'unknown');
      
      if (saved) {
        addLog(`Добавлен товар: ${currentProduct.name} (${quantity} ${currentProduct.unit})`);
        
        if (suggestedProduct && 
            (suggestedProduct.purchasePrice !== purchasePrice || 
             suggestedProduct.retailPrice !== retailPrice)) {
          const priceDiff = purchasePrice - suggestedProduct.purchasePrice;
          addLog(`Изменение цены "${currentProduct.name}": ${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)}₽`);
        }
        
        toast.success('✅ Товар сохранён и доступен на кассе!');
      }
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Ошибка сохранения товара');
      return;
    }

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
      supplier: '',
    });
    setPhotos([]);
    setCapturedImage('');
    setSuggestedProduct(null);
    // Очищаем сохраненное состояние формы
    localStorage.removeItem('inventory_form_data');
  };

  // Удалена функция saveAllProducts - товары теперь сохраняются сразу при добавлении

  return (
    <div className="space-y-4">
      {/* AI Product Recognition */}
      {showAIScanner && (
        <div className="fixed inset-0 bg-background z-50">
          <AIProductRecognition 
            onProductFound={handleScan}
            mode={aiScanMode}
          />
          <Button
            onClick={() => {
              setShowAIScanner(false);
              setAiScanMode('product');
            }}
            variant="outline"
            className="absolute top-4 right-4 z-50"
          >
            <X className="h-4 w-4 mr-2" />
            Закрыть
          </Button>
        </div>
      )}

      {/* CSV Import Dialog */}
      {showImportDialog && (
        <CSVImportDialog
          onClose={() => setShowImportDialog(false)}
          onImportComplete={() => {
            toast.success('Товары успешно импортированы');
          }}
        />
      )}

      {/* Quick Supplier Dialog */}
      <QuickSupplierDialog
        open={showSupplierDialog}
        onClose={() => setShowSupplierDialog(false)}
        onSupplierAdded={async (newSupplier) => {
          const updatedSuppliers = await getSuppliers();
          setSuppliers(updatedSuppliers);
          setCurrentProduct({ ...currentProduct, supplier: newSupplier.name });
        }}
      />

      {/* Scanner and Import */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <BarcodeScanner onScan={handleScan} />
        </div>
        <Button 
          onClick={() => {
            setAiScanMode('product');
            setShowAIScanner(true);
          }} 
          variant="outline"
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
        >
          <Scan className="h-4 w-4 mr-2" />
          AI Штрихкод
        </Button>
        {isAdmin && (
          <>
            <Button onClick={() => setShowImportDialog(true)} variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Импорт CSV
            </Button>
            <BulkImportButton />
          </>
        )}
      </div>

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
              <Input
                className="text-sm"
                value={currentProduct.barcode}
                onChange={(e) => setCurrentProduct({ ...currentProduct, barcode: e.target.value })}
                placeholder="Используйте сканер выше"
              />
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

            <div>
              <label className="text-xs sm:text-sm font-medium mb-1 sm:mb-2 block">Поставщик</label>
              <Select
                value={currentProduct.supplier}
                onValueChange={(value) => {
                  if (value === '__add_new__') {
                    setShowSupplierDialog(true);
                  } else {
                    setCurrentProduct({ ...currentProduct, supplier: value });
                  }
                }}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Выберите поставщика" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="__add_new__" className="text-primary font-medium">
                    + Добавить нового поставщика
                  </SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.name}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <Button onClick={addProduct} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Сохранить товар
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
