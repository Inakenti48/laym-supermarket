import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Package, Shield, ShoppingCart, User, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AuthScreenProps {
  onSuccess: () => void;
}

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
}

const roleIcons = {
  admin: Shield,
  cashier: ShoppingCart,
  cashier2: ShoppingCart,
  inventory: Package,
  employee: User,
};

const roleColors = {
  admin: 'text-primary',
  cashier: 'text-secondary',
  cashier2: 'text-green-500',
  inventory: 'text-accent-foreground',
  employee: 'text-muted-foreground',
};

const roleTitles = {
  admin: 'Администратор',
  cashier: 'Касса 1',
  cashier2: 'Касса 2',
  inventory: 'Складской',
  employee: 'Сотрудник',
};

export const AuthScreen = ({ onSuccess }: AuthScreenProps) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data: profilesData, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name')
        .order('full_name');

      if (error) throw error;

      const usersWithRoles = await Promise.all(
        (profilesData || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .single();

          return {
            id: profile.id,
            user_id: profile.user_id,
            full_name: profile.full_name || 'Без имени',
            role: roleData?.role || 'employee',
          };
        })
      );

      setUsers(usersWithRoles);
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
      toast.error('Ошибка загрузки пользователей');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (userId: string) => {
    setSelectedUserId(userId);
    
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;

      // Вызываем edge function для безпарольного входа
      const { data, error } = await supabase.functions.invoke('passwordless-signin', {
        body: { user_id: user.user_id }
      });

      if (error || !data?.access_token) {
        toast.error('Ошибка входа. Обратитесь к администратору.');
        console.error('Ошибка входа:', error);
        setSelectedUserId(null);
        return;
      }

      // Устанавливаем сессию с полученными токенами
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (sessionError) {
        toast.error('Ошибка создания сессии');
        console.error('Ошибка сессии:', sessionError);
        setSelectedUserId(null);
        return;
      }

      toast.success(`Добро пожаловать, ${user.full_name}!`);
      onSuccess();
    } catch (error) {
      console.error('Ошибка входа:', error);
      toast.error('Ошибка подключения');
      setSelectedUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-secondary/20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Package className="h-16 w-16 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-2">Система Учета Товаров</h1>
          <p className="text-muted-foreground">Выберите пользователя для входа</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {users.map((user) => {
            const Icon = roleIcons[user.role as keyof typeof roleIcons] || User;
            const color = roleColors[user.role as keyof typeof roleColors] || 'text-muted-foreground';
            const title = roleTitles[user.role as keyof typeof roleTitles] || user.role;
            
            return (
              <Card
                key={user.id}
                className="cursor-pointer hover:shadow-lg transition-all hover:scale-105"
                onClick={() => handleSelectUser(user.id)}
              >
                <CardHeader className="text-center">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    {selectedUserId === user.id ? (
                      <Loader2 className={`w-8 h-8 ${color} animate-spin`} />
                    ) : (
                      <Icon className={`w-8 h-8 ${color}`} />
                    )}
                  </div>
                  <CardTitle className="text-lg">{user.full_name}</CardTitle>
                  <CardDescription>{title}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        {users.length === 0 && (
          <div className="text-center text-muted-foreground">
            <p>Нет доступных пользователей. Обратитесь к администратору.</p>
          </div>
        )}
      </div>
    </div>
  );
};
