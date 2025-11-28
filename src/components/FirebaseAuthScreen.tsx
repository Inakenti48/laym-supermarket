import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Package, Loader2 } from 'lucide-react';
import { signIn } from '@/lib/firebaseAuth';
import { toast } from 'sonner';

interface FirebaseAuthScreenProps {
  onSuccess: () => void;
}

export const FirebaseAuthScreen = ({ onSuccess }: FirebaseAuthScreenProps) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!login || !password) {
      toast.error('Заполните логин и пароль');
      return;
    }

    setLoading(true);

    try {
      const { success, error, user } = await signIn(login, password);
      
      if (success && user) {
        toast.success(`Добро пожаловать, ${user.name}!`);
        onSuccess();
      } else {
        toast.error(error || 'Ошибка входа');
      }
    } catch (error: any) {
      toast.error('Ошибка подключения');
      console.error('Ошибка входа:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <Package className="h-16 w-16 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Система Учета Товаров</h1>
          <p className="text-muted-foreground">Войдите в систему (Firebase)</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login">Логин</Label>
            <Input
              id="login"
              type="text"
              placeholder="admin"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Войти
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          <p>Для получения доступа обратитесь к администратору</p>
        </div>
      </Card>
    </div>
  );
};
