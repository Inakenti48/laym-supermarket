// Очередь гарантированного сохранения товаров
// Товар пробуется сохраниться до успеха, не блокируя другие сканирования

import { insertProduct, createPendingProduct, getProductByBarcode } from './mysqlDatabase';
import { findPriceByBarcode, initPriceCache } from './localPriceCache';

interface SaveQueueItem {
  id: string;
  barcode: string;
  name: string;
  category: string;
  purchase_price: number;
  sale_price: number;
  quantity: number;
  expiry_date?: string;
  front_photo_url?: string;
  barcode_photo_url?: string;
  scanned_by: string;
  hasPrice: boolean;
  attempts: number;
  lastAttempt: number;
  status: 'pending' | 'saving' | 'saved' | 'queued';
  error?: string;
}

const STORAGE_KEY = 'product_save_queue';
const MAX_ATTEMPTS = 10;
const RETRY_DELAYS = [1000, 2000, 3000, 5000, 8000, 10000, 15000, 20000, 30000, 60000];

class ProductSaveQueue {
  private queue: SaveQueueItem[] = [];
  private isProcessing = false;
  private listeners: Set<(queue: SaveQueueItem[]) => void> = new Set();
  
  constructor() {
    this.loadFromStorage();
    // Запускаем обработку при создании
    setTimeout(() => this.startProcessing(), 1000);
  }
  
