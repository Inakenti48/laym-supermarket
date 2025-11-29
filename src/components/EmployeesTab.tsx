import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Users, Edit2, Loader2, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { getCurrentLoginUserSync } from '@/lib/loginAuth';
import { getAllEmployees, insertEmployee, updateEmployee } from '@/lib/mysqlDatabase';

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
  const currentUser = getCurrentLoginUserSync();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', date: new Date().toISOString().split('T')[0] });
  
  const [employeeForm, setEmployeeForm] = useState({
    name: '', position: '', workConditions: '', schedule: 'full' as 'full' | 'piece', hourlyRate: '', customLogin: ''
  });

  const { name, position, workConditions, schedule, hourlyRate, customLogin } = employeeForm;
  const setName = (val: string) => setEmployeeForm(prev => ({ ...prev, name: val }));
  const setPosition = (val: string) => setEmployeeForm(prev => ({ ...prev, position: val }));
  const setWorkConditions = (val: string) => setEmployeeForm(prev => ({ ...prev, workConditions: val }));
  const setSchedule = (val: 'full' | 'piece') => setEmployeeForm(prev => ({ ...prev, schedule: val }));
  const setHourlyRate = (val: string) => setEmployeeForm(prev => ({ ...prev, hourlyRate: val }));
  const setCustomLogin = (val: string) => setEmployeeForm(prev => ({ ...prev, customLogin: val }));

  useEffect(() => { loadEmployees(); }, []);

  const loadEmployees = async () => {
    try {
      const data = await getAllEmployees();
      setEmployees(data.map(e => ({
        id: e.id, name: e.name, position: e.role || '', work_conditions: '', schedule: 'full',
        hourly_rate: null, login: e.login || '', created_at: e.created_at || ''
      })));
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateLogin = () => `emp${Date.now().toString().slice(-6)}`;

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
    if (!name || !position) { toast.error('Заполните имя и должность'); return; }
    try {
      const login = customLogin || generateLogin();
      if (editingId) {
        await updateEmployee(editingId, { name, role: position });
        toast.success('Сотрудник обновлён');
      } else {
        await insertEmployee({ name, role: position, login, active: true });
        toast.success(`Сотрудник добавлен! Логин: ${login}`);
      }
      resetForm();
      loadEmployees();
    } catch (error) {
      toast.error('Ошибка сохранения');
    }
  };

  const handleAddTask = async () => {
    if (!selectedEmployee || !taskForm.title.trim()) { toast.error('Заполните название'); return; }
    const { saveTask } = await import('@/lib/employees');
    saveTask({ employeeId: selectedEmployee.id, employeeName: selectedEmployee.name, ...taskForm });
    toast.success('Задание добавлено');
    setShowTaskDialog(false);
    setTaskForm({ title: '', description: '', date: new Date().toISOString().split('T')[0] });
  };

  const resetForm = () => {
    setEditingId(null);
    setEmployeeForm({ name: '', position: '', workConditions: '', schedule: 'full', hourlyRate: '', customLogin: '' });
    setShowForm(false);
  };

  if (loading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><Users className="w-5 h-5" /><h2 className="text-lg font-semibold">Сотрудники</h2></div>
        <Button onClick={() => setShowForm(!showForm)} size="sm"><Plus className="w-4 h-4 mr-1" />Добавить</Button>
      </div>

      {showForm && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-sm">{editingId ? 'Редактировать' : 'Новый сотрудник'}</h3>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
          <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Должность" />
          <Textarea value={workConditions} onChange={(e) => setWorkConditions(e.target.value)} placeholder="Условия работы" />
          <Select value={schedule} onValueChange={(v) => setSchedule(v as 'full' | 'piece')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="full">Полный день</SelectItem><SelectItem value="piece">Сдельная</SelectItem></SelectContent>
          </Select>
          {schedule === 'full' && <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="Ставка ₽/час" />}
          <Input value={customLogin} onChange={(e) => setCustomLogin(e.target.value)} placeholder="Логин" />
          <div className="flex gap-2">
            <Button onClick={handleAddEmployee} size="sm" className="flex-1">{editingId ? 'Сохранить' : 'Создать'}</Button>
            <Button onClick={resetForm} variant="outline" size="sm">Отмена</Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {employees.length === 0 ? <Card className="p-8 text-center text-muted-foreground">Нет сотрудников</Card> : 
          employees.map((emp) => (
            <Card key={emp.id} className="p-3">
              <div className="flex items-start justify-between">
                <div><h3 className="font-semibold text-sm">{emp.name}</h3><p className="text-xs text-muted-foreground">{emp.position}</p></div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setSelectedEmployee(emp); setShowTaskDialog(true); }}><ClipboardList className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleEditEmployee(emp)}><Edit2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="text-xs mt-2"><span className="text-muted-foreground">Логин:</span> <span className="font-mono">{emp.login}</span></div>
            </Card>
          ))
        }
      </div>

      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Задание для {selectedEmployee?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Название</Label><Input value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} /></div>
            <div><Label>Описание</Label><Textarea value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} /></div>
            <div><Label>Дата</Label><Input type="date" value={taskForm.date} onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>Отмена</Button>
            <Button onClick={handleAddTask}><Plus className="h-4 w-4 mr-2" />Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
