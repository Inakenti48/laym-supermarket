import { useState } from 'react';
import { Lock, LogIn, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface LoginScreenProps {
  onLogin: (code: string) => void;
}

export const LoginScreen = ({ onLogin }: LoginScreenProps) => {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 4) {
      onLogin(code);
    }
  };

  const handleCodeChange = (value: string) => {
    // Только цифры, максимум 4
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setCode(digits);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-2xl">
        <CardHeader className="space-y-4 text-center pb-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">Вход в систему</CardTitle>
            <CardDescription className="mt-2">Введите 4-значный код</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="code" className="sr-only">Код доступа</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  id="code"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="• • • •"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  className="pl-10 h-12 text-center text-2xl tracking-[0.5em] font-mono"
                  required
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-11 gap-2"
              disabled={code.length !== 4}
            >
              <LogIn className="w-5 h-5" />
              Войти
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