  // Загрузка из localStorage
  private loadFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.queue = JSON.parse(saved);
        // Сбрасываем статус "saving" на "pending" (могло прерваться)
        this.queue.forEach(item => {
          if (item.status === 'saving') {
            item.status = 'pending';
          }
        });
        this.saveToStorage();
      }
    } catch {
      this.queue = [];
    }
  }
  
  // Сохранение в localStorage
  private saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      // Storage full - удаляем старые сохранённые
      this.queue = this.queue.filter(item => item.status !== 'saved' && item.status !== 'queued');
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
      } catch {
        // Ignore
      }
    }
  }
  
  // Подписка на изменения
  subscribe(callback: (queue: SaveQueueItem[]) => void) {
    this.listeners.add(callback);
    callback(this.queue);
    return () => this.listeners.delete(callback);
  }
  
  private notify() {
    this.listeners.forEach(cb => cb([...this.queue]));
  }
  
  // Добавить товар в очередь сохранения
  add(product: {
    barcode: string;
    name?: string;
    category?: string;
    purchase_price?: number;
    sale_price?: number;
    quantity?: number;
    expiry_date?: string;
    front_photo_url?: string;
    barcode_photo_url?: string;
    scanned_by: string;
  }): string {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    // Проверяем цены в CSV
    let purchasePrice = product.purchase_price || 0;
    let salePrice = product.sale_price || 0;
    let productName = product.name || '';
    let productCategory = product.category || '';
    
    if (purchasePrice === 0 || salePrice === 0) {
      const csvData = findPriceByBarcode(product.barcode);
      if (csvData) {
        if (purchasePrice === 0) purchasePrice = csvData.purchasePrice;
        if (salePrice === 0) salePrice = Math.round(csvData.purchasePrice * 1.3);
        if (!productName && csvData.name) productName = csvData.name;
        if (!productCategory && csvData.category) productCategory = csvData.category;
      }
    }
    
    const hasPrice = purchasePrice > 0 && salePrice > 0 && !!productName;
    
    const item: SaveQueueItem = {
      id,
      barcode: product.barcode,
      name: productName || 'Неизвестный товар',
      category: productCategory,
      purchase_price: purchasePrice,
      sale_price: salePrice,
      quantity: product.quantity || 1,
      expiry_date: product.expiry_date,
      front_photo_url: product.front_photo_url,
      barcode_photo_url: product.barcode_photo_url,
      scanned_by: product.scanned_by,
      hasPrice,
      attempts: 0,
      lastAttempt: 0,
      status: 'pending'
    };
    
    this.queue.push(item);
    this.saveToStorage();
    this.notify();
    
    // Запускаем обработку если не запущена
    this.startProcessing();
    
    return id;
  }
  
  // Обработка одного элемента
  private async processItem(item: SaveQueueItem): Promise<boolean> {
    item.status = 'saving';
    item.attempts++;
    item.lastAttempt = Date.now();
    this.saveToStorage();
    this.notify();
    
    try {
      if (item.hasPrice) {
        // Пробуем сохранить в основную базу
        const result = await insertProduct({
          barcode: item.barcode,
          name: item.name,
          category: item.category,
          purchase_price: item.purchase_price,
          sale_price: item.sale_price,
          quantity: item.quantity,
          unit: 'шт',
          expiry_date: item.expiry_date,
          created_by: item.scanned_by
        });
        
        if (result.success) {
          item.status = 'saved';
          item.error = undefined;
          this.saveToStorage();
          this.notify();
          return true;
        }
        
        // Если много попыток - fallback в очередь pending
        if (item.attempts >= MAX_ATTEMPTS / 2) {
          const queueResult = await createPendingProduct({
            barcode: item.barcode,
            name: item.name,
            purchase_price: item.purchase_price,
            sale_price: item.sale_price,
            quantity: item.quantity,
            category: item.category,
            expiry_date: item.expiry_date,
            front_photo: item.front_photo_url,
            barcode_photo: item.barcode_photo_url,
            image_url: item.front_photo_url,
            added_by: item.scanned_by
          });
          
          if (queueResult.success) {
            item.status = 'queued';
            item.error = 'Сохранён в очередь (ошибка базы)';
            this.saveToStorage();
            this.notify();
            return true;
          }
        }
        
        throw new Error('Insert failed');
      } else {
        // Без цены - сразу в очередь
        const result = await createPendingProduct({
          barcode: item.barcode,
          name: item.name,
          purchase_price: item.purchase_price,
          sale_price: item.sale_price,
          quantity: item.quantity,
          category: item.category,
          expiry_date: item.expiry_date,
          front_photo: item.front_photo_url,
          barcode_photo: item.barcode_photo_url,
          image_url: item.front_photo_url,
          added_by: item.scanned_by
        });
        
        if (result.success) {
          item.status = 'queued';
          item.error = undefined;
          this.saveToStorage();
          this.notify();
          return true;
        }
        
        throw new Error('Queue failed');
      }
    } catch (err: any) {
      item.status = 'pending';
      item.error = err.message || 'Ошибка сохранения';
      this.saveToStorage();
      this.notify();
      return false;
    }
  }
  
  // Основной цикл обработки
  private async startProcessing() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    while (true) {
      // Находим элементы для обработки
      const pending = this.queue.filter(item => 
        item.status === 'pending' && 
        item.attempts < MAX_ATTEMPTS
      );
      
      if (pending.length === 0) {
        // Очищаем успешно сохранённые старше 5 минут
        const fiveMinAgo = Date.now() - 5 * 60 * 1000;
        this.queue = this.queue.filter(item => 
          (item.status !== 'saved' && item.status !== 'queued') ||
          item.lastAttempt > fiveMinAgo
        );
        this.saveToStorage();
        this.notify();
        
        // Ждём новых элементов
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      
      // Обрабатываем до 3 элементов параллельно
      const batch = pending.slice(0, 3);
      
      await Promise.all(batch.map(async (item) => {
        // Задержка на основе количества попыток
        const delay = RETRY_DELAYS[Math.min(item.attempts, RETRY_DELAYS.length - 1)];
        const timeSinceLastAttempt = Date.now() - item.lastAttempt;
        
        if (timeSinceLastAttempt < delay) {
          await new Promise(r => setTimeout(r, delay - timeSinceLastAttempt));
        }
        
        await this.processItem(item);
      }));
      
      // Небольшая пауза между batch'ами
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Получить текущее состояние
  getQueue(): SaveQueueItem[] {
    return [...this.queue];
  }
  
  // Получить статистику
  getStats() {
    const pending = this.queue.filter(i => i.status === 'pending').length;
    const saving = this.queue.filter(i => i.status === 'saving').length;
    const saved = this.queue.filter(i => i.status === 'saved').length;
    const queued = this.queue.filter(i => i.status === 'queued').length;
    
    return { pending, saving, saved, queued, total: this.queue.length };
  }
  
  // Очистить успешные
  clearCompleted() {
    this.queue = this.queue.filter(i => i.status !== 'saved' && i.status !== 'queued');
    this.saveToStorage();
    this.notify();
  }
}

// Глобальный экземпляр
export const productSaveQueue = new ProductSaveQueue();

// Функция для добавления товара (заменяет прямое сохранение)
export async function addProductToSaveQueue(product: {
  barcode: string;
  name?: string;
  category?: string;
  purchase_price?: number;
  sale_price?: number;
  quantity?: number;
  expiry_date?: string;
  front_photo_url?: string;
  barcode_photo_url?: string;
  scanned_by: string;
}): Promise<{ success: true; id: string; hasPrice: boolean }> {
  // Инициализируем кэш цен если нужно
  await initPriceCache();
  
  const id = productSaveQueue.add(product);
  const stats = productSaveQueue.getStats();
  
  // Определяем есть ли цена
  let hasPrice = false;
  const csvData = findPriceByBarcode(product.barcode);
  if (csvData && csvData.purchasePrice > 0) {
    hasPrice = true;
  } else if (product.purchase_price && product.purchase_price > 0 && product.sale_price && product.sale_price > 0) {
    hasPrice = true;
  }
  
  return { success: true, id, hasPrice };
}
