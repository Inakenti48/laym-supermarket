import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getCancellationRequests, updateCancellationRequest, cleanupOldCancellations, type CancellationRequest } from '@/lib/storage';
import { CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

export const CancellationsTab = () => {
  const [requests, setRequests] = useState<CancellationRequest[]>([]);

  useEffect(() => {
    loadRequests();
    // Очистка старых запросов при загрузке
    cleanupOldCancellations();
  }, []);

  const loadRequests = () => {
    setRequests(getCancellationRequests());
  };

  const handleApprove = (id: string) => {
    updateCancellationRequest(id, 'approved');
    toast.success('Отмена товара подтверждена, товары возвращены в базу');
    loadRequests();
  };

  const handleReject = (id: string) => {
    updateCancellationRequest(id, 'rejected');
    toast.success('Отмена товара отклонена');
    loadRequests();
  };

  const handleApproveAll = () => {
    const pending = requests.filter(r => r.status === 'pending');
    pending.forEach(r => updateCancellationRequest(r.id, 'approved'));
    toast.success(`Подтверждено отмен: ${pending.length}`);
    loadRequests();
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  const getTimeRemaining = (requestedAt: string): string => {
    const now = new Date().getTime();
    const requestTime = new Date(requestedAt).getTime();
    const elapsed = now - requestTime;
    const remaining = (24 * 60 * 60 * 1000) - elapsed;
    
    if (remaining <= 0) return 'Истёк';
    
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    
    return `${hours}ч ${minutes}м`;
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Запросы на отмену товаров</h2>
        {pendingRequests.length > 0 && (
          <Button onClick={handleApproveAll} size="sm">
            Подтвердить все ({pendingRequests.length})
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="w-4 h-4" />
          В ожидании ({pendingRequests.length})
        </h3>
        {pendingRequests.length === 0 ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            Нет запросов на отмену
          </Card>
        ) : (
          pendingRequests.map((request) => (
            <Card key={request.id} className="p-3 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">Кассир: {request.cashier}</p>
                  <p className="text-xs text-muted-foreground">
                    Запрос: {new Date(request.requestedAt).toLocaleString('ru-RU')}
                  </p>
                  <p className="text-xs text-amber-600 font-medium">
                    Истекает через: {getTimeRemaining(request.requestedAt)}
                  </p>
                </div>
              </div>

              <div className="space-y-1 text-xs bg-muted/50 p-2 rounded">
                <p className="font-medium">Товары на отмену:</p>
                {request.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>{item.name}</span>
                    <span>{item.quantity} шт × {item.price}₽ = {item.quantity * item.price}₽</span>
                  </div>
                ))}
                <div className="border-t pt-1 flex justify-between font-semibold">
                  <span>Итого:</span>
                  <span>{request.items.reduce((sum, item) => sum + (item.quantity * item.price), 0)}₽</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleApprove(request.id)}
                  className="flex-1"
                  size="sm"
                >
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Подтвердить отмену
                </Button>
                <Button
                  onClick={() => handleReject(request.id)}
                  variant="destructive"
                  className="flex-1"
                  size="sm"
                >
                  <XCircle className="w-4 h-4 mr-1" />
                  Отклонить
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      {processedRequests.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Обработанные</h3>
          {processedRequests.map((request) => (
            <Card key={request.id} className="p-3 bg-muted/50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {request.status === 'approved' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600" />
                    )}
                    <div>
                      <p className="text-sm font-medium">Кассир: {request.cashier}</p>
                      <p className="text-xs text-muted-foreground">
                        {request.status === 'approved' ? 'Подтверждено' : 'Отклонено'}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 pl-6">
                    Товаров: {request.items.length} | 
                    Сумма: {request.items.reduce((sum, item) => sum + (item.quantity * item.price), 0)}₽
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};