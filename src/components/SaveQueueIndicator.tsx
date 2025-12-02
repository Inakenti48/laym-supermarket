// Индикатор очереди сохранения товаров с обязательным уведомлением о failed
import { useState, useEffect } from 'react';
import { productSaveQueue, setOnFailedCallback, SaveQueueItem } from '@/lib/saveQueue';
import { CheckCircle, Clock, AlertTriangle, Loader2, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export const SaveQueueIndicator = () => {
  const [stats, setStats] = useState({ pending: 0, saving: 0, saved: 0, queued: 0, failed: 0, total: 0 });
  const [failedItems, setFailedItems] = useState<SaveQueueItem[]>([]);
  const [showFailedPanel, setShowFailedPanel] = useState(false);
  
  useEffect(() => {
    // Подписываемся на изменения очереди
    const unsubscribe = productSaveQueue.subscribe(() => {
      setStats(productSaveQueue.getStats());
      setFailedItems(productSaveQueue.getFailedItems());
    });
    
    // Устанавливаем callback для уведомлений о failed товарах
    setOnFailedCallback((item) => {
      // Показываем громкое уведомление
      toast.error(
        `⚠️ НЕ ЗАНЕСЕНО: "${item.name}"! ОБЯЗАТЕЛЬНО повторите!`,
        { 
          duration: 30000, // 30 секунд
          position: 'top-center',
          style: { 
            background: '#dc2626', 
            color: 'white',
            fontWeight: 'bold',
            fontSize: '16px'
          }
        }
      );
      setShowFailedPanel(true);
    });
    
    return () => {
      unsubscribe();
      setOnFailedCallback(null);
    };
  }, []);
  
  // Повторить сохранение
  const handleRetry = (id: string) => {
    productSaveQueue.retryFailed(id);
    toast.info('🔄 Повторяю сохранение...', { position: 'top-center' });
  };
  
  // Повторить все failed
  const handleRetryAll = () => {
    failedItems.forEach(item => productSaveQueue.retryFailed(item.id));
    toast.info(`🔄 Повторяю сохранение ${failedItems.length} товаров...`, { position: 'top-center' });
    setShowFailedPanel(false);
  };
  
  // Не показываем если очередь пуста и нет failed
  if (stats.total === 0 && failedItems.length === 0) return null;
  
  const hasActive = stats.pending > 0 || stats.saving > 0;
  const allDone = stats.saved + stats.queued === stats.total && stats.total > 0 && stats.failed === 0;
  
  return (
    <>
      {/* Панель failed товаров - ОБЯЗАТЕЛЬНАЯ */}
      {failedItems.length > 0 && showFailedPanel && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-destructive text-white rounded-xl shadow-2xl max-w-md w-full animate-in zoom-in">
            <div className="p-4 border-b border-white/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 animate-pulse" />
                  <h2 className="text-xl font-bold">⚠️ НЕ ЗАНЕСЕНО!</h2>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowFailedPanel(false)}
                  className="text-white hover:bg-white/20"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-sm mt-2 opacity-90">
                {failedItems.length} товар(ов) не удалось сохранить после 10 попыток.
                <br />
                <strong>ОБЯЗАТЕЛЬНО</strong> повторите их занесение!
              </p>
            </div>
            
            <div className="p-4 max-h-60 overflow-y-auto space-y-2">
              {failedItems.map(item => (
                <div 
                  key={item.id} 
                  className="bg-white/10 rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{item.name}</p>
                    <p className="text-xs opacity-80">
                      Штрихкод: {item.barcode} | Попыток: {item.attempts}
                    </p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={() => handleRetry(item.id)}
                    className="ml-2 shrink-0"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Повторить
                  </Button>
                </div>
              ))}
            </div>
            
            <div className="p-4 border-t border-white/20 space-y-2">
              <Button 
                onClick={handleRetryAll}
                className="w-full bg-white text-destructive hover:bg-white/90 font-bold"
              >
                <RefreshCw className="h-5 w-5 mr-2" />
                ПОВТОРИТЬ ВСЕ ({failedItems.length})
              </Button>
              <p className="text-xs text-center opacity-80">
                Не закрывайте это окно пока все товары не будут занесены!
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Мини-индикатор */}
      <div 
        className={`
          fixed bottom-20 right-4 z-50 
          flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-medium cursor-pointer
          ${failedItems.length > 0 
            ? 'bg-destructive text-white animate-pulse' 
            : hasActive 
              ? 'bg-primary text-primary-foreground' 
              : 'bg-green-600 text-white'
          }
          animate-in slide-in-from-right
        `}
        onClick={() => failedItems.length > 0 && setShowFailedPanel(true)}
      >
        {failedItems.length > 0 && (
          <>
            <AlertTriangle className="h-4 w-4" />
            <span>⚠️ НЕ ЗАНЕСЕНО: {failedItems.length}</span>
          </>
        )}
        
        {failedItems.length === 0 && stats.saving > 0 && (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Сохраняю: {stats.saving} из {stats.total}</span>
          </>
        )}
        
        {failedItems.length === 0 && stats.pending > 0 && stats.saving === 0 && (
          <>
            <Clock className="h-4 w-4" />
            <span>В очереди: {stats.pending} из {stats.total}</span>
          </>
        )}
        
        {failedItems.length === 0 && allDone && (
          <>
            <CheckCircle className="h-4 w-4" />
            <span>✓ Сохранено: {stats.saved + stats.queued}</span>
          </>
        )}
        
        {failedItems.length === 0 && !allDone && stats.pending === 0 && stats.saving === 0 && stats.total > 0 && (
          <>
            <Clock className="h-4 w-4" />
            <span>В очереди: {stats.total} (готово: {stats.saved + stats.queued})</span>
          </>
        )}
      </div>
    </>
  );
};
