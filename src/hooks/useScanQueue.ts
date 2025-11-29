import { useState, useEffect, useCallback } from 'react';
import { 
  scanQueueManager, 
  ScanQueueItem,
  getScanQueueStats 
} from '@/lib/scanQueue';

export function useScanQueue() {
  const [queue, setQueue] = useState<ScanQueueItem[]>([]);
  const [stats, setStats] = useState<{ status: string; count: number; users: number }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Подписка на изменения очереди
  useEffect(() => {
    const unsubscribe = scanQueueManager.subscribe(setQueue);
    
    // Первоначальная загрузка
    scanQueueManager.refresh();
    
    return () => { unsubscribe(); };
  }, []);

  // Загрузка статистики
  const loadStats = useCallback(async () => {
    const data = await getScanQueueStats();
    setStats(data);
  }, []);

  // Обновить очередь
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      await scanQueueManager.refresh();
      await loadStats();
    } finally {
      setIsLoading(false);
    }
  }, [loadStats]);

  // Добавить в очередь
  const addToQueue = useCallback(async (item: Parameters<typeof scanQueueManager.add>[0]) => {
    setIsLoading(true);
    try {
      const result = await scanQueueManager.add(item);
      await loadStats();
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [loadStats]);

  // Обработать всю очередь
  const processAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await scanQueueManager.processAll();
      await loadStats();
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [loadStats]);

  // Фильтрованные списки
  const pendingItems = queue.filter(q => q.status === 'pending');
  const processingItems = queue.filter(q => q.status === 'processing');
  const completedItems = queue.filter(q => q.status === 'completed');
  const errorItems = queue.filter(q => q.status === 'error');

  return {
    queue,
    pendingItems,
    processingItems,
    completedItems,
    errorItems,
    stats,
    isLoading,
    refresh,
    addToQueue,
    processAll,
    startAutoProcessing: () => scanQueueManager.startAutoProcessing(),
    stopAutoProcessing: () => scanQueueManager.stopAutoProcessing(),
  };
}
