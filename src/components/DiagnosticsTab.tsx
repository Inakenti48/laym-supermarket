import { useState, useEffect } from 'react';
import { Settings, Monitor } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getCurrentLoginUser } from '@/lib/loginAuth';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ActiveDevicesMonitor } from './ActiveDevicesMonitor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Device {
  id: string;
  user_id: string;
  user_name: string;
  device_name: string;
  can_save_single: boolean;
  can_save_queue: boolean;
  last_active: string;
  created_at: string;
}

export const DiagnosticsTab = () => {
  const [userRole, setUserRole] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserLogin, setCurrentUserLogin] = useState<string>('');
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  
  // Настройки диагностики
  const [deviceName, setDeviceName] = useState(() => localStorage.getItem('device_name') || '');
  const [canSaveSingle, setCanSaveSingle] = useState(() => localStorage.getItem('can_save_single') !== 'false');
  const [canSaveQueue, setCanSaveQueue] = useState(() => localStorage.getItem('can_save_queue') !== 'false');

  // Получаем роль пользователя при загрузке
  useEffect(() => {
    const loadUserRole = async () => {
      const user = await getCurrentLoginUser();
      if (user) {
        setUserRole(user.role);
        setCurrentUserId(user.id);
        setCurrentUserLogin(user.login);
        
        // Если админ или складская - автоматически даем все права
        if (user.role === 'admin' || user.role === 'inventory') {
          setCanSaveSingle(true);
          setCanSaveQueue(true);
          localStorage.setItem('can_save_single', 'true');
          localStorage.setItem('can_save_queue', 'true');
        }
      }
    };
    loadUserRole();
  }, []);

  // Загружаем все устройства для админа
  useEffect(() => {
    if (userRole === 'admin') {
      loadAllDevices();
    }
  }, [userRole]);

  const loadAllDevices = async () => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('last_active', { ascending: false });

      if (error) throw error;
      setAllDevices(data || []);
    } catch (error) {
      console.error('Ошибка загрузки устройств:', error);
    }
  };

  const handleSaveSettings = async () => {
    // Для админа и складской всегда даем все права
    const finalCanSaveSingle = (userRole === 'admin' || userRole === 'inventory') ? true : canSaveSingle;
    const finalCanSaveQueue = (userRole === 'admin' || userRole === 'inventory') ? true : canSaveQueue;
    
    // Сохраняем в localStorage
    localStorage.setItem('device_name', deviceName);
    localStorage.setItem('can_save_single', String(finalCanSaveSingle));
    localStorage.setItem('can_save_queue', String(finalCanSaveQueue));

    // Сохраняем в базу данных
    try {
      if (!currentUserId || !currentUserLogin || !deviceName) {
        toast.error('⚠️ Необходимо заполнить название устройства');
        return;
      }

      // Проверяем, существует ли уже запись для этого пользователя
      const { data: existingDevice } = await supabase
        .from('devices')
        .select('id')
        .eq('user_id', currentUserId)
        .single();

      if (existingDevice) {
        // Обновляем существующую запись
        const { error } = await supabase
          .from('devices')
          .update({
            device_name: deviceName,
            can_save_single: finalCanSaveSingle,
            can_save_queue: finalCanSaveQueue,
            last_active: new Date().toISOString(),
          })
          .eq('user_id', currentUserId);

        if (error) throw error;
      } else {
        // Создаем новую запись
        const { error } = await supabase
          .from('devices')
          .insert({
            user_id: currentUserId,
            user_name: currentUserLogin,
            device_name: deviceName,
            can_save_single: finalCanSaveSingle,
            can_save_queue: finalCanSaveQueue,
          });

        if (error) throw error;
      }

      const roleMessage = (userRole === 'admin' || userRole === 'inventory') ? ' (Все права включены автоматически)' : '';
      toast.success('✅ Настройки сохранены' + roleMessage);
      
      // Перезагружаем список устройств если админ
      if (userRole === 'admin') {
        loadAllDevices();
      }
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
      toast.error('❌ Ошибка при сохранении настроек');
    }
  };

  return (
    <Tabs defaultValue="settings" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="settings">
          <Settings className="h-4 w-4 mr-2" />
          Настройки
        </TabsTrigger>
        <TabsTrigger value="monitor">
          <Monitor className="h-4 w-4 mr-2" />
          Активные устройства
        </TabsTrigger>
      </TabsList>

      <TabsContent value="settings" className="space-y-4">
        <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Настройки доступа и диагностика
        </h3>

        {/* Информация о пользователе */}
        <div className="space-y-3 mb-6 p-3 bg-muted/50 rounded-lg">
          <h4 className="font-medium text-sm">Текущая информация:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">ID:</span>
              <span className="ml-2 font-mono text-xs">{currentUserId || 'не загружен'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Логин:</span>
              <span className="ml-2 font-medium">{currentUserLogin || 'не загружен'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Роль:</span>
              <span className="ml-2 font-medium">{userRole || 'не загружена'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Устройство:</span>
              <span className="ml-2 font-medium">{deviceName || 'не указано'}</span>
            </div>
          </div>
        </div>

        {/* Выбор устройства */}
        <div className="space-y-2 mb-6">
          <label className="text-sm font-medium">Название устройства</label>
          <Input
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="Например: Телефон Админа, iPhone 12, Компьютер Склад"
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Укажите название вашего устройства для удобной идентификации
          </p>
        </div>

        {/* Права доступа */}
        <div className="space-y-4 mb-6">
          <h4 className="font-medium text-sm">Права доступа на сохранение товаров:</h4>
          
          {(userRole === 'admin' || userRole === 'inventory') && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg mb-3">
              <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                ✅ {userRole === 'admin' ? 'Администратор' : 'Складская'}: все права доступа включены автоматически
              </p>
            </div>
          )}
          
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <input
              type="checkbox"
              id="canSaveSingle"
              checked={(userRole === 'admin' || userRole === 'inventory') ? true : canSaveSingle}
              onChange={(e) => setCanSaveSingle(e.target.checked)}
              disabled={userRole === 'admin' || userRole === 'inventory'}
              className="mt-1"
            />
            <label htmlFor="canSaveSingle" className="flex-1 cursor-pointer">
              <div className="font-medium text-sm">Сохранение в одиночку</div>
              <div className="text-xs text-muted-foreground">
                Разрешить сохранение товаров напрямую в базу данных минуя очередь
              </div>
            </label>
          </div>

          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <input
              type="checkbox"
              id="canSaveQueue"
              checked={(userRole === 'admin' || userRole === 'inventory') ? true : canSaveQueue}
              onChange={(e) => setCanSaveQueue(e.target.checked)}
              disabled={userRole === 'admin' || userRole === 'inventory'}
              className="mt-1"
            />
            <label htmlFor="canSaveQueue" className="flex-1 cursor-pointer">
              <div className="font-medium text-sm">Добавление в очередь</div>
              <div className="text-xs text-muted-foreground">
                Разрешить добавление товаров в очередь для последующего сохранения
              </div>
            </label>
          </div>
        </div>

        {/* Кнопка сохранения настроек */}
        <Button 
          onClick={handleSaveSettings}
          className="w-full"
        >
          Сохранить настройки
        </Button>

        {/* Предупреждение */}
        {(!canSaveSingle && !canSaveQueue) && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive font-medium">
              ⚠️ Внимание: Вы отключили все права на сохранение товаров. 
              Включите хотя бы одну опцию для работы с товарами.
            </p>
          </div>
        )}

        {/* Статус доступа */}
        <div className="mt-6 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <h4 className="font-medium text-sm mb-2">Текущий статус доступа:</h4>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className={canSaveSingle ? 'text-green-600' : 'text-red-600'}>
                {canSaveSingle ? '✅' : '❌'}
              </span>
              <span>Сохранение в одиночку</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={canSaveQueue ? 'text-green-600' : 'text-red-600'}>
                {canSaveQueue ? '✅' : '❌'}
              </span>
              <span>Добавление в очередь</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Список всех устройств (только для админа) */}
      {userRole === 'admin' && allDevices.length > 0 && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Все устройства в системе ({allDevices.length})
          </h3>
          
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Пользователь</TableHead>
                  <TableHead>Устройство</TableHead>
                  <TableHead>Права</TableHead>
                  <TableHead>Последняя активность</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allDevices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">{device.user_name}</TableCell>
                    <TableCell>{device.device_name}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {device.can_save_single && (
                          <Badge variant="outline" className="text-xs">
                            Одиночное
                          </Badge>
                        )}
                        {device.can_save_queue && (
                          <Badge variant="outline" className="text-xs">
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
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(device.last_active).toLocaleString('ru-RU')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
      </TabsContent>

      <TabsContent value="monitor">
        <ActiveDevicesMonitor />
      </TabsContent>
    </Tabs>
  );
};
