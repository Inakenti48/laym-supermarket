const TASKS_KEY = 'employee_tasks';
const TASK_REPORTS_KEY = 'task_reports';

export interface Task {
  id: string;
  employeeId: string;
  title: string;
  description: string;
  date: string;
  completed: boolean;
  photos: string[];
  needsMorePhotos: boolean;
  createdAt: string;
}

export interface TaskReport {
  id: string;
  taskId: string;
  employeeId: string;
  employeeName: string;
  title: string;
  photos: string[];
  completedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  adminNote?: string;
}

export const getTasks = (employeeId?: string): Task[] => {
  const tasksStr = localStorage.getItem(TASKS_KEY);
  if (!tasksStr) return [];
  try {
    const tasks = JSON.parse(tasksStr);
    return employeeId ? tasks.filter((t: Task) => t.employeeId === employeeId) : tasks;
  } catch {
    return [];
  }
};

export const saveTask = (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'photos' | 'needsMorePhotos'>): Task => {
  const tasks = getTasks();
  const newTask: Task = {
    ...task,
    id: Date.now().toString(),
    completed: false,
    photos: [],
    needsMorePhotos: false,
    createdAt: new Date().toISOString()
  };
  tasks.push(newTask);
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  return newTask;
};

export const updateTask = (taskId: string, updates: Partial<Task>): void => {
  const tasks = getTasks();
  const index = tasks.findIndex(t => t.id === taskId);
  if (index !== -1) {
    tasks[index] = { ...tasks[index], ...updates };
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  }
};

export const getTaskReports = (): TaskReport[] => {
  const reportsStr = localStorage.getItem(TASK_REPORTS_KEY);
  if (!reportsStr) return [];
  try {
    return JSON.parse(reportsStr);
  } catch {
    return [];
  }
};

export const saveTaskReport = (report: Omit<TaskReport, 'id' | 'status'>): TaskReport => {
  const reports = getTaskReports();
  const newReport: TaskReport = {
    ...report,
    id: Date.now().toString(),
    status: 'pending'
  };
  reports.push(newReport);
  localStorage.setItem(TASK_REPORTS_KEY, JSON.stringify(reports));
  return newReport;
};

export const updateTaskReport = (reportId: string, status: 'approved' | 'rejected', adminNote?: string): void => {
  const reports = getTaskReports();
  const index = reports.findIndex(r => r.id === reportId);
  if (index !== -1) {
    reports[index] = { ...reports[index], status, adminNote };
    localStorage.setItem(TASK_REPORTS_KEY, JSON.stringify(reports));
  }
};
