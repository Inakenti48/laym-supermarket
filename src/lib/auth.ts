// Firebase версия auth (без Supabase)

export type UserRole = 'admin' | 'cashier' | 'cashier2' | 'inventory' | 'employee';

interface User {
  role: UserRole;
  username: string;
  cashierName?: string;
  employeeId?: string;
}

const STORAGE_KEY = 'inventory_user';
const LOGS_KEY = 'system_logs';
const LOGIN_TIME_KEY = 'last_login_time';
const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах

export const login = async (
  username: string, 
  role: UserRole, 
  cashierName?: string,
  employeeId?: string,
  skipPasswordCheck?: boolean
): Promise<boolean> => {
  let isValid = false;

  // Если передан флаг skipPasswordCheck, пропускаем проверку пароля
  if (skipPasswordCheck) {
    isValid = true;
  } else if (role === 'admin') {
    isValid = username === '8080';
  } else if (role === 'cashier') {
    if (!cashierName || cashierName.trim() === '') {
      return false;
    }
    isValid = username === '1020';
  } else if (role === 'cashier2') {
    isValid = username === '2030';
  } else if (role === 'inventory') {
    isValid = username === '4050';
  } else if (role === 'employee') {
    // Check if employee exists in employees list
    const employees = getEmployees();
    const employee = employees.find(emp => emp.login === username);
    isValid = employee !== undefined;
    if (isValid && employee) {
      employeeId = employee.id;
    }
  }

  if (isValid) {
    const user: User = { role, username, cashierName, employeeId };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    
    // Сохраняем время входа
    localStorage.setItem(LOGIN_TIME_KEY, Date.now().toString());
    
    console.log('✅ Вход выполнен (Firebase режим):', role);
    
    // Log without showing actual login credentials
    let logMessage = 'Вход в систему: ';
    if (role === 'admin') {
      logMessage += 'Администратор';
    } else if (role === 'cashier' && cashierName) {
      logMessage += `Кассир (${cashierName})`;
    } else if (role === 'cashier2') {
      logMessage += 'Касса 2';
    } else if (role === 'inventory') {
      logMessage += 'Складской';
    } else if (role === 'employee' && employeeId) {
      logMessage += `Сотрудник (ID: ${employeeId})`;
    }
    addLog(logMessage);
    return true;
  }
  return false;
};

export const logout = async (preserveFormData: boolean = false) => {
  const user = getCurrentUser();
  if (user) {
    // Log without showing actual login credentials
    let logMessage = 'Выход из системы: ';
    if (user.role === 'admin') {
      logMessage += 'Администратор';
    } else if (user.role === 'cashier' && user.cashierName) {
      logMessage += `Кассир (${user.cashierName})`;
    } else if (user.role === 'cashier2') {
      logMessage += 'Касса 2';
    } else if (user.role === 'inventory') {
      logMessage += 'Складской';
    } else if (user.role === 'employee' && user.employeeId) {
      logMessage += `Сотрудник (ID: ${user.employeeId})`;
    }
    addLog(logMessage);
  }
  
  // Очищаем только данные сессии, но НЕ очищаем данные форм
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LOGIN_TIME_KEY);
  
  // Данные форм (inventory_form_data и другие) остаются нетронутыми
  console.log('✅ Выход выполнен, данные форм сохранены');
};

export const getCurrentUser = (): User | null => {
  const userStr = localStorage.getItem(STORAGE_KEY);
  if (!userStr) return null;
  
  // Проверяем время последнего входа
  const loginTimeStr = localStorage.getItem(LOGIN_TIME_KEY);
  if (loginTimeStr) {
    const loginTime = parseInt(loginTimeStr);
    const currentTime = Date.now();
    const timePassed = currentTime - loginTime;
    
    // Если прошло больше 24 часов, автоматически выходим
    if (timePassed > SESSION_DURATION) {
      console.log('⏰ Сессия истекла (прошло больше 24 часов), требуется повторный вход');
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LOGIN_TIME_KEY);
      return null;
    }
  }
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

export const isAuthenticated = (role?: UserRole): boolean => {
  const user = getCurrentUser();
  if (!user) return false;
  if (!role) return true;
  return user.role === role;
};

// Проверка, истекла ли сессия
export const isSessionExpired = (): boolean => {
  const loginTimeStr = localStorage.getItem(LOGIN_TIME_KEY);
  if (!loginTimeStr) return true;
  
  const loginTime = parseInt(loginTimeStr);
  const currentTime = Date.now();
  const timePassed = currentTime - loginTime;
  
  return timePassed > SESSION_DURATION;
};

