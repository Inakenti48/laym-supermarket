import { Users, KeyRound } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

interface RoleSelectorProps {
  onSelectRole: (login: string) => void;
  onEmployeeLogin: () => void;
}

export const RoleSelector = ({ onSelectRole, onEmployeeLogin }: RoleSelectorProps) => {
  const [login, setLogin] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login.length === 4 && /^\d{4}$/.test(login)) {
      onSelectRole(login);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Система Учета Товаров</h1>
          <p className="text-muted-foreground">Введите 4-значный логин для входа</p>
          <div className="mt-4 p-4 bg-muted rounded-lg text-left text-sm space-y-1">
            <p className="font-semibold mb-2">Доступные логины:</p>
            <p>• 1111 - Администратор</p>
            <p>• 2222 - Кассир 1</p>
            <p>• 3333 - Кассир 2</p>
            <p>• 4444 - Товаровед</p>
          </div>
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

        <div className="mt-8 flex justify-center">
          <Button 
            onClick={onEmployeeLogin} 
            variant="outline"
            size="lg"
            className="w-full h-14 text-base font-semibold"
          >
            <Users className="h-5 w-5 mr-2" />
            Вход для сотрудников
          </Button>
        </div>
      </div>
    </div>
  );
};
