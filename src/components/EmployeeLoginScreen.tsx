import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onLogin: (employeeId: string, employeeName: string) => void;
}

export const EmployeeLoginScreen = ({ onLogin }: Props) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!login.trim() || !password.trim()) {
      toast.error('Введите логин и пароль');
      return;
    }

    // Проверяем в localStorage
    const employeesAuth = JSON.parse(localStorage.getItem('employees_auth') || '[]');
    const employee = employeesAuth.find((e: any) => 
      e.login === login && e.password === password
    );

    if (employee) {
      // Используем данные из localStorage напрямую
      onLogin(employee.id, employee.name);
      toast.success(`Добро пожаловать, ${employee.name}!`);
      
      // Обновляем из Supabase в фоне (необязательно)
      setTimeout(async () => {
        try {
          const { supabase } = await import('@/integrations/supabase/client');
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          
          const { data } = await supabase
            .from('employees')
            .select('id, name')
            .eq('login', login)
            .abortSignal(controller.signal)
            .maybeSingle();
          
          clearTimeout(timeoutId);
          
          if (data && (data.id !== employee.id || data.name !== employee.name)) {
            // Обновляем localStorage если данные изменились
            const updatedAuth = employeesAuth.map((e: any) => 
              e.login === login ? { ...e, id: data.id, name: data.name } : e
            );
            localStorage.setItem('employees_auth', JSON.stringify(updatedAuth));
          }
        } catch (error) {
          console.warn('Фоновое обновление данных не удалось', error);
        }
      }, 0);
    } else {
      toast.error('Неверный логин или пароль');
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
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <Button onClick={handleLogin} className="w-full">
            Войти
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
