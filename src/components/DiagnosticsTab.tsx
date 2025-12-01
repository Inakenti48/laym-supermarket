import { useState, useEffect } from 'react';
import { Settings, Monitor, Database, Wrench, AlertTriangle, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getCurrentSession } from '@/lib/mysqlCollections';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { getDevices, saveDevice, type Device } from '@/lib/mysqlCollections';
import { ActiveDevicesMonitor } from './ActiveDevicesMonitor';
import { WiFiPrinterSettings } from './WiFiPrinterSettings';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mysqlRequest } from '@/lib/mysqlDatabase';

export const DiagnosticsTab = () => {
  const [userRole, setUserRole] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserLogin, setCurrentUserLogin] = useState<string>('');
  const [allDevices, setAllDevices] = useState<Device[]>([]);
  const [isFixingQuantity, setIsFixingQuantity] = useState(false);
  const [dbStats, setDbStats] = useState<any>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  
  // Настройки диагностики
  const [deviceName, setDeviceName] = useState(() => localStorage.getItem('device_name') || '');
  const [canSaveSingle, setCanSaveSingle] = useState(() => localStorage.getItem('can_save_single') !== 'false');
  const [canSaveQueue, setCanSaveQueue] = useState(() => localStorage.getItem('can_save_queue') !== 'false');

  // Получаем роль пользователя при загрузке
  useEffect(() => {
    const loadUserRole = () => {
      const session = getCurrentSession();
      if (session) {
        setUserRole(session.role);
        setCurrentUserId(session.userId);
        setCurrentUserLogin(session.login);
        
        // Если админ или складская - автоматически даем все права
        if (session.role === 'admin' || session.role === 'inventory') {
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
      loadDbStats();
    }
  }, [userRole]);

  const loadAllDevices = async () => {
    try {
      const devices = await getDevices();
      setAllDevices(devices);
    } catch (error) {
      console.error('Ошибка загрузки устройств:', error);
    }
  };

  const loadDbStats = async () => {
    setIsLoadingStats(true);
    try {
      const result = await mysqlRequest<any>('get_products_stats');
      if (result.success && result.data) {
        setDbStats(result.data);
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleFixZeroQuantity = async () => {
    if (!confirm('Исправить все товары с количеством 0 на количество 1?')) return;
    
    setIsFixingQuantity(true);
    try {
      const result = await mysqlRequest<{ affectedRows: number; totalProducts: number }>('fix_zero_quantity');
      if (result.success) {
        toast.success(`✅ Исправлено товаров: ${result.data?.affectedRows || 0}`);
        loadDbStats();
      } else {
        toast.error('❌ Ошибка исправления: ' + result.error);
      }
    } catch (error) {
      toast.error('❌ Ошибка соединения');
    } finally {
      setIsFixingQuantity(false);
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

    // Сохраняем в Firebase
    try {
      if (!currentUserId || !currentUserLogin || !deviceName) {
        toast.error('⚠️ Необходимо заполнить название устройства');
        return;
      }

      await saveDevice({
        user_id: currentUserId,
        user_name: currentUserLogin,
        device_name: deviceName,
        can_save_single: finalCanSaveSingle,
        can_save_queue: finalCanSaveQueue,
        last_active: new Date().toISOString(),
      });

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
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="settings" className="text-xs sm:text-sm">
          <Settings className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Настройки</span>
        </TabsTrigger>
        <TabsTrigger value="database" className="text-xs sm:text-sm">
          <Wrench className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">База</span>
        </TabsTrigger>
        <TabsTrigger value="monitor" className="text-xs sm:text-sm">
          <Monitor className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Устройства</span>
        </TabsTrigger>
        <TabsTrigger value="printer" className="text-xs sm:text-sm">
          <Database className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Принтер</span>
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

        {/* MySQL Status */}
        {userRole === 'admin' && (
          <div className="mb-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm font-medium">MySQL подключен</span>
            </div>
          </div>
        )}

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

      <TabsContent value="database" className="space-y-4">
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Инструменты базы данных
          </h3>
          
          {/* Статистика базы */}
          <div className="mb-6 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium">Статистика товаров:</h4>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadDbStats}
                disabled={isLoadingStats}
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingStats ? 'animate-spin' : ''}`} />
                Обновить
              </Button>
            </div>
            
            {dbStats ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-background rounded border">
                  <div className="text-muted-foreground">Всего товаров</div>
                  <div className="text-2xl font-bold">{dbStats.total_products || 0}</div>
                </div>
                <div className="p-3 bg-background rounded border">
                  <div className="text-muted-foreground">Общее кол-во (шт)</div>
                  <div className="text-2xl font-bold">{dbStats.total_quantity || 0}</div>
                </div>
                <div className="p-3 bg-background rounded border">
                  <div className="text-muted-foreground">Сумма закупа</div>
                  <div className="text-2xl font-bold">₽{Math.round(dbStats.total_purchase_cost || 0).toLocaleString()}</div>
                </div>
                <div className="p-3 bg-background rounded border">
                  <div className="text-muted-foreground">Сумма продажи</div>
                  <div className="text-2xl font-bold">₽{Math.round(dbStats.total_sale_value || 0).toLocaleString()}</div>
                </div>
                <div className={`p-3 rounded border ${dbStats.zero_quantity_count > 0 ? 'bg-destructive/10 border-destructive/30' : 'bg-background'}`}>
                  <div className="text-muted-foreground">С quantity=0</div>
                  <div className={`text-2xl font-bold ${dbStats.zero_quantity_count > 0 ? 'text-destructive' : ''}`}>
                    {dbStats.zero_quantity_count || 0}
                  </div>
                </div>
                <div className={`p-3 rounded border ${dbStats.low_stock_count > 0 ? 'bg-warning/10 border-warning/30' : 'bg-background'}`}>
                  <div className="text-muted-foreground">Мало на складе (&lt;10)</div>
                  <div className="text-2xl font-bold">{dbStats.low_stock_count || 0}</div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                {isLoadingStats ? 'Загрузка...' : 'Нажмите "Обновить" для загрузки статистики'}
              </div>
            )}
          </div>
          
          {/* Исправление количества */}
          {dbStats?.zero_quantity_count > 0 && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg mb-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-medium text-destructive">Обнаружены товары с quantity=0</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    {dbStats.zero_quantity_count} товаров имеют количество 0. Это может быть ошибкой при занесении.
                  </p>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    className="mt-3"
                    onClick={handleFixZeroQuantity}
                    disabled={isFixingQuantity}
                  >
                    {isFixingQuantity ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Исправление...
                      </>
                    ) : (
                      'Исправить на quantity=1'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {dbStats?.zero_quantity_count === 0 && dbStats && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                ✅ Все товары имеют корректное количество (quantity &gt; 0)
              </p>
            </div>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="monitor">
        <ActiveDevicesMonitor />
      </TabsContent>

      <TabsContent value="printer">
        <WiFiPrinterSettings />
      </TabsContent>
    </Tabs>
  );
};
