import { Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getLogs } from '@/lib/auth';

export const LogsTab = () => {
  const logs = getLogs();

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5" />
        Журнал активности ({logs.length})
      </h3>

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
                <span className="text-xs text-muted-foreground">{log.timestamp}</span>
              </div>
              {log.user && (
                <span className="text-xs text-muted-foreground">
                  Пользователь: {log.user}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
