import { useState, useEffect } from 'react';
import { Settings } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getCurrentLoginUser } from '@/lib/loginAuth';

export const DiagnosticsTab = () => {
  const [userRole, setUserRole] = useState<string>('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserLogin, setCurrentUserLogin] = useState<string>('');
  
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
      }
    };
    loadUserRole();
  }, []);

  const handleSaveSettings = () => {
    localStorage.setItem('device_name', deviceName);
    localStorage.setItem('can_save_single', String(canSaveSingle));
    localStorage.setItem('can_save_queue', String(canSaveQueue));
    toast.success('✅ Настройки сохранены');
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
    </div>
  );
};
