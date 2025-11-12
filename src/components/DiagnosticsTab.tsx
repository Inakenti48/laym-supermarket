import { useState, useEffect } from 'react';
import { Settings, Monitor } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getCurrentLoginUser } from '@/lib/loginAuth';
import { supabase } from '@/integrations/supabase/client';

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
  const [loading, setLoading] = useState(false);
  
  // Настройки диагностики
  const [deviceName, setDeviceName] = useState(() => localStorage.getItem('device_name') || '');
  const [canSaveSingle, setCanSaveSingle] = useState(() => localStorage.getItem('can_save_single') !== 'false');
  const [canSaveQueue, setCanSaveQueue] = useState(() => localStorage.getItem('can_save_queue') !== 'false');

  // Получаем роль пользователя и загружаем устройство
  useEffect(() => {
    const loadUserData = async () => {
      const user = await getCurrentLoginUser();
      if (user) {
        setUserRole(user.role);
        setCurrentUserId(user.id);
        setCurrentUserLogin(user.login);
        
        // Загружаем данные устройства из БД
        await loadDeviceFromDB(user.id);
        
        // Если админ, загружаем все устройства
        if (user.role === 'admin') {
          await loadAllDevices();
        }
      }
    };
    loadUserData();
  }, []);

  const loadDeviceFromDB = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setDeviceName(data.device_name);
        setCanSaveSingle(data.can_save_single);
        setCanSaveQueue(data.can_save_queue);
        
        // Обновляем localStorage
        localStorage.setItem('device_name', data.device_name);
        localStorage.setItem('can_save_single', String(data.can_save_single));
        localStorage.setItem('can_save_queue', String(data.can_save_queue));
      }
    } catch (error) {
      console.error('Ошибка загрузки данных устройства:', error);
    }
  };

  const loadAllDevices = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('last_active', { ascending: false });

      if (error) throw error;
      
      setAllDevices(data || []);
    } catch (error) {
      console.error('Ошибка загрузки списка устройств:', error);
      toast.error('Не удалось загрузить список устройств');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!currentUserId || !currentUserLogin) {
      toast.error('Пользователь не авторизован');
      return;
    }

    try {
      setLoading(true);
      
      // Проверяем, существует ли запись для этого пользователя
      const { data: existingDevice } = await supabase
        .from('devices')
        .select('id')
        .eq('user_id', currentUserId)
        .maybeSingle();

      if (existingDevice) {
        // Обновляем существующую запись
        const { error } = await supabase
          .from('devices')
          .update({
            device_name: deviceName,
            can_save_single: canSaveSingle,
            can_save_queue: canSaveQueue,
            last_active: new Date().toISOString()
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
            can_save_single: canSaveSingle,
            can_save_queue: canSaveQueue
          });

        if (error) throw error;
      }

      // Обновляем localStorage
      localStorage.setItem('device_name', deviceName);
      localStorage.setItem('can_save_single', String(canSaveSingle));
      localStorage.setItem('can_save_queue', String(canSaveQueue));
      
      toast.success('✅ Настройки сохранены');
      
      // Если админ, обновляем список всех устройств
      if (userRole === 'admin') {
        await loadAllDevices();
      }
    } catch (error) {
      console.error('Ошибка сохранения настроек:', error);
      toast.error('Не удалось сохранить настройки');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
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
          
          <div className="flex items-start gap-3 p-3 border rounded-lg">
            <input
              type="checkbox"
              id="canSaveSingle"
              checked={canSaveSingle}
              onChange={(e) => setCanSaveSingle(e.target.checked)}
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
              checked={canSaveQueue}
              onChange={(e) => setCanSaveQueue(e.target.checked)}
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
          disabled={loading}
        >
          {loading ? 'Сохранение...' : 'Сохранить настройки'}
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
      {userRole === 'admin' && (
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Все устройства в системе
          </h3>

          {loading && (
            <div className="text-center py-4 text-muted-foreground">
              Загрузка...
            </div>
          )}

          {!loading && allDevices.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              Нет зарегистрированных устройств
            </div>
          )}

          {!loading && allDevices.length > 0 && (
            <div className="space-y-3">
              {allDevices.map((device) => (
                <div 
                  key={device.id} 
                  className="p-3 border rounded-lg bg-muted/20"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <div className="text-sm font-medium mb-1">
                        {device.device_name || 'Устройство без имени'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Пользователь: {device.user_name}
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={device.can_save_single ? 'text-green-600' : 'text-red-600'}>
                          {device.can_save_single ? '✅' : '❌'}
                        </span>
                        <span>Сохранение в одиночку</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={device.can_save_queue ? 'text-green-600' : 'text-red-600'}>
                          {device.can_save_queue ? '✅' : '❌'}
                        </span>
                        <span>Добавление в очередь</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                    Последняя активность: {new Date(device.last_active).toLocaleString('ru-RU')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
