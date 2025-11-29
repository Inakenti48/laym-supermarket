// Система очереди сканирования для одновременной работы 10+ пользователей
import { mysqlRequest } from './mysqlDatabase';

export interface ScanQueueItem {
  id: string;
  barcode?: string;
  name?: string;
  purchase_price: number;
  sale_price: number;
  quantity: number;
  category?: string;
  supplier?: string;
  expiry_date?: string;
  image_url?: string;
  scanned_by: string;
  device_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  error_message?: string;
  created_at?: string;
  processed_at?: string;
}

// Инициализация таблицы очереди
export async function initScanQueueTable(): Promise<boolean> {
  const result = await mysqlRequest('init_scan_queue_table');
  return result.success;
}

// Добавить товар в очередь сканирования
export async function addToScanQueue(item: {
  barcode?: string;
  name?: string;
  purchase_price?: number;
  sale_price?: number;
  quantity?: number;
  category?: string;
  supplier?: string;
  expiry_date?: string;
  image_url?: string;
  scanned_by: string;
  device_id?: string;
}): Promise<{ success: boolean; id?: string }> {
  const result = await mysqlRequest<{ id: string }>('add_to_scan_queue', item);
  return { success: result.success, id: result.data?.id };
}

// Получить очередь (по статусу)
export async function getScanQueue(status: 'pending' | 'processing' | 'completed' | 'error' = 'pending'): Promise<ScanQueueItem[]> {
  const result = await mysqlRequest<ScanQueueItem[]>('get_scan_queue', { status });
  return result.data || [];
}

// Получить всю очередь
export async function getAllScanQueue(): Promise<ScanQueueItem[]> {
  const result = await mysqlRequest<ScanQueueItem[]>('get_all_scan_queue');
  return result.data || [];
}

// Обработать один элемент из очереди
export async function processNextQueueItem(): Promise<{ success: boolean; processed?: ScanQueueItem; productId?: string }> {
  const result = await mysqlRequest<{ processed: ScanQueueItem; productId: string }>('process_scan_queue');
  return { 
    success: result.success, 
    processed: result.data?.processed,
    productId: result.data?.productId
  };
}

// Обработать всю очередь
export async function processAllQueue(): Promise<{ success: boolean; processed: number; errors: number }> {
  const result = await mysqlRequest<{ processed: number; errors: number }>('process_all_scan_queue');
  return { 
    success: result.success, 
    processed: result.data?.processed || 0,
    errors: result.data?.errors || 0
  };
}

// Обновить элемент очереди
export async function updateScanQueueItem(id: string, updates: Partial<ScanQueueItem>): Promise<boolean> {
  const result = await mysqlRequest('update_scan_queue_item', { id, ...updates });
  return result.success;
}

// Удалить элемент из очереди
export async function deleteScanQueueItem(id: string): Promise<boolean> {
  const result = await mysqlRequest('delete_scan_queue_item', { id });
  return result.success;
}

// Очистить завершенные элементы
export async function clearCompletedQueue(): Promise<boolean> {
  const result = await mysqlRequest('clear_completed_scan_queue');
  return result.success;
}

// Получить статистику очереди
export async function getScanQueueStats(): Promise<{ status: string; count: number; users: number }[]> {
  const result = await mysqlRequest<{ status: string; count: number; users: number }[]>('get_scan_queue_stats');
  return result.data || [];
}

// Класс для управления очередью с автоматической обработкой
export class ScanQueueManager {
  private isProcessing = false;
  private intervalId: number | null = null;
  private listeners: Set<(queue: ScanQueueItem[]) => void> = new Set();
  private currentQueue: ScanQueueItem[] = [];

  // Подписка на изменения очереди
  subscribe(callback: (queue: ScanQueueItem[]) => void) {
    this.listeners.add(callback);
    // Сразу отправляем текущее состояние
    callback(this.currentQueue);
    return () => this.listeners.delete(callback);
  }

  // Уведомить всех подписчиков
  private notify() {
    this.listeners.forEach(cb => cb(this.currentQueue));
  }

  // Обновить очередь
  async refresh() {
    this.currentQueue = await getAllScanQueue();
    this.notify();
  }

  // Добавить элемент и обновить
  async add(item: Parameters<typeof addToScanQueue>[0]) {
    const result = await addToScanQueue(item);
    if (result.success) {
      await this.refresh();
    }
    return result;
  }

  // Запустить автоматическую обработку очереди
  startAutoProcessing(intervalMs = 3000) {
    if (this.intervalId) return;
    
    this.intervalId = window.setInterval(async () => {
      if (this.isProcessing) return;
      
      this.isProcessing = true;
      try {
        const result = await processNextQueueItem();
        if (result.success && result.processed) {
          console.log('✅ Обработан товар из очереди:', result.processed.barcode);
          await this.refresh();
        }
      } catch (e) {
        console.error('Ошибка обработки очереди:', e);
      } finally {
        this.isProcessing = false;
      }
    }, intervalMs);
  }

  // Остановить автоматическую обработку
  stopAutoProcessing() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // Обработать всю очередь сразу
  async processAll() {
    if (this.isProcessing) return { processed: 0, errors: 0 };
    
    this.isProcessing = true;
    try {
      const result = await processAllQueue();
      await this.refresh();
      return result;
    } finally {
      this.isProcessing = false;
    }
  }
}

// Глобальный экземпляр менеджера очереди
export const scanQueueManager = new ScanQueueManager();
