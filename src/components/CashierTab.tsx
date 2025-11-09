import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, Trash2, Calculator, Printer, Search, Minus, Usb, XCircle, X, Camera, Scan, Edit2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
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
import { CameraScanner } from './CameraScanner';
import { BackgroundScanner } from './BackgroundScanner';
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
  testDrawer,
  setDrawerCommand,
  DRAWER_COMMANDS,
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

interface QuickItem {
  name: string;
  price: number;
  imageUrl?: string;
}

const DEFAULT_QUICK_ITEMS: QuickItem[] = [
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
  const [quickItems, setQuickItems] = useState<QuickItem[]>(() => {
    const saved = localStorage.getItem('quick_items_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_QUICK_ITEMS;
      }
    }
    return DEFAULT_QUICK_ITEMS;
  });
  const [editMode, setEditMode] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showDrawerSettings, setShowDrawerSettings] = useState(false);
  const [selectedDrawerCommand, setSelectedDrawerCommand] = useState<keyof typeof DRAWER_COMMANDS>('STANDARD');
  const [pendingReceiptData, setPendingReceiptData] = useState<ReceiptData | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const fileInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const user = getCurrentUser();
  
  // ОПТИМИЗАЦИЯ: Кешируем все товары один раз
  const productsCache = useRef<any[]>([]);
  const productsBarcodeMap = useRef<Map<string, any>>(new Map());
  const productsNameMap = useRef<Map<string, any>>(new Map());
  const [cacheReady, setCacheReady] = useState(false);
  
  // Загружаем товары один раз при монтировании
  useEffect(() => {
    const loadProductsCache = async () => {
      console.log('🔄 Начинаем загрузку кэша товаров...');
      const products = await getAllProducts();
      productsCache.current = products;
      
      // Создаем быстрые индексы для поиска
      productsBarcodeMap.current.clear();
      productsNameMap.current.clear();
      
      products.forEach(product => {
        if (product.barcode) {
          productsBarcodeMap.current.set(product.barcode.toLowerCase(), product);
        }
        productsNameMap.current.set(product.name.toLowerCase(), product);
      });
      
      console.log(`✅ Кэш готов! Загружено ${products.length} товаров`);
      console.log(`📊 Штрихкодов: ${productsBarcodeMap.current.size}, Названий: ${productsNameMap.current.size}`);
      setCacheReady(true);
    };
    
    loadProductsCache();
  }, []);

  // Сохраняем корзину при изменении
  useEffect(() => {
    localStorage.setItem('cashier_cart_data', JSON.stringify(cart));
  }, [cart]);

  // Сохраняем быстрые товары при изменении
  useEffect(() => {
    localStorage.setItem('quick_items_data', JSON.stringify(quickItems));
  }, [quickItems]);

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

  // Подписка на реалтайм обновления товаров
  useEffect(() => {
    if (!cacheReady) return; // Ждем первой загрузки
    
    console.log('📡 Подписываемся на обновления товаров...');
    
    const channel = supabase
      .channel('products_changes_cashier')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products'
        },
        async (payload) => {
          console.log('🔄 Получено обновление товаров:', payload.eventType, payload);
          
          // ОПТИМИЗАЦИЯ: Обновляем кеш при изменениях
          const products = await getAllProducts();
          productsCache.current = products;
          productsBarcodeMap.current.clear();
          productsNameMap.current.clear();
          
          products.forEach(product => {
            if (product.barcode) {
              productsBarcodeMap.current.set(product.barcode.toLowerCase(), product);
            }
            productsNameMap.current.set(product.name.toLowerCase(), product);
          });
          
          console.log(`✅ Кэш обновлен! Теперь ${products.length} товаров`);
          console.log(`📊 Штрихкодов: ${productsBarcodeMap.current.size}, Названий: ${productsNameMap.current.size}`);
          
          toast.success('База товаров обновлена', { duration: 2000 });
          
          // Обновляем результаты поиска если есть активный поиск
          if (searchQuery.trim() && searchQuery.length >= 2) {
            const updateSearchResults = async () => {
              const query = searchQuery.toLowerCase();
              const allProducts = await getAllProducts();
              setSearchResults(
                allProducts
                  .filter(p => p.name.toLowerCase().includes(query))
                  .slice(0, 10)
              );
            };
            updateSearchResults();
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Статус подписки:', status);
      });

    return () => {
      console.log('📡 Отписываемся от обновлений товаров');
      supabase.removeChannel(channel);
    };
  }, [searchQuery, cacheReady]);

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

  const handleTestDrawer = async () => {
    if (!printerConnected) {
      toast.error('Сначала подключите принтер');
      return;
    }
    const success = await testDrawer();
    if (success) {
      toast.success('Команда открытия ящика отправлена');
    } else {
      toast.error('Ошибка открытия ящика. Попробуйте другую команду');
    }
  };

  const handleChangeDrawerCommand = (command: keyof typeof DRAWER_COMMANDS) => {
    setSelectedDrawerCommand(command);
    setDrawerCommand(command);
    toast.success('Команда открытия ящика изменена');
  };

  const handleScan = async (data: { barcode: string; name?: string; category?: string; photoUrl?: string; capturedImage?: string } | string) => {
    // Поддержка обратной совместимости: если передана строка, преобразуем в объект
    const barcodeData = typeof data === 'string' ? { barcode: data } : data;
    
    const sanitizedBarcode = barcodeData.barcode?.trim().replace(/[<>'"]/g, '') || '';
    const productName = barcodeData.name?.trim() || '';
    
    console.log('🎯 handleScan получил данные:', { sanitizedBarcode, productName, barcodeData });
    console.log('📦 Состояние кэша:', {
      ready: cacheReady,
      totalProducts: productsCache.current.length,
      barcodes: productsBarcodeMap.current.size,
      names: productsNameMap.current.size
    });
    
    // Проверяем готовность кэша
    if (!cacheReady) {
      toast.error('Подождите, загружается база товаров...');
      return;
    }
    
    // Если все поля пустые - пропускаем
    if (!sanitizedBarcode && !productName) {
      return;
    }
    
    let product = null;
    let isTemporary = false;
    const isFromPhotoScan = !!productName || !!barcodeData.photoUrl || !!barcodeData.capturedImage;

    // ОПТИМИЗАЦИЯ: Используем кеш вместо обращения к базе
    // Если есть штрихкод - ищем по штрихкоду в кеше
    if (sanitizedBarcode && sanitizedBarcode.length <= 50) {
      product = productsBarcodeMap.current.get(sanitizedBarcode.toLowerCase());
      console.log('🔍 Поиск по штрихкоду в кеше:', sanitizedBarcode, '-> найден:', !!product);
      if (product) {
        console.log('✅ Товар найден:', product.name, 'Цена:', product.retailPrice);
      }
    }
    
    // Если штрихкода нет или товар не найден по штрихкоду, ищем по названию в кеше
    if (!product && productName) {
      const allProducts = productsCache.current;
      
      // Сначала точное совпадение
      product = productsNameMap.current.get(productName.toLowerCase());
      
      // Если не нашли, ищем частичное совпадение (учитываем цвет и объем)
      if (!product) {
        product = allProducts.find(p => {
          const productLower = p.name.toLowerCase();
          const searchLower = productName.toLowerCase();
          
          // Проверяем вхождение в обе стороны
          return productLower.includes(searchLower) || searchLower.includes(productLower);
        });
      }
      
      console.log('🔍 Поиск по названию:', productName, '-> найден:', product ? product.name : 'НЕ НАЙДЕН');
      
      if (product) {
        // Проверяем, совпадают ли важные атрибуты (цвет, объем)
        const searchWords = productName.toLowerCase().split(/[\s,]+/);
        const productWords = product.name.toLowerCase().split(/[\s,]+/);
        const hasColorOrVolumeMismatch = searchWords.some(word => {
          // Проверяем слова, которые могут указывать на цвет или объем
          const isImportantWord = /^\d+/.test(word) || // числа (объем)
                                  word.length > 3; // потенциальные цвета/атрибуты
          return isImportantWord && !productWords.includes(word);
        });
        
        if (hasColorOrVolumeMismatch) {
          toast.warning(`⚠️ Найден "${product.name}", но может отличаться цвет/объем от "${productName}"`);
        } else {
          toast.info(`Товар найден по названию: ${product.name}`);
        }
        
        // Сохраняем фото если оно есть
        if (barcodeData.photoUrl || barcodeData.capturedImage) {
          const imageToSave = barcodeData.photoUrl || barcodeData.capturedImage;
          if (imageToSave) {
            console.log('💾 Сохранение фото товара на кассе...');
            // Импортируем функцию сохранения
            const { saveProductImage } = await import('@/lib/storage');
            const saved = await saveProductImage(
              product.barcode || `cashier-${Date.now()}`,
              product.name,
              imageToSave
            );
            if (saved) {
              console.log('✅ Фото сохранено на кассе');
            }
          }
        }
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
    } else if (isFromPhotoScan) {
      // Если это был фото-скан и товар не найден
      console.log('❌ Товар не распознан по фото');
    }
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

  const handleImageUpload = (index: number, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Пожалуйста, выберите файл изображения');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageUrl = e.target?.result as string;
      setQuickItems(prev => prev.map((item, i) => 
        i === index ? { ...item, imageUrl } : item
      ));
      toast.success('Фото загружено');
    };
    reader.readAsDataURL(file);
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

      {/* Scanner - всегда активен */}
      <BarcodeScanner onScan={handleScan} autoFocus={true} />

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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
              <Printer className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-800">Принтер чеков подключен</span>
            </div>
            <Button 
              onClick={() => setShowDrawerSettings(!showDrawerSettings)} 
              size="sm" 
              variant="outline"
            >
              Настройка ящика
            </Button>
          </div>
          
          {showDrawerSettings && (
            <div className="mt-4 pt-4 border-t border-green-200 space-y-3">
              <div className="text-sm font-medium text-green-800">Команда открытия денежного ящика:</div>
              <div className="space-y-2">
                {Object.keys(DRAWER_COMMANDS).map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="drawer-command"
                      checked={selectedDrawerCommand === key}
                      onChange={() => handleChangeDrawerCommand(key as keyof typeof DRAWER_COMMANDS)}
                      className="w-4 h-4"
                    />
                    <span className="text-green-900">{key}</span>
                  </label>
                ))}
              </div>
              <Button 
                onClick={handleTestDrawer} 
                size="sm" 
                className="w-full"
              >
                Тест открытия ящика
              </Button>
              <p className="text-xs text-green-700">
                💡 Если ящик не открывается, попробуйте разные команды и нажмите "Тест". 
                Работающая команда будет автоматически использоваться при печати чека.
              </p>
            </div>
          )}
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
        {/* Cart */}
        <div className="lg:col-span-2 space-y-4">
          {/* Scanner and Search */}
          <Card className="p-3 sm:p-4">
            <div className="space-y-3 mb-3">
              {/* Background Scanner - автоматическое сканирование с визуализацией */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-full max-w-md">
                  <BackgroundScanner 
                    onProductFound={(data) => {
                      if (data.barcode || data.name) {
                        handleScan({ 
                          barcode: data.barcode || '', 
                          name: data.name 
                        });
                      }
                    }}
                    autoStart={false}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Наведите камеру на штрихкод или переднюю часть упаковки
                </p>
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

        {/* Quick items - справа */}
        <div className="lg:col-span-1">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2 text-sm sm:text-base">
                <Plus className="h-5 w-5" />
                Быстрые товары
              </h3>
              <Button
                variant={editMode ? "default" : "outline"}
                size="sm"
                onClick={() => setEditMode(!editMode)}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {quickItems.map((item, idx) => (
                <div key={idx} className="relative">
                  {editMode ? (
                    <div className="border rounded-lg p-2 space-y-2">
                      <div className="text-xs font-medium truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{item.price}₽</div>
                      <input
                        ref={el => fileInputRefs.current[idx] = el}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(idx, e)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => fileInputRefs.current[idx]?.click()}
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        {item.imageUrl ? 'Изменить' : 'Фото'}
                      </Button>
                      {item.imageUrl && (
                        <div className="relative h-12 rounded overflow-hidden">
                          <img 
                            src={item.imageUrl} 
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <Button
                          variant="outline"
                          className="h-16 sm:h-20 w-full flex flex-col items-center justify-center gap-1 text-xs sm:text-sm"
                          onClick={() => addToCart(item.name, item.price)}
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="text-muted-foreground">{item.price}₽</span>
                        </Button>
                      </HoverCardTrigger>
                      {item.imageUrl && (
                        <HoverCardContent side="left" className="w-64">
                          <div className="space-y-2">
                            <div className="font-semibold">{item.name}</div>
                            <div className="text-sm text-muted-foreground">Цена: {item.price}₽</div>
                            <div className="rounded-lg overflow-hidden">
                              <img 
                                src={item.imageUrl} 
                                alt={item.name}
                                className="w-full h-40 object-cover"
                              />
                            </div>
                          </div>
                        </HoverCardContent>
                      )}
                    </HoverCard>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
