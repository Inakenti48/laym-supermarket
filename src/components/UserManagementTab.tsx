import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Loader2 } from 'lucide-react';
import { signUp, AppRole } from '@/lib/supabaseAuth';
import { toast } from 'sonner';

export const UserManagementTab = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: 'cashier' as AppRole,
    cashierName: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    if (formData.password.length < 6) {
      toast.error('Пароль должен содержать минимум 6 символов');
      return;
    }

    if ((formData.role === 'cashier' || formData.role === 'cashier2') && !formData.cashierName) {
      toast.error('Укажите имя кассира');
      return;
    }

    setLoading(true);

    try {
      const { success, error } = await signUp(
        formData.email,
        formData.password,
        formData.role,
        formData.cashierName || undefined
      );

      if (success) {
        toast.success('Пользователь создан успешно');
        setFormData({ email: '', password: '', role: 'cashier', cashierName: '' });
        setShowAddForm(false);
      } else {
        toast.error(error || 'Ошибка создания пользователя');
      }
    } catch (error) {
      toast.error('Ошибка создания пользователя');
      console.error('Ошибка:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Управление пользователями
          </h3>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить пользователя
          </Button>
        </div>

        {showAddForm && (
          <Card className="p-4 bg-muted/50">
            <h4 className="font-medium mb-4">Новый пользователь</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="user@example.com"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Пароль * (минимум 6 символов)</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Роль *</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value as AppRole })}
                  disabled={loading}
                >
                  <SelectTrigger id="role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Администратор</SelectItem>
                    <SelectItem value="cashier">Касса 1</SelectItem>
                    <SelectItem value="cashier2">Касса 2</SelectItem>
                    <SelectItem value="inventory">Складской</SelectItem>
                    <SelectItem value="employee">Сотрудник</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(formData.role === 'cashier' || formData.role === 'cashier2') && (
                <div className="space-y-2">
                  <Label htmlFor="cashierName">Имя кассира *</Label>
                  <Input
                    id="cashierName"
                    value={formData.cashierName}
                    onChange={(e) => setFormData({ ...formData, cashierName: e.target.value })}
                    placeholder="Иван Иванов"
                    disabled={loading}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Создать
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                  disabled={loading}
                >
                  Отмена
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="mt-6">
          <p className="text-sm text-muted-foreground">
            Пользователи смогут войти в систему используя созданный email и пароль. 
            Доступ к функциям будет определяться назначенной ролью.
          </p>
        </div>
      </Card>
    </div>
  );
};
