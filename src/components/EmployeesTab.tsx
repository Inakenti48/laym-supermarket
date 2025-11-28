import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Users, Edit2, Loader2, ClipboardList, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { firebaseDb } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getCurrentLoginUserSync } from '@/lib/loginAuth';
import { FirebaseUserManagement } from './FirebaseUserManagement';

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
  const [taskForm, setTaskForm] = useState({ 
    title: '', 
    description: '', 
    date: new Date().toISOString().split('T')[0] 
  });
  
  const [employeeForm, setEmployeeForm] = useState(() => {
    const saved = localStorage.getItem('employee_form_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          name: '',
          position: '',
          workConditions: '',
          schedule: 'full' as 'full' | 'piece',
          hourlyRate: '',
          customLogin: ''
        };
      }
    }
    return {
      name: '',
      position: '',
      workConditions: '',
      schedule: 'full' as 'full' | 'piece',
      hourlyRate: '',
      customLogin: ''
    };
  });

  const name = employeeForm.name;
  const position = employeeForm.position;
  const workConditions = employeeForm.workConditions;
  const schedule = employeeForm.schedule;
  const hourlyRate = employeeForm.hourlyRate;
  const customLogin = employeeForm.customLogin;

  const setName = (val: string) => setEmployeeForm(prev => ({ ...prev, name: val }));
  const setPosition = (val: string) => setEmployeeForm(prev => ({ ...prev, position: val }));
  const setWorkConditions = (val: string) => setEmployeeForm(prev => ({ ...prev, workConditions: val }));
  const setSchedule = (val: 'full' | 'piece') => setEmployeeForm(prev => ({ ...prev, schedule: val }));
  const setHourlyRate = (val: string) => setEmployeeForm(prev => ({ ...prev, hourlyRate: val }));
  const setCustomLogin = (val: string) => setEmployeeForm(prev => ({ ...prev, customLogin: val }));

  // Сохраняем форму сотрудника при изменении
  useEffect(() => {
    localStorage.setItem('employee_form_data', JSON.stringify(employeeForm));
  }, [employeeForm]);

  useEffect(() => {
    loadEmployees();

    // Firebase realtime подписка
    const unsubscribe = onSnapshot(
      collection(firebaseDb, 'employees'),
      (snapshot) => {
        const employeesList: Employee[] = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || '',
          position: doc.data().position || '',
          work_conditions: doc.data().work_conditions || '',
          schedule: doc.data().schedule || 'full',
          hourly_rate: doc.data().hourly_rate || null,
          login: doc.data().login || '',
          created_at: doc.data().created_at || new Date().toISOString()
        }));
        setEmployees(employeesList);
        setLoading(false);
      },
      (error) => {
        console.error('Firebase employees error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const loadEmployees = async () => {
    try {
      const q = query(collection(firebaseDb, 'employees'), orderBy('created_at', 'desc'));
      const snapshot = await getDocs(q);
      
      const employeesList: Employee[] = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || '',
        position: doc.data().position || '',
        work_conditions: doc.data().work_conditions || '',
        schedule: doc.data().schedule || 'full',
        hourly_rate: doc.data().hourly_rate || null,
        login: doc.data().login || '',
        created_at: doc.data().created_at || new Date().toISOString()
      }));
      
      setEmployees(employeesList);
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
        const newLogin = customLogin || generateLogin();
        
        await updateDoc(doc(firebaseDb, 'employees', editingId), {
          name,
          position,
          work_conditions: workConditions,
          schedule,
          hourly_rate: schedule === 'full' ? parseFloat(hourlyRate) : null,
          login: newLogin
        });
        
        // Обновляем данные в employees_auth
        const employeesAuth = JSON.parse(localStorage.getItem('employees_auth') || '[]');
        const index = employeesAuth.findIndex((e: any) => e.id === editingId);
        if (index !== -1) {
          employeesAuth[index] = { 
            ...employeesAuth[index], 
            login: newLogin, 
            name 
          };
          localStorage.setItem('employees_auth', JSON.stringify(employeesAuth));
        }
        
        toast.success('Сотрудник обновлён');
      } else {
        const login = customLogin || generateLogin();
        const password = Math.random().toString(36).slice(-8);
        
        const docRef = await addDoc(collection(firebaseDb, 'employees'), {
          name,
          position,
          work_conditions: workConditions,
          schedule,
          hourly_rate: schedule === 'full' ? parseFloat(hourlyRate) : null,
          login,
          created_at: new Date().toISOString()
        });
        
        // Сохраняем пароль в localStorage для входа сотрудников
        const employeesAuth = JSON.parse(localStorage.getItem('employees_auth') || '[]');
        employeesAuth.push({ 
          id: docRef.id, 
          login, 
          password, 
          name 
        });
        localStorage.setItem('employees_auth', JSON.stringify(employeesAuth));
        
        toast.success(`Сотрудник добавлен!\nЛогин: ${login}\nПароль: ${password}`, { duration: 10000 });
      }

      // Добавляем лог в Firebase
      await addDoc(collection(firebaseDb, 'system_logs'), {
        user_name: currentUser?.username || 'Неизвестно',
        message: editingId 
          ? `Обновлён сотрудник: ${name}` 
          : `Добавлен сотрудник: ${name} (${customLogin || generateLogin()})`,
        created_at: new Date().toISOString()
      });

      resetForm();
    } catch (error: any) {
      console.error('Error saving employee:', error);
      toast.error('Ошибка сохранения сотрудника');
    }
  };

  const handleAddTask = async () => {
    if (!selectedEmployee || !taskForm.title.trim()) {
      toast.error('Заполните все поля');
      return;
    }

    const { saveTask } = await import('@/lib/employees');
    saveTask({
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.name,
      title: taskForm.title,
      description: taskForm.description,
      date: taskForm.date
    });

    toast.success('Задание добавлено');
    setShowTaskDialog(false);
    setTaskForm({ title: '', description: '', date: new Date().toISOString().split('T')[0] });
    setSelectedEmployee(null);
  };

  const resetForm = () => {
    setEditingId(null);
    setEmployeeForm({
      name: '',
      position: '',
      workConditions: '',
      schedule: 'full',
      hourlyRate: '',
      customLogin: ''
    });
    localStorage.removeItem('employee_form_data');
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
      <Tabs defaultValue="employees" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="employees" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Сотрудники
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Пользователи системы
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="mt-4">
          <div className="space-y-4">
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
                        <div className="flex gap-1">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => {
                              setSelectedEmployee(employee);
                              setShowTaskDialog(true);
                            }}
                            className="text-xs"
                            title="Добавить задание"
                          >
                            <ClipboardList className="h-3 w-3" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => handleEditEmployee(employee)}
                            className="text-xs"
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                        </div>
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
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <FirebaseUserManagement />
        </TabsContent>
      </Tabs>

      {/* Диалог добавления задания */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить задание для {selectedEmployee?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title">Название задания</Label>
              <Input
                id="task-title"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="Например: Протереть полки"
              />
            </div>

            <div>
              <Label htmlFor="task-description">Описание</Label>
              <Textarea
                id="task-description"
                value={taskForm.description}
                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="Подробное описание задания..."
                rows={4}
              />
            </div>

            <div>
              <Label htmlFor="task-date">Дата выполнения</Label>
              <Input
                id="task-date"
                type="date"
                value={taskForm.date}
                onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
              Отмена
            </Button>
            <Button onClick={handleAddTask}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить задание
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
