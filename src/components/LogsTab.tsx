import { useState } from 'react';
import { Activity, Calendar } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getLogs } from '@/lib/auth';

export const LogsTab = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filteredLogs, setFilteredLogs] = useState(getLogs());

  const handleFilter = () => {
    const logs = getLogs(startDate, endDate);
    setFilteredLogs(logs);
  };

  const handleReset = () => {
    setStartDate('');
    setEndDate('');
    setFilteredLogs(getLogs());
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Activity className="h-5 w-5" />
        Журнал активности ({filteredLogs.length})
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

      {filteredLogs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          Нет записей в журнале
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {filteredLogs.map((log) => (
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
