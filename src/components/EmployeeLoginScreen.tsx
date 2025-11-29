import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getAllEmployees } from '@/lib/mysqlDatabase';

interface Props {
  onLogin: (employeeId: string, employeeName: string) => void;
}

export const EmployeeLoginScreen = ({ onLogin }: Props) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!login.trim() || !password.trim()) {
      toast.error('Введите логин и пароль');
      return;
    }

    setIsLoading(true);

    try {
      // Получаем сотрудников из MySQL
      const employees = await getAllEmployees();
      
      const employee = employees.find((e: any) => 
        e.login === login && e.password_hash === password && e.active
      );

      if (employee) {
        onLogin(employee.id, employee.name);
        toast.success(`Добро пожаловать, ${employee.name}!`);
      } else {
        toast.error('Неверный логин или пароль');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Ошибка подключения к базе данных');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <User className="w-8 h-8 text-primary" />
          </div>
          <CardTitle>Вход для сотрудников</CardTitle>
          <CardDescription>Введите ваш логин и пароль</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="login">Логин</Label>
            <Input
              id="login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="Ваш логин"
              autoComplete="username"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ваш пароль"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleLogin()}
              disabled={isLoading}
            />
          </div>

          <Button onClick={handleLogin} className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Вход...
              </>
            ) : (
              'Войти'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
