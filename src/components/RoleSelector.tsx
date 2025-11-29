import { Users, KeyRound, Flame } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { initFirebaseUsers } from '@/lib/mysqlCollections';
import { toast } from 'sonner';

interface RoleSelectorProps {
  onSelectRole: (login: string) => void;
  onEmployeeLogin: () => void;
}

export const RoleSelector = ({ onSelectRole, onEmployeeLogin }: RoleSelectorProps) => {
  const [login, setLogin] = useState('');
  const [initLoading, setInitLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login.length === 4 && /^\d{4}$/.test(login)) {
      onSelectRole(login);
    }
  };

  const handleInitFirebase = async () => {
    setInitLoading(true);
    try {
      const result = await initFirebaseUsers();
      if (result.success) {
        toast.success(`✅ ${result.message}`);
      } else {
        toast.error(`❌ ${result.message}`);
      }
    } catch (error: any) {
      toast.error(`❌ Ошибка: ${error.message}`);
    }
    setInitLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Система Учета Товаров</h1>
          <p className="text-muted-foreground">Введите 4-значный логин для входа</p>
        </div>
        
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <KeyRound className="w-8 h-8 text-primary" />
            </div>
            <CardTitle>Вход в систему</CardTitle>
            <CardDescription>Введите ваш 4-значный логин</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login">Логин</Label>
                <Input
                  id="login"
                  type="text"
                  placeholder="0000"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  maxLength={4}
                  className="text-center text-2xl tracking-widest"
                  autoFocus
                />
              </div>
              <Button 
                type="submit" 
                className="w-full"
                disabled={login.length !== 4 || !/^\d{4}$/.test(login)}
              >
                Войти
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-8 space-y-3">
          <Button 
            onClick={onEmployeeLogin} 
            variant="outline"
            size="lg"
            className="w-full h-14 text-base font-semibold"
          >
            <Users className="h-5 w-5 mr-2" />
            Вход для сотрудников
          </Button>
          
          <Button 
            onClick={handleInitFirebase}
            disabled={initLoading}
            variant="ghost"
            size="sm"
            className="w-full text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
          >
            <Flame className="h-4 w-4 mr-2" />
            {initLoading ? 'Создание...' : 'Инициализировать MySQL'}
          </Button>
        </div>
      </div>
    </div>
  );
};
