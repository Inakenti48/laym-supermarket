import { useState } from 'react';
import { Lock, LogIn, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface LoginScreenProps {
  onLogin: (password: string) => void;
}

export const LoginScreen = ({ onLogin }: LoginScreenProps) => {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(password);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Package className="w-10 h-10 text-primary" />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold">Система Учета Товаров</CardTitle>
            <CardDescription className="mt-2 text-base">Введите пароль для входа</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-base">Пароль</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11"
                  required
                  autoFocus
                />
              </div>
              <div className="text-xs text-muted-foreground mt-3 space-y-1 bg-muted/50 p-3 rounded-md">
                <p className="font-medium mb-2">Пароли для входа:</p>
                <p>• Админ: <span className="font-mono">8080</span></p>
                <p>• Склад: <span className="font-mono">4050</span></p>
                <p>• Касса 1: <span className="font-mono">1020</span></p>
                <p>• Касса 2: <span className="font-mono">2030</span></p>
              </div>
            </div>
            <Button type="submit" className="w-full h-11 gap-2 text-base">
              <LogIn className="w-5 h-5" />
              Войти в систему
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
