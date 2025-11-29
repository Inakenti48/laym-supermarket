// MySQL-based employees tasks and reports with sync cache
import { mysqlRequest } from './mysqlDatabase';

export interface Task {
  id: string;
  employeeId: string;
  employeeName: string;
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

// Local cache for sync access
let tasksCache: Task[] = [];
let reportsCache: TaskReport[] = [];

// Async load from MySQL
export const loadTasks = async (employeeId?: string): Promise<Task[]> => {
  try {
    const result = await mysqlRequest<Task[]>('get_tasks', employeeId ? { employee_id: employeeId } : {});
    if (result.success && result.data) {
      tasksCache = result.data;
    }
  } catch (error) {
    console.error('Error loading tasks from MySQL:', error);
  }
  return employeeId ? tasksCache.filter(t => t.employeeId === employeeId) : tasksCache;
};

// Sync getter with background refresh
export const getTasks = (employeeId?: string): Task[] => {
  // Trigger async load in background
  loadTasks(employeeId);
  return employeeId ? tasksCache.filter(t => t.employeeId === employeeId) : tasksCache;
};

export const saveTask = async (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'photos' | 'needsMorePhotos'>): Promise<Task> => {
  const newTask: Task = {
    ...task,
    id: crypto.randomUUID(),
    completed: false,
    photos: [],
    needsMorePhotos: false,
    createdAt: new Date().toISOString()
  };
  
  tasksCache.push(newTask);
  
  // Save to MySQL in background
  mysqlRequest('save_task', { task: newTask }).catch(err =>
    console.error('Error saving task to MySQL:', err)
  );
  
  return newTask;
};

export const updateTask = (taskId: string, updates: Partial<Task>): void => {
  const index = tasksCache.findIndex(t => t.id === taskId);
  if (index !== -1) {
    tasksCache[index] = { ...tasksCache[index], ...updates };
  }
  
  // Update MySQL in background
  mysqlRequest('update_task', { id: taskId, updates }).catch(err =>
    console.error('Error updating task in MySQL:', err)
  );
};

// Async load reports
export const loadTaskReports = async (): Promise<TaskReport[]> => {
  try {
    const result = await mysqlRequest<TaskReport[]>('get_task_reports');
    if (result.success && result.data) {
      reportsCache = result.data;
    }
  } catch (error) {
    console.error('Error loading task reports from MySQL:', error);
  }
  return reportsCache;
};

// Sync getter with background refresh
export const getTaskReports = (): TaskReport[] => {
  // Trigger async load in background
  loadTaskReports();
  return reportsCache;
};

export const saveTaskReport = (report: Omit<TaskReport, 'id' | 'status'>): TaskReport => {
  const newReport: TaskReport = {
    ...report,
    id: crypto.randomUUID(),
    status: 'pending'
  };
  
  reportsCache.push(newReport);
  
  // Save to MySQL in background
  mysqlRequest('save_task_report', { report: newReport }).catch(err =>
    console.error('Error saving task report to MySQL:', err)
  );
  
  return newReport;
};

export const updateTaskReport = (reportId: string, status: 'approved' | 'rejected', adminNote?: string): void => {
  const index = reportsCache.findIndex(r => r.id === reportId);
  if (index !== -1) {
    reportsCache[index] = { ...reportsCache[index], status, adminNote };
  }
  
  // Update MySQL in background
  mysqlRequest('update_task_report', { id: reportId, status, admin_note: adminNote }).catch(err =>
    console.error('Error updating task report in MySQL:', err)
  );
};
