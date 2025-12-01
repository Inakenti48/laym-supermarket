// Индикатор очереди сохранения товаров
import { useState, useEffect } from 'react';
import { productSaveQueue } from '@/lib/saveQueue';
import { CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';

export const SaveQueueIndicator = () => {
  const [stats, setStats] = useState({ pending: 0, saving: 0, saved: 0, queued: 0, total: 0 });
  
  useEffect(() => {
    const unsubscribe = productSaveQueue.subscribe(() => {
      setStats(productSaveQueue.getStats());
    });
    
    return () => { unsubscribe(); };
  }, []);
  
  // Не показываем если очередь пуста
  if (stats.total === 0) return null;
  
  const hasActive = stats.pending > 0 || stats.saving > 0;
  const allDone = stats.saved + stats.queued === stats.total && stats.total > 0;
  
  return (
    <div className={`
      fixed bottom-20 right-4 z-50 
      flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium
      ${hasActive ? 'bg-primary text-primary-foreground' : 'bg-green-600 text-white'}
      animate-in slide-in-from-right
    `}>
      {stats.saving > 0 && (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
      {stats.pending > 0 && stats.saving === 0 && (
        <Clock className="h-4 w-4" />
      )}
      {allDone && (
        <CheckCircle className="h-4 w-4" />
      )}
      
      <span>
        {stats.saving > 0 && `Сохраняю ${stats.saving}...`}
        {stats.pending > 0 && stats.saving === 0 && `Ожидает: ${stats.pending}`}
        {allDone && `✓ Сохранено: ${stats.saved + stats.queued}`}
      </span>
      
      {(stats.saved > 0 || stats.queued > 0) && !allDone && (
        <span className="text-xs opacity-80">
          (готово: {stats.saved + stats.queued})
        </span>
      )}
    </div>
  );
};
