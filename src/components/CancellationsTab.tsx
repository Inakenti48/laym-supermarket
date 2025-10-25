import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/useAuth';

interface CancellationItem {
  name: string;
  quantity: number;
  price: number;
}

interface CancellationRequest {
  id: string;
  product_name: string;
  barcode: string;
  status: string;
  reason: string;
  quantity: number;
  requested_by: string;
  created_at: string;
  updated_at: string;
}

export const CancellationsTab = () => {
  const { user } = useAuth();
  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRequests();
    
    // Подписка на реалтайм обновления
    const channel = supabase
      .channel('cancellation_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cancellation_requests'
        },
        () => {
          loadRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('cancellation_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error: any) {
      console.error('Error loading cancellation requests:', error);
      toast.error('Ошибка загрузки запросов на отмену');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string, barcode: string, quantity: number) => {
    try {
      // Обновляем статус запроса
      const { error: updateError } = await supabase
        .from('cancellation_requests')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (updateError) throw updateError;

      // Возвращаем товары в базу (увеличиваем количество)
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('quantity')
        .eq('barcode', barcode)
        .single();

      if (!productError && product) {
        const { error: quantityError } = await supabase
          .from('products')
          .update({ quantity: product.quantity + quantity })
          .eq('barcode', barcode);

        if (quantityError) throw quantityError;
      }

      // Добавляем лог
      await supabase.from('system_logs').insert({
        user_id: user?.id,
        user_name: user?.email || 'Неизвестно',
        message: `Подтверждена отмена товара: ${barcode} (${quantity} шт)`
      });

      toast.success('Отмена товара подтверждена, товары возвращены в базу');
      loadRequests();
    } catch (error: any) {
      console.error('Error approving cancellation:', error);
      toast.error('Ошибка подтверждения отмены');
    }
  };

  const handleReject = async (id: string) => {
    try {
      const { error } = await supabase
        .from('cancellation_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Добавляем лог
      await supabase.from('system_logs').insert({
        user_id: user?.id,
        user_name: user?.email || 'Неизвестно',
        message: `Отклонена отмена товара`
      });

      toast.success('Отмена товара отклонена');
      loadRequests();
    } catch (error: any) {
      console.error('Error rejecting cancellation:', error);
      toast.error('Ошибка отклонения отмены');
    }
  };

  const handleApproveAll = async () => {
    const pending = requests.filter(r => r.status === 'pending');
    
    try {
      for (const request of pending) {
        await handleApprove(request.id, request.barcode, request.quantity);
      }
      toast.success(`Подтверждено отмен: ${pending.length}`);
    } catch (error: any) {
      console.error('Error approving all:', error);
      toast.error('Ошибка массового подтверждения');
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  const getTimeRemaining = (createdAt: string): string => {
    const now = new Date().getTime();
    const requestTime = new Date(createdAt).getTime();
    const elapsed = now - requestTime;
    const remaining = (24 * 60 * 60 * 1000) - elapsed;
    
    if (remaining <= 0) return 'Истёк';
    
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    
    return `${hours}ч ${minutes}м`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
                  <p className="text-sm font-semibold">Товар: {request.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Штрихкод: {request.barcode}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Запрос: {new Date(request.created_at).toLocaleString('ru-RU')}
                  </p>
                  <p className="text-xs text-amber-600 font-medium">
                    Истекает через: {getTimeRemaining(request.created_at)}
                  </p>
                </div>
              </div>

              <div className="space-y-1 text-xs bg-muted/50 p-2 rounded">
                <p className="font-medium">Детали отмены:</p>
                <div className="flex justify-between">
                  <span>Количество:</span>
                  <span>{request.quantity} шт</span>
                </div>
                <div className="flex justify-between">
                  <span>Причина:</span>
                  <span>{request.reason}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleApprove(request.id, request.barcode, request.quantity)}
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
                      <p className="text-sm font-medium">{request.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {request.status === 'approved' ? 'Подтверждено' : 'Отклонено'}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2 pl-6">
                    Количество: {request.quantity} шт | Штрихкод: {request.barcode}
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