import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getCurrentLoginUserSync } from '@/lib/loginAuth';
import { updateFirebaseProductQuantity } from '@/lib/firebaseProducts';
import { 
  getCancellationRequests, 
  updateCancellationRequest, 
  subscribeToCancellations,
  CancellationRequest,
  addSystemLog
} from '@/lib/firebaseCollections';

export const CancellationsTab = () => {
  const currentUser = getCurrentLoginUserSync();
  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
    
    // Подписка на realtime обновления
    const unsubscribe = subscribeToCancellations((data) => {
      setRequests(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadRequests = async () => {
    try {
      const data = await getCancellationRequests();
      setRequests(data);
    } catch (error: any) {
      console.error('Error loading cancellation requests:', error);
      toast.error('Ошибка загрузки заявок');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: CancellationRequest) => {
    if (!currentUser) return;
    
    setProcessingId(request.id);
    try {
      // Возвращаем товары на склад
      for (const item of request.items) {
        await updateFirebaseProductQuantity(item.barcode, item.quantity);
      }

      await updateCancellationRequest(request.id, 'approved');

      await addSystemLog({
        action: `Заявка на отмену одобрена`,
        user_id: currentUser.id,
        user_name: currentUser.username || currentUser.cashierName,
        details: `Товары: ${request.items.map(i => i.name).join(', ')}`
      });

      toast.success('Заявка одобрена, товары возвращены на склад');
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast.error('Ошибка при одобрении заявки');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: CancellationRequest) => {
    if (!currentUser) return;
    
    setProcessingId(request.id);
    try {
      await updateCancellationRequest(request.id, 'rejected');

      await addSystemLog({
        action: `Заявка на отмену отклонена`,
        user_id: currentUser.id,
        user_name: currentUser.username || currentUser.cashierName,
        details: `Кассир: ${request.cashier}`
      });

      toast.info('Заявка отклонена');
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      toast.error('Ошибка при отклонении заявки');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3" /> Ожидает</span>;
      case 'approved':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3" /> Одобрено</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-100 text-red-800"><XCircle className="h-3 w-3" /> Отклонено</span>;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-yellow-500" />
          Ожидающие рассмотрения ({pendingRequests.length})
        </h3>

        {pendingRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Нет заявок на рассмотрение
          </div>
        ) : (
          <div className="space-y-4">
            {pendingRequests.map((request) => (
              <Card key={request.id} className="p-4 border-yellow-200">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-medium">Заявка от {request.cashier}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(request.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  {getStatusBadge(request.status)}
                </div>

                <div className="mb-3">
                  <div className="text-sm font-medium mb-2">Товары:</div>
                  <div className="space-y-1">
                    {request.items.map((item, idx) => (
                      <div key={idx} className="text-sm flex justify-between">
                        <span>{item.name} x{item.quantity}</span>
                        <span className="text-muted-foreground">{item.price}₽</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleApprove(request)}
                    disabled={processingId === request.id}
                    size="sm"
                    className="flex-1"
                  >
                    {processingId === request.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Одобрить
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => handleReject(request)}
                    disabled={processingId === request.id}
                    variant="destructive"
                    size="sm"
                    className="flex-1"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Отклонить
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">
          История заявок ({processedRequests.length})
        </h3>

        {processedRequests.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            История пуста
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {processedRequests.map((request) => (
              <div key={request.id} className="p-3 bg-muted/50 rounded-lg flex justify-between items-center">
                <div>
                  <div className="text-sm font-medium">
                    {request.items.map(i => i.name).join(', ')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {request.cashier} • {new Date(request.created_at).toLocaleString('ru-RU')}
                  </div>
                </div>
                {getStatusBadge(request.status)}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
