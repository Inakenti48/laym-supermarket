import { useState, useRef, useEffect } from 'react';
import { Camera, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import Tesseract from 'tesseract.js';
import { BrowserMultiFormatReader } from '@zxing/library';
import { saveProduct } from '@/lib/storage';
import { getSuppliers, saveSupplier } from '@/lib/suppliersDb';
import { saveProductImage } from '@/lib/storage';
import { supabase } from '@/integrations/supabase/client';

interface OCRProductAdderProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const OCRProductAdder = ({ onSuccess, onCancel }: OCRProductAdderProps) => {
  const [step, setStep] = useState<'front' | 'barcode' | 'form'>('front');
  const [frontImage, setFrontImage] = useState<string>('');
  const [barcodeImage, setBarcodeImage] = useState<string>('');
  const [extractedName, setExtractedName] = useState('');
  const [extractedCategory, setExtractedCategory] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  
  // Форма
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    barcode: '',
    quantity: 1,
    purchasePrice: 0,
    retailPrice: 0,
    expiryDate: '',
    supplier: '',
    unit: 'шт' as 'шт' | 'кг',
    paymentType: 'full' as 'full' | 'partial' | 'debt',
    paidAmount: 0,
    debtAmount: 0
  });

  const frontInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Получаем текущего пользователя из Supabase
  useEffect(() => {
    const getCurrentUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUserId();
  }, []);

  // Категории для распознавания по ключевым словам
  const categoryKeywords: Record<string, string[]> = {
    'Молочные продукты': ['молоко', 'кефир', 'йогурт', 'сметана', 'творог', 'сыр', 'масло сливочное'],
    'Хлебобулочные': ['хлеб', 'батон', 'булка', 'багет', 'лаваш'],
    'Кондитерские': ['печенье', 'конфеты', 'шоколад', 'вафли', 'торт', 'пирожное'],
    'Напитки': ['вода', 'сок', 'лимонад', 'чай', 'кофе', 'напиток'],
    'Бакалея': ['крупа', 'мука', 'сахар', 'соль', 'макароны', 'рис', 'гречка'],
    'Консервы': ['консерва', 'тушенка', 'паштет', 'икра'],
    'Гигиена': ['мыло', 'шампунь', 'гель', 'паста', 'бритва', 'прокладки'],
    'Бытовая химия': ['порошок', 'жидкость', 'средство', 'отбеливатель', 'кондиционер'],
    'Овощи и фрукты': ['яблоко', 'банан', 'апельсин', 'картофель', 'морковь', 'лук', 'помидор'],
    'Мясо и колбасы': ['колбаса', 'сосиски', 'мясо', 'курица', 'свинина', 'говядина']
  };

  const detectCategory = (text: string): string => {
    const lowerText = text.toLowerCase();
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          return category;
        }
      }
    }
    
    return 'Разное';
  };

  const handleFrontImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    toast.info('Распознавание текста...');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageBase64 = event.target?.result as string;
        setFrontImage(imageBase64);

        // OCR с помощью tesseract.js
        const result = await Tesseract.recognize(imageBase64, 'rus+eng', {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              console.log(`OCR прогресс: ${Math.round(m.progress * 100)}%`);
            }
          }
        });

        const text = result.data.text.trim();
        console.log('Распознанный текст:', text);

        // Извлекаем первую строку как название (обычно самый крупный текст)
        const lines = text.split('\n').filter(line => line.trim().length > 2);
        const name = lines[0] || 'Товар без названия';
        
        const category = detectCategory(text);

        setExtractedName(name);
        setExtractedCategory(category);
        setFormData(prev => ({ ...prev, name, category }));

        toast.success('Текст распознан!');
        setStep('barcode');
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Ошибка OCR:', error);
      toast.error('Не удалось распознать текст');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBarcodeImageCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    toast.info('Чтение штрихкода...');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const imageBase64 = event.target?.result as string;
        setBarcodeImage(imageBase64);

        // Создаем временный img элемент для чтения
        const img = new Image();
        img.onload = async () => {
          try {
            const codeReader = new BrowserMultiFormatReader();
            
            // Создаем canvas для обработки изображения
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas context not available');
            
            ctx.drawImage(img, 0, 0);
            
            // Читаем штрихкод
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const luminanceSource = {
              getRow: (y: number, row: Uint8ClampedArray) => {
                const offset = y * canvas.width * 4;
                for (let x = 0; x < canvas.width; x++) {
                  const i = offset + x * 4;
                  row[x] = Math.floor((imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3);
                }
                return row;
              },
              getMatrix: () => {
                const matrix = new Uint8ClampedArray(canvas.width * canvas.height);
                for (let y = 0; y < canvas.height; y++) {
                  for (let x = 0; x < canvas.width; x++) {
                    const i = (y * canvas.width + x) * 4;
                    matrix[y * canvas.width + x] = Math.floor(
                      (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3
                    );
                  }
                }
                return matrix;
              },
              getWidth: () => canvas.width,
              getHeight: () => canvas.height,
              isRotateSupported: () => false,
              rotateCounterClockwise: () => luminanceSource,
              rotateCounterClockwise45: () => luminanceSource,
              invert: () => luminanceSource,
              crop: () => luminanceSource
            };

            const result = await codeReader.decodeFromImage(undefined, imageBase64);
            const barcodeText = result.getText();

            console.log('Распознанный штрихкод:', barcodeText);
            setBarcode(barcodeText);
            setFormData(prev => ({ ...prev, barcode: barcodeText }));

            toast.success('Штрихкод распознан!');
            setStep('form');
          } catch (error: any) {
            console.error('Ошибка чтения штрихкода:', error);
            toast.warning('Штрихкод не распознан. Введите вручную.');
            setStep('form');
          }
        };
        img.src = imageBase64;
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Ошибка обработки изображения:', error);
      toast.error('Не удалось обработать изображение');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Введите название товара');
      return;
    }

    if (formData.quantity <= 0) {
      toast.error('Количество должно быть больше 0');
      return;
    }

    if (formData.purchasePrice < 0 || formData.retailPrice < 0) {
      toast.error('Цены не могут быть отрицательными');
      return;
    }

    if (!currentUserId) {
      toast.error('Ошибка авторизации. Пожалуйста, перезайдите в систему.');
      return;
    }

    setIsProcessing(true);
    toast.info('Сохранение товара...');

    try {
      // Проверяем/создаем поставщика
      let supplierId = '';
      if (formData.supplier.trim()) {
        const suppliers = await getSuppliers();
        let supplier = suppliers.find(s => 
          s.name.toLowerCase() === formData.supplier.toLowerCase()
        );

        if (!supplier) {
          // Создаем нового поставщика
          const newSupplier = await saveSupplier(
            {
              name: formData.supplier,
              phone: '',
              notes: '',
              totalDebt: 0
            },
            currentUserId
          );

          if ('isOffline' in newSupplier) {
            supplierId = newSupplier.localId;
          } else {
            supplierId = newSupplier.id;
          }
          toast.success('Поставщик создан');
        } else {
          supplierId = supplier.id;
        }
      }

      // Сохраняем товар
      const product = await saveProduct(
        {
          barcode: formData.barcode || `NO-BARCODE-${Date.now()}`,
          name: formData.name,
          category: formData.category,
          purchasePrice: formData.purchasePrice,
          retailPrice: formData.retailPrice,
          quantity: formData.quantity,
          unit: formData.unit,
          expiryDate: formData.expiryDate || undefined,
          photos: [],
          paymentType: formData.paymentType,
          paidAmount: formData.paidAmount,
          debtAmount: formData.debtAmount,
          addedBy: currentUserId,
          supplier: formData.supplier || undefined
        },
        currentUserId
      );

      // Сохраняем фото лицевой стороны в постоянную базу
      if (frontImage && product.barcode) {
        await saveProductImage(product.barcode, product.name, frontImage);
        console.log('Фото товара сохранено в постоянную базу');
      }

      toast.success('Товар успешно добавлен в базу!');
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error('Ошибка сохранения:', error);
      toast.error(error.message || 'Не удалось сохранить товар');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  if (step === 'front') {
    return (
      <Card className="p-4 sm:p-6 max-w-2xl mx-auto">
        <h2 className="text-lg sm:text-xl font-bold mb-3">Шаг 1: Сфотографируйте лицевую сторону</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Сделайте фото упаковки с названием товара. Система автоматически распознает название и категорию.
        </p>
        
        {frontImage && (
          <div className="mb-4">
            <img src={frontImage} alt="Лицевая сторона" className="w-full max-h-48 sm:max-h-64 object-contain rounded-lg border" />
          </div>
        )}

        <input
          ref={frontInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFrontImageCapture}
          className="hidden"
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => frontInputRef.current?.click()}
            disabled={isProcessing}
            className="flex-1 h-12 sm:h-10 text-base"
          >
            <Camera className="w-5 h-5 mr-2" />
            {isProcessing ? 'Обработка...' : 'Сфотографировать'}
          </Button>
          <Button onClick={handleCancel} variant="outline" className="h-12 sm:h-10 sm:w-auto">
            <X className="w-5 h-5 sm:mr-2" />
            <span className="sm:inline hidden">Отмена</span>
          </Button>
        </div>
      </Card>
    );
  }

  if (step === 'barcode') {
    return (
      <Card className="p-4 sm:p-6 max-w-2xl mx-auto">
        <h2 className="text-lg sm:text-xl font-bold mb-3">Шаг 2: Сфотографируйте штрихкод</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Сделайте четкое фото штрихкода товара. Система автоматически его считает.
        </p>

        {extractedName && (
          <div className="mb-4 p-3 bg-success/10 rounded-lg">
            <p className="text-sm"><strong>Название:</strong> {extractedName}</p>
            <p className="text-sm"><strong>Категория:</strong> {extractedCategory}</p>
          </div>
        )}
        
        {barcodeImage && (
          <div className="mb-4">
            <img src={barcodeImage} alt="Штрихкод" className="w-full max-h-48 sm:max-h-64 object-contain rounded-lg border" />
          </div>
        )}

        <input
          ref={barcodeInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleBarcodeImageCapture}
          className="hidden"
        />

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            onClick={() => setStep('front')}
            variant="outline"
            className="h-12 sm:h-10 order-3 sm:order-1"
          >
            Назад
          </Button>
          <Button
            onClick={() => barcodeInputRef.current?.click()}
            disabled={isProcessing}
            className="flex-1 h-12 sm:h-10 text-base order-1 sm:order-2"
          >
            <Camera className="w-5 h-5 mr-2" />
            {isProcessing ? 'Обработка...' : 'Сфотографировать'}
          </Button>
          <Button
            onClick={() => setStep('form')}
            variant="outline"
            title="Пропустить и ввести вручную"
            className="h-12 sm:h-10 order-2 sm:order-3"
          >
            Пропустить
          </Button>
        </div>
      </Card>
    );
  }

  // Форма ручного ввода
  return (
    <Card className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h2 className="text-lg sm:text-xl font-bold mb-4">Шаг 3: Дополните данные</h2>
      
      <div className="space-y-4">
        {extractedName && (
          <div className="p-3 bg-success/10 rounded-lg text-sm">
            <p><strong>Распознано:</strong> {extractedName} ({extractedCategory})</p>
          </div>
        )}

        <div>
          <Label>Название товара *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Название"
          />
        </div>

        <div>
          <Label>Категория</Label>
          <Input
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            placeholder="Категория"
          />
        </div>

        <div>
          <Label>Штрихкод</Label>
          <Input
            value={formData.barcode}
            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
            placeholder={barcode ? 'Распознан автоматически' : 'Введите вручную или оставьте пустым'}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Количество *</Label>
            <Input
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
              min="1"
            />
          </div>

          <div>
            <Label>Единица измерения</Label>
            <select
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value as 'шт' | 'кг' })}
              className="w-full px-3 py-2 border rounded-md"
            >
              <option value="шт">шт</option>
              <option value="кг">кг</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Закупочная цена</Label>
            <Input
              type="number"
              value={formData.purchasePrice}
              onChange={(e) => setFormData({ ...formData, purchasePrice: Number(e.target.value) })}
              min="0"
              step="0.01"
            />
          </div>

          <div>
            <Label>Цена продажи</Label>
            <Input
              type="number"
              value={formData.retailPrice}
              onChange={(e) => setFormData({ ...formData, retailPrice: Number(e.target.value) })}
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div>
          <Label>Срок годности</Label>
          <Input
            type="date"
            value={formData.expiryDate}
            onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
          />
        </div>

        <div>
          <Label>Поставщик</Label>
          <Input
            value={formData.supplier}
            onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
            placeholder="Название поставщика (создастся автоматически)"
          />
        </div>

        <div className="flex gap-2 pt-4">
          <Button onClick={handleCancel} variant="outline">
            <X className="w-4 h-4 mr-2" />
            Отменить
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isProcessing || !formData.name.trim()}
            className="flex-1"
          >
            <Check className="w-4 h-4 mr-2" />
            {isProcessing ? 'Сохранение...' : 'Добавить товар'}
          </Button>
        </div>
      </div>
    </Card>
  );
};
