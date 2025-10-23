import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { getEmployees, saveEmployee, type Employee } from '@/lib/auth';
import { saveTask } from '@/lib/employees';
import { Plus, Users } from 'lucide-react';
import { toast } from 'sonner';

export const EmployeesTab = () => {
  const [employees, setEmployees] = useState<Employee[]>(getEmployees());
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [workConditions, setWorkConditions] = useState('');
  const [schedule, setSchedule] = useState<'full' | 'piece'>('full');
  const [hourlyRate, setHourlyRate] = useState('');

  const generateLogin = () => {
    const timestamp = Date.now().toString().slice(-6);
    return `emp${timestamp}`;
  };

  const handleAddEmployee = () => {
    if (!name || !position || !workConditions) {
      toast.error('Заполните все поля');
      return;
    }

    const login = generateLogin();
    const employee = saveEmployee({
      name,
      position,
      workConditions,
      schedule,
      hourlyRate: schedule === 'full' ? parseFloat(hourlyRate) : undefined,
      login
    });

    setEmployees(getEmployees());
    toast.success(`Сотрудник добавлен. Логин: ${login}`);
    
    // Reset form
    setName('');
    setPosition('');
    setWorkConditions('');
    setSchedule('full');
    setHourlyRate('');
    setShowForm(false);
  };

  const handleAddTask = (employeeId: string, employeeName: string) => {
    const title = prompt('Название задания:');
    const description = prompt('Описание задания:');
    
    if (title && description) {
      saveTask({
        employeeId,
        title,
        description,
        date: new Date().toISOString().split('T')[0]
      });
      toast.success('Задание добавлено');
    }
  };

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
          <h3 className="font-semibold text-sm">Новый сотрудник</h3>
          
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

          <div className="flex gap-2">
            <Button onClick={handleAddEmployee} size="sm" className="flex-1">
              Создать
            </Button>
            <Button onClick={() => setShowForm(false)} variant="outline" size="sm">
              Отмена
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {employees.map((employee) => (
          <Card key={employee.id} className="p-3">
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-sm">{employee.name}</h3>
                  <p className="text-xs text-muted-foreground">{employee.position}</p>
                </div>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => handleAddTask(employee.id, employee.name)}
                  className="text-xs"
                >
                  Добавить задание
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
                {employee.hourlyRate && (
                  <div>
                    <span className="text-muted-foreground">Ставка:</span>
                    <span className="ml-1">{employee.hourlyRate} ₽/час</span>
                  </div>
                )}
              </div>
              
              <p className="text-xs text-muted-foreground">{employee.workConditions}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
