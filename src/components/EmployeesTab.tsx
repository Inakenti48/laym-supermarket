import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Users, Edit2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUser } from '@/lib/auth';

interface Employee {
  id: string;
  name: string;
  position: string;
  work_conditions: string;
  schedule: string;
  hourly_rate: number | null;
  login: string;
  created_at: string;
}

export const EmployeesTab = () => {
  const currentUser = getCurrentUser();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [workConditions, setWorkConditions] = useState('');
  const [schedule, setSchedule] = useState<'full' | 'piece'>('full');
  const [hourlyRate, setHourlyRate] = useState('');
  const [customLogin, setCustomLogin] = useState('');

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error: any) {
      console.error('Error loading employees:', error);
      toast.error('Ошибка загрузки сотрудников');
    } finally {
      setLoading(false);
    }
  };

  const generateLogin = () => {
    const timestamp = Date.now().toString().slice(-6);
    return `emp${timestamp}`;
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingId(employee.id);
    setName(employee.name);
    setPosition(employee.position);
    setWorkConditions(employee.work_conditions);
    setSchedule(employee.schedule as 'full' | 'piece');
    setHourlyRate(employee.hourly_rate?.toString() || '');
    setCustomLogin(employee.login);
    setShowForm(true);
  };

  const handleAddEmployee = async () => {
    if (!name || !position || !workConditions) {
      toast.error('Заполните все поля');
      return;
    }

    try {
      if (editingId) {
        const { error } = await supabase
          .from('employees')
          .update({
            name,
            position,
            work_conditions: workConditions,
            schedule,
            hourly_rate: schedule === 'full' ? parseFloat(hourlyRate) : null,
            login: customLogin || generateLogin()
          })
          .eq('id', editingId);

        if (error) throw error;
        toast.success('Сотрудник обновлён');
      } else {
        const login = customLogin || generateLogin();
        const { error } = await supabase
          .from('employees')
          .insert({
            name,
            position,
            work_conditions: workConditions,
            schedule,
            hourly_rate: schedule === 'full' ? parseFloat(hourlyRate) : null,
            login,
            created_by: null
          });

        if (error) throw error;
        toast.success(`Сотрудник добавлен. Логин: ${login}`);
      }

      // Добавляем лог
      await supabase.from('system_logs').insert({
        user_id: null,
        user_name: currentUser?.username || 'Неизвестно',
        message: editingId 
          ? `Обновлён сотрудник: ${name}` 
          : `Добавлен сотрудник: ${name} (${customLogin || generateLogin()})`
      });

      resetForm();
      loadEmployees();
    } catch (error: any) {
      console.error('Error saving employee:', error);
      toast.error('Ошибка сохранения сотрудника');
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setPosition('');
    setWorkConditions('');
    setSchedule('full');
    setHourlyRate('');
    setCustomLogin('');
    setShowForm(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          <h2 className="text-lg font-semibold">Сотрудники</h2>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="w-4 h-4 mr-1" />
          Добавить
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">{editingId ? 'Редактировать сотрудника' : 'Новый сотрудник'}</h3>
          
          <div className="space-y-2">
            <Label className="text-xs">Имя</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван Иванов"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Должность</Label>
            <Input
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Грузчик"
              className="text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Условия работы</Label>
            <Textarea
              value={workConditions}
              onChange={(e) => setWorkConditions(e.target.value)}
              placeholder="Описание условий работы"
              className="text-sm min-h-[80px]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">График работы</Label>
            <Select value={schedule} onValueChange={(v) => setSchedule(v as 'full' | 'piece')}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Полный день</SelectItem>
                <SelectItem value="piece">Сдельная</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {schedule === 'full' && (
            <div className="space-y-2">
              <Label className="text-xs">Плата за час (₽)</Label>
              <Input
                type="number"
                value={hourlyRate}
                onChange={(e) => setHourlyRate(e.target.value)}
                placeholder="200"
                className="text-sm"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Логин {!editingId && '(оставьте пустым для авто-генерации)'}</Label>
            <Input
              value={customLogin}
              onChange={(e) => setCustomLogin(e.target.value)}
              placeholder="emp123456"
              className="text-sm font-mono"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAddEmployee} size="sm" className="flex-1">
              {editingId ? 'Сохранить' : 'Создать'}
            </Button>
            <Button onClick={resetForm} variant="outline" size="sm">
              Отмена
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {employees.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            Нет сотрудников
          </Card>
        ) : (
          employees.map((employee) => (
            <Card key={employee.id} className="p-3">
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-sm">{employee.name}</h3>
                    <p className="text-xs text-muted-foreground">{employee.position}</p>
                  </div>
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={() => handleEditEmployee(employee)}
                    className="text-xs"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Логин:</span>
                    <span className="ml-1 font-mono">{employee.login}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">График:</span>
                    <span className="ml-1">{employee.schedule === 'full' ? 'Полный день' : 'Сдельная'}</span>
                  </div>
                  {employee.hourly_rate && (
                    <div>
                      <span className="text-muted-foreground">Ставка:</span>
                      <span className="ml-1">{employee.hourly_rate} ₽/час</span>
                    </div>
                  )}
                </div>
                
                <p className="text-xs text-muted-foreground">{employee.work_conditions}</p>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};