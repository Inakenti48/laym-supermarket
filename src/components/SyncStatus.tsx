import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { RefreshCw, WifiOff, Wifi, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { getSyncStatus, forceSyncNow } from '@/lib/syncService';
import { toast } from 'sonner';

export const SyncStatus = () => {
  const [status, setStatus] = useState<{
    isOnline: boolean;
    lastSync?: Date;
    pending: number;
    errors: number;
  }>({
    isOnline: navigator.onLine,
    pending: 0,
    errors: 0,
  });
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000); // Обновляем каждые 10 секунд
    
    // Слушаем изменения онлайн/оффлайн статуса
    const handleOnline = () => {
      setStatus(prev => ({ ...prev, isOnline: true }));
      toast.success('Соединение восстановлено');
    };
    
    const handleOffline = () => {
      setStatus(prev => ({ ...prev, isOnline: false }));
      toast.warning('Нет соединения. Данные сохраняются локально.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadStatus = async () => {
    const newStatus = await getSyncStatus();
    setStatus(newStatus);
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await forceSyncNow();
      await loadStatus();
    } finally {
      setSyncing(false);
    }
  };

  const formatLastSync = (date?: Date) => {
    if (!date) return 'Никогда';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Только что';
    if (minutes < 60) return `${minutes} мин назад`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
  };

  return (
    <Card className="p-4 bg-background/50">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {status.isOnline ? (
            <Wifi className="h-5 w-5 text-green-500" />
          ) : (
            <WifiOff className="h-5 w-5 text-orange-500" />
          )}
          
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {status.isOnline ? 'Онлайн' : 'Оффлайн'}
              </span>
              
              {status.pending > 0 && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {status.pending} ожидает
                </Badge>
              )}
              
              {status.errors > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {status.errors} ошибок
                </Badge>
              )}
            </div>
            
            <span className="text-xs text-muted-foreground">
              Последняя синхронизация: {formatLastSync(status.lastSync)}
            </span>
          </div>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleSyncNow}
          disabled={syncing || !status.isOnline}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Синхронизация...' : 'Синхронизировать'}
        </Button>
      </div>
    </Card>
  );
};
