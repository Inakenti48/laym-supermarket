import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Plus, Loader2, Trash2 } from 'lucide-react';
import { signUp, AppRole } from '@/lib/firebaseAuth';
import { toast } from 'sonner';
import { firebaseDb } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface FirebaseUser {
  id: string;
  login: string;
  role: AppRole;
  name: string;
  createdAt: string;
}

export const FirebaseUserManagement = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<FirebaseUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [formData, setFormData] = useState({
    login: '',
    password: '',
    role: 'cashier' as AppRole,
    name: ''
  });

  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      const snapshot = await getDocs(collection(firebaseDb, 'users'));
      const usersList: FirebaseUser[] = snapshot.docs.map(doc => ({
        id: doc.id,
        login: doc.data().login,
        role: doc.data().role,
        name: doc.data().name,
        createdAt: doc.data().createdAt
      }));
      setUsers(usersList);
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
      toast.error('Не удалось загрузить пользователей');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.login || !formData.password) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    if (formData.password.length < 4) {
      toast.error('Пароль должен содержать минимум 4 символа');
      return;
    }

    setLoading(true);

    try {
      const { success, error } = await signUp(
        formData.login,
        formData.password,
        formData.role,
        formData.name || formData.login
      );

      if (success) {
        toast.success('Пользователь создан успешно');
        setFormData({ login: '', password: '', role: 'cashier', name: '' });
        setShowAddForm(false);
        loadUsers();
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

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Удалить пользователя "${userName}"?`)) return;

    try {
      await deleteDoc(doc(firebaseDb, 'users', userId));
      toast.success('Пользователь удален');
      loadUsers();
    } catch (error) {
      toast.error('Не удалось удалить пользователя');
      console.error(error);
    }
  };

  const getRoleBadgeVariant = (role: AppRole) => {
    switch (role) {
      case 'admin': return 'destructive';
      case 'cashier': return 'default';
      case 'cashier2': return 'default';
      case 'inventory': return 'secondary';
      default: return 'outline';
    }
  };

  const getRoleLabel = (role: AppRole) => {
    switch (role) {
      case 'admin': return 'Администратор';
      case 'cashier': return 'Кассир 1';
      case 'cashier2': return 'Кассир 2';
      case 'inventory': return 'Складской';
      case 'employee': return 'Сотрудник';
      default: return role;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Управление пользователями (Firebase)
          </h3>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить пользователя
          </Button>
        </div>

        {showAddForm && (
          <Card className="p-4 bg-muted/50 mb-6">
            <h4 className="font-medium mb-4">Новый пользователь</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="login">Логин *</Label>
                  <Input
                    id="login"
                    type="text"
                    value={formData.login}
                    onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                    placeholder="user123"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Имя</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Иван Иванов"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Пароль * (минимум 4 символа)</Label>
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
                      <SelectItem value="cashier">Кассир 1</SelectItem>
                      <SelectItem value="cashier2">Кассир 2</SelectItem>
                      <SelectItem value="inventory">Складской</SelectItem>
                      <SelectItem value="employee">Сотрудник</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

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

        {/* Список пользователей */}
        {loadingUsers ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Загрузка пользователей...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Нет пользователей</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Логин</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-mono">{user.login}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>
                    <Badge variant={getRoleBadgeVariant(user.role)}>
                      {getRoleLabel(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteUser(user.id, user.name)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};
