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
import { supabase } from '@/integrations/supabase/client';

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
  capturedImage?: string; // Временное фото из AI распознавания
}

export const InventoryTab = () => {
  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === 'admin';
  
  const [products, setProducts] = useState<Product[]>([]);
  const [suggestedProduct, setSuggestedProduct] = useState<StoredProduct | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [capturedImage, setCapturedImage] = useState<string>(''); // Временное фото из AI
  const [showAIScanner, setShowAIScanner] = useState(false);
  const [aiScanMode, setAiScanMode] = useState<'product' | 'barcode'>('product');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  
  const [currentProduct, setCurrentProduct] = useState({
    barcode: '',
    name: '',
    category: '',
    purchasePrice: '',
    retailPrice: '',
    quantity: '',
    unit: 'шт' as 'шт' | 'кг',
    expiryDate: '',
    supplier: '',
  });

  useEffect(() => {
    setSuppliers(getSuppliers());
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

    // Создаем товар для списка (пока не сохраняем в базу)
    const newProduct: Product = {
      id: `temp-${Date.now()}`, // Временный ID
      barcode: currentProduct.barcode,
      name: currentProduct.name,
      category: currentProduct.category,
      purchasePrice,
      retailPrice,
      quantity,
      unit: currentProduct.unit,
      expiryDate: currentProduct.expiryDate || undefined,
      photos,
      capturedImage, // Сохраняем временное фото
    };

    setProducts([...products, newProduct]);
    
    toast.success('Товар добавлен в список. Нажмите "Занести товары" для сохранения в базу');

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
  };

  const transferFromTemporaryToMain = async (barcode: string, productName: string) => {
    try {
      // Ищем фото во временной базе
      const { data: tempPhoto, error: searchError } = await supabase
        .from('vremenno_product_foto')
        .select('*')
        .eq('barcode', barcode)
        .eq('product_name', productName)
        .maybeSingle();

      if (searchError || !tempPhoto) {
        console.log('No temporary photo found for transfer');
        return;
      }

      // Копируем файл из temporary в products
      const oldPath = tempPhoto.storage_path;
      const fileName = `${barcode}-${Date.now()}.jpg`;
      const newPath = `products/${fileName}`;

      // Скачиваем из storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('product-photos')
        .download(oldPath);

      if (downloadError || !fileData) {
        console.error('Error downloading temporary file:', downloadError);
        return;
      }

      // Загружаем в product-images
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(newPath, fileData, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Error uploading to main storage:', uploadError);
        return;
      }

      // Получаем новый публичный URL
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(newPath);

      // Сохраняем в основную базу
      const { error: dbError } = await supabase
        .from('product_images')
        .insert({
          barcode,
          product_name: productName,
          image_url: urlData.publicUrl,
          storage_path: newPath
        });

      if (dbError) {
        console.error('Error inserting into main database:', dbError);
        return;
      }

      // Удаляем из временной базы
      await supabase
        .from('vremenno_product_foto')
        .delete()
        .eq('id', tempPhoto.id);

      // Удаляем временный файл из storage
      await supabase.storage
        .from('product-photos')
        .remove([oldPath]);

      console.log('Photo transferred from temporary to main storage');
    } catch (error) {
      console.error('Error transferring photo:', error);
    }
  };

  const saveAllProducts = async () => {
    if (products.length === 0) {
      toast.error('Список товаров пуст');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const product of products) {
      try {
        const productData: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'> = {
          barcode: product.barcode,
          name: product.name,
          category: product.category,
          purchasePrice: product.purchasePrice,
          retailPrice: product.retailPrice,
          quantity: product.quantity,
          unit: product.unit,
          expiryDate: product.expiryDate,
          photos: product.photos,
          paymentType: 'full',
          paidAmount: product.purchasePrice * product.quantity,
          debtAmount: 0,
          addedBy: currentUser?.role || 'unknown',
          supplier: currentProduct.supplier || undefined,
        };

        const saved = saveProduct(productData, currentUser?.username || 'unknown');
        
        if (saved) {
          addLog(`Добавлен товар: ${product.name} (${product.quantity} ${product.unit})`);
          
          // Переносим фото из временной базы в основную
          await transferFromTemporaryToMain(product.barcode, product.name);
          
          if (suggestedProduct && 
              (suggestedProduct.purchasePrice !== product.purchasePrice || 
               suggestedProduct.retailPrice !== product.retailPrice)) {
            const priceDiff = product.purchasePrice - suggestedProduct.purchasePrice;
            addLog(`Изменение цены "${product.name}": ${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)}₽`);
          }
          
          successCount++;
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error('Error saving product:', error);
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast.success(`Успешно добавлено товаров: ${successCount}`);
      setProducts([]); // Очищаем список после успешного сохранения
    }
    
    if (errorCount > 0) {
      toast.error(`Ошибок при добавлении: ${errorCount}`);
    }
  };

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
        onSupplierAdded={(newSupplier) => {
          setSuppliers([...suppliers, newSupplier]);
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
                  {suppliers.length === 0 && (
                    <SelectItem value="" disabled>
                      Нет поставщиков
                    </SelectItem>
                  )}
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
              Добавить товар
            </Button>
          </div>
        </Card>

        {/* Products List */}
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
              <Package className="h-5 w-5" />
              Список товаров ({products.length})
            </h3>
            {products.length > 0 && (
              <Button 
                onClick={saveAllProducts}
                className="bg-green-600 hover:bg-green-700"
              >
                <Package className="h-4 w-4 mr-2" />
                Занести товары
              </Button>
            )}
          </div>

          {products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Товары не добавлены. Добавьте товары и нажмите "Занести товары"
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {products.map((product) => (
                <div key={product.id} className="p-3 sm:p-4 bg-muted/50 rounded-lg border-l-4 border-amber-500">
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
                      <Badge variant="secondary" className="mt-2 text-xs">
                        Ожидает подтверждения
                      </Badge>
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
