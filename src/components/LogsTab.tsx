import { useState, useEffect } from 'react';
import { Activity, Calendar, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SystemLog {
  id: string;
  message: string;
  user_name: string | null;
  created_at: string;
}

export const LogsTab = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      let query = supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (startDate) {
        query = query.gte('created_at', new Date(startDate).toISOString());
      }
      if (endDate) {
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endDateTime.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      console.error('Error loading logs:', error);
      toast.error('Ошибка загрузки логов');
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    setLoading(true);
    loadLogs();
  };

  const handleReset = () => {
    setStartDate('');
    setEndDate('');
    setLoading(true);
    loadLogs();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5" />
        Журнал активности ({logs.length})
      </h3>

      <Card className="p-4 mb-4 bg-muted/50">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4" />
          <span className="font-medium text-sm">Фильтр по датам</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-medium mb-1 block">От</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label className="text-xs font-medium mb-1 block">До</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm"
            />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={handleFilter} size="sm">Применить</Button>
            <Button onClick={handleReset} variant="outline" size="sm">Сбросить</Button>
          </div>
        </div>
      </Card>

      {logs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Нет записей в журнале
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="p-3 bg-muted/50 rounded-lg">
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-sm">{log.message}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString('ru-RU')}
                </span>
              </div>
              {log.user_name && (
                <span className="text-xs text-muted-foreground">
                  Пользователь: {log.user_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};