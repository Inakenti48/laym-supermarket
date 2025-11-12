import { useState, useEffect } from 'react';
import { Monitor, Users, Wifi } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ActiveDevice {
  id: string;
  user_id: string;
  user_name: string;
  device_name: string;
  last_active: string;
  can_save_single: boolean;
  can_save_queue: boolean;
}

export const ActiveDevicesMonitor = () => {
  const [activeDevices, setActiveDevices] = useState<ActiveDevice[]>([]);
  const [totalDevices, setTotalDevices] = useState(0);
  const [onlineDevices, setOnlineDevices] = useState(0);

  // Загрузка устройств
  const loadDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('last_active', { ascending: false });

      if (error) throw error;

      const devices = data || [];
      setActiveDevices(devices);
      setTotalDevices(devices.length);

      // Считаем онлайн устройства (активность за последние 5 минут)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const online = devices.filter(device => 
        new Date(device.last_active) > fiveMinutesAgo
      ).length;
      setOnlineDevices(online);
    } catch (error) {
      console.error('Ошибка загрузки устройств:', error);
    }
  };

  useEffect(() => {
    // Первая загрузка
    loadDevices();

    // Подписка на изменения в реальном времени
    const channel = supabase
      .channel('devices-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'devices'
        },
        (payload) => {
          console.log('🔄 Real-time update:', payload);
          loadDevices();
        }
      )
      .subscribe();

    // Обновляем каждую минуту для пересчета онлайн статуса
    const interval = setInterval(() => {
      loadDevices();
    }, 60000); // 60 секунд

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const isOnline = (lastActive: string) => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return new Date(lastActive) > fiveMinutesAgo;
  };

  const getTimeAgo = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return 'только что';
    if (seconds < 300) return `${Math.floor(seconds / 60)} мин. назад`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин. назад`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч. назад`;
    return `${Math.floor(seconds / 86400)} дн. назад`;
  };

  return (
    <div className="space-y-4">
      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Monitor className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Всего устройств</p>
              <p className="text-2xl font-bold">{totalDevices}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <Wifi className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Онлайн сейчас</p>
              <p className="text-2xl font-bold text-green-600">{onlineDevices}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Оффлайн</p>
              <p className="text-2xl font-bold text-muted-foreground">{totalDevices - onlineDevices}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Таблица активных устройств */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Monitor className="h-5 w-5" />
          Активность устройств в реальном времени
        </h3>

        {activeDevices.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Нет зарегистрированных устройств</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Статус</TableHead>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Устройство</TableHead>
                  <TableHead>Права доступа</TableHead>
                  <TableHead>Последняя активность</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeDevices.map((device) => (
                  <TableRow key={device.id} className={isOnline(device.last_active) ? 'bg-green-500/5' : ''}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isOnline(device.last_active) ? (
                          <>
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              Онлайн
                            </Badge>
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 bg-gray-400 rounded-full" />
                            <Badge variant="outline" className="text-muted-foreground">
                              Оффлайн
                            </Badge>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{device.user_name}</TableCell>
                    <TableCell>{device.device_name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {device.can_save_single && (
                          <Badge variant="outline" className="text-xs bg-primary/5">
                            Одиночное
                          </Badge>
                        )}
                        {device.can_save_queue && (
                          <Badge variant="outline" className="text-xs bg-primary/5">
                            Очередь
                          </Badge>
                        )}
                        {!device.can_save_single && !device.can_save_queue && (
                          <Badge variant="destructive" className="text-xs">
                            Нет прав
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{getTimeAgo(device.last_active)}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(device.last_active).toLocaleString('ru-RU')}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};
