import { useState } from 'react';
import { Shield, User, Lock, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { UserRole } from '@/lib/auth';

interface LoginScreenProps {
  role: UserRole;
  onLogin: (username: string, role: UserRole, cashierName?: string) => void;
  onCancel: () => void;
}

const roleInfo = {
  admin: {
    title: 'Вход Администратора',
    description: 'Полный доступ к системе управления',
    icon: Shield,
    color: 'text-primary'
  },
  cashier: {
    title: 'Вход Кассира',
    description: 'Доступ к кассовым операциям',
    icon: User,
    color: 'text-secondary'
  },
  inventory: {
    title: 'Вход Складского',
    description: 'Управление складом и товарами',
    icon: User,
    color: 'text-accent-foreground'
  },
  employee: {
    title: 'Вход Сотрудника',
    description: 'Доступ к заданиям',
    icon: User,
    color: 'text-muted-foreground'
  }
};

export const LoginScreen = ({ role, onLogin, onCancel }: LoginScreenProps) => {
  const [username, setUsername] = useState('');
  const [cashierName, setCashierName] = useState('');
  const info = roleInfo[role];
  const Icon = info.icon;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (role === 'cashier') {
      onLogin(username, role, cashierName);
    } else {
      onLogin(username, role);
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className={`w-8 h-8 ${info.color}`} />
          </div>
          <div>
            <CardTitle className="text-2xl">{info.title}</CardTitle>
            <CardDescription className="mt-2">{info.description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Логин</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="username"
                  type="text"
                  placeholder="Введите логин"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>
            {role === 'cashier' && (
              <div className="space-y-2">
                <Label htmlFor="cashierName">Ваше имя</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="cashierName"
                    type="text"
                    placeholder="Введите ваше имя"
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    className="pl-9"
                    required
                  />
                </div>
              </div>
            )}
            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
                Отмена
              </Button>
              <Button type="submit" className="flex-1 gap-2">
                <LogIn className="w-4 h-4" />
                Войти
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