// Получить оставшееся время сессии в миллисекундах
export const getSessionTimeRemaining = (): number => {
  const loginTimeStr = localStorage.getItem(LOGIN_TIME_KEY);
  if (!loginTimeStr) return 0;
  
  const loginTime = parseInt(loginTimeStr);
  const currentTime = Date.now();
  const timePassed = currentTime - loginTime;
  const remaining = SESSION_DURATION - timePassed;
  
  return remaining > 0 ? remaining : 0;
};

export const hasRole = (role: UserRole): boolean => {
  return isAuthenticated(role);
};

// Logging system - uses MySQL with local cache
import { addSystemLog, getSystemLogs } from './mysqlCollections';

export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  user?: string;
}

// Async function to load logs
export const loadLogs = async (): Promise<LogEntry[]> => {
  try {
    const logs = await getSystemLogs();
    logsCache = logs.map(l => ({
      id: l.id,
      timestamp: l.created_at || new Date().toISOString(),
      message: l.action,
      user: l.user_name
    }));
    return logsCache;
  } catch (error) {
    console.error('Error loading logs from MySQL:', error);
    return logsCache;
  }
};

// Sync add log (fire and forget)
export const addLog = (message: string) => {
  const user = getCurrentUser();
  
  // Format user display name
  let userDisplay = 'Система';
  if (user) {
    if (user.role === 'admin') {
      userDisplay = 'Администратор';
    } else if (user.role === 'cashier' && user.cashierName) {
      userDisplay = `Кассир (${user.cashierName})`;
    } else if (user.role === 'cashier2') {
      userDisplay = 'Касса 2';
    } else if (user.role === 'inventory') {
      userDisplay = 'Складской';
    } else if (user.role === 'employee' && user.employeeId) {
      userDisplay = `Сотрудник (ID: ${user.employeeId})`;
    }
  }
  
  // Add to local cache immediately
  const newLog: LogEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toLocaleString('ru-RU'),
    message,
    user: userDisplay
  };
  logsCache.unshift(newLog);
  
  // Save to MySQL in background (fire and forget)
  addSystemLog(message, userDisplay).catch(err => 
    console.error('Error saving log to MySQL:', err)
  );
};

// Sync getter with cache
export const getLogs = (startDate?: string, endDate?: string): LogEntry[] => {
  // Trigger async load in background
  loadLogs();
  
  if (!startDate && !endDate) return logsCache;
  
  return logsCache.filter((log) => {
    const logDate = new Date(log.timestamp);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    if (start && end) {
      return logDate >= start && logDate <= end;
    } else if (start) {
      return logDate >= start;
    } else if (end) {
      return logDate <= end;
    }
    
    return true;
  });
};

// Employee management - uses MySQL with local cache
import { 
  getAllEmployees as mysqlGetEmployees, 
  insertEmployee as mysqlInsertEmployee, 
  updateEmployee as mysqlUpdateEmployee 
} from './mysqlDatabase';

export interface Employee {
  id: string;
  name: string;
  position: string;
  workConditions: string;
  schedule: 'full' | 'piece';
  hourlyRate?: number;
  login: string;
  createdAt: string;
}

// Local cache for sync access
let employeesCache: Employee[] = [];
let logsCache: LogEntry[] = [];

// Load employees from MySQL and update cache
export const loadEmployees = async (): Promise<Employee[]> => {
  try {
    const employees = await mysqlGetEmployees();
    employeesCache = employees.map(e => ({
      id: e.id,
      name: e.name,
      position: e.role || '',
      workConditions: '',
      schedule: 'full' as const,
      hourlyRate: 0,
      login: e.login || '',
      createdAt: e.created_at || ''
    }));
    return employeesCache;
  } catch (error) {
    console.error('Error loading employees from MySQL:', error);
    return employeesCache;
  }
};

// Sync getter for cache
export const getEmployees = (): Employee[] => {
  // Trigger async load in background
  loadEmployees();
  return employeesCache;
};

export const saveEmployee = async (employee: Omit<Employee, 'id' | 'createdAt'>): Promise<Employee> => {
  const result = await mysqlInsertEmployee({
    name: employee.name,
    role: employee.position,
    phone: '',
    login: employee.login,
    active: true
  });
  
  const newEmployee: Employee = {
    ...employee,
    id: result.id || crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  
  employeesCache.push(newEmployee);
  addLog(`Добавлен сотрудник: ${employee.name} (${employee.login})`);
  return newEmployee;
};

export const updateEmployee = async (id: string, updates: Partial<Employee>): Promise<void> => {
  await mysqlUpdateEmployee(id, {
    name: updates.name,
    role: updates.position,
    login: updates.login
  });
  
  const index = employeesCache.findIndex(e => e.id === id);
  if (index !== -1) {
    employeesCache[index] = { ...employeesCache[index], ...updates };
  }
  
  addLog(`Обновлён сотрудник: ${updates.name || 'ID ' + id}`);
};
