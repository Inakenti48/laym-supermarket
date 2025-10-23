import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { getTasks, updateTask, saveTaskReport, type Task, type TaskReport } from '@/lib/employees';
import { getEmployees } from '@/lib/auth';
import { Camera, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  employeeId: string;
}

export const EmployeeWorkTab = ({ employeeId }: Props) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [needsMore, setNeedsMore] = useState(false);

  const employee = getEmployees().find(e => e.id === employeeId);

  useEffect(() => {
    loadTasks();
  }, [employeeId]);

  const loadTasks = () => {
    const allTasks = getTasks(employeeId);
    setTasks(allTasks);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const maxPhotos = needsMore ? 5 : 2;
    if (photos.length + files.length > maxPhotos) {
      toast.error(`Максимум ${maxPhotos} фото`);
      return;
    }

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotos(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmitTask = (task: Task) => {
    if (photos.length === 0) {
      toast.error('Прикрепите хотя бы одно фото');
      return;
    }

    // Update task
    updateTask(task.id, {
      completed: true,
      photos,
      needsMorePhotos: needsMore
    });

    // Create report
    saveTaskReport({
      taskId: task.id,
      employeeId: task.employeeId,
      employeeName: employee?.name || '',
      title: task.title,
      photos,
      completedAt: new Date().toISOString()
    });

    toast.success('Задание отправлено на проверку');
    setPhotos([]);
    setNeedsMore(false);
    setSelectedTask(null);
    loadTasks();
  };

  const todaysTasks = tasks.filter(t => 
    t.date === new Date().toISOString().split('T')[0] && !t.completed
  );

  const completedTasks = tasks.filter(t => t.completed);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Мои задания</h2>
        <p className="text-sm text-muted-foreground">
          Привет, {employee?.name}! ({employee?.position})
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Задания на сегодня</h3>
        {todaysTasks.length === 0 ? (
          <Card className="p-4 text-center text-sm text-muted-foreground">
            Нет заданий на сегодня
          </Card>
        ) : (
          todaysTasks.map((task) => (
            <Card key={task.id} className="p-3 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm">{task.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                </div>
                <Checkbox
                  checked={selectedTask?.id === task.id}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedTask(task);
                    } else {
                      setSelectedTask(null);
                      setPhotos([]);
                      setNeedsMore(false);
                    }
                  }}
                />
              </div>

              {selectedTask?.id === task.id && (
                <div className="space-y-3 pt-3 border-t">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium">
                        Фото работы (до {needsMore ? '5' : '2'})
                      </label>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={needsMore}
                          onCheckedChange={(checked) => setNeedsMore(checked as boolean)}
                          id="needs-more"
                        />
                        <label htmlFor="needs-more" className="text-xs">
                          Больше фото (до 5)
                        </label>
                      </div>
                    </div>

                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      className="hidden"
                      id={`photo-${task.id}`}
                    />
                    <label htmlFor={`photo-${task.id}`}>
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <span>
                          <Camera className="w-4 h-4 mr-2" />
                          Прикрепить фото ({photos.length}/{needsMore ? '5' : '2'})
                        </span>
                      </Button>
                    </label>

                    {photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {photos.map((photo, idx) => (
                          <img
                            key={idx}
                            src={photo}
                            alt={`Фото ${idx + 1}`}
                            className="w-full h-20 object-cover rounded"
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <Button 
                    onClick={() => handleSubmitTask(task)}
                    className="w-full"
                    size="sm"
                    disabled={photos.length === 0}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Отправить на проверку
                  </Button>
                </div>
              )}
            </Card>
          ))
        )}
      </div>

      {completedTasks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Выполненные задания</h3>
          {completedTasks.map((task) => (
            <Card key={task.id} className="p-3 bg-muted/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">Отправлено на проверку</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
