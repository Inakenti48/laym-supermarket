import { supabase } from '@/integrations/supabase/client';

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

// SHA-256 hash function
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Pre-hashed admin password (8080)
const ADMIN_PASSWORD_HASH = 'c6ee9e33cf5c6715a1d148fd73f7318884b41adcb916021e2bc0e800a5c5dd97';

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
    
    // Создаем сессию в Supabase для работы с базой данных
    try {
      // Используем специальный email для системных пользователей
      const email = `${role}-${username}@system.local`;
      const password = `${username}-${role}-system-password-2025`;
      
      console.log('🔐 Создание сессии Supabase для:', email);
      
      // Сначала выходим из текущей сессии, если есть
      await supabase.auth.signOut();
      
      // Пытаемся войти
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (signInError) {
        console.log('👤 Пользователь не найден, создаем нового...');
        // Если пользователь не существует, создаем его
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: role,
              username: username,
              cashier_name: cashierName
            }
          }
        });
        
        if (signUpError) {
          console.error('❌ Ошибка создания пользователя Supabase:', signUpError);
          throw signUpError;
        }
        
        console.log('✅ Пользователь создан:', signUpData.user?.id);
        
        // После создания пользователя с auto-confirm сессия уже создана
        if (signUpData.session) {
          console.log('✅ Сессия создана автоматически после регистрации');
        } else {
          console.warn('⚠️ Сессия не создана после регистрации, проверьте настройки auto-confirm');
        }
      } else {
        console.log('✅ Вход в Supabase выполнен:', signInData.user?.id);
      }
      
      // Проверяем, что сессия действительно создана
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('❌ Ошибка получения сессии:', sessionError);
        throw sessionError;
      }
      
      if (!session) {
        console.error('❌ Сессия не создана');
        throw new Error('Не удалось создать сессию. Проверьте настройки Supabase Auth.');
      }
      
      console.log('✅ Сессия Supabase активна:', session.user.id);
    } catch (error: any) {
      console.error('❌ Критическая ошибка авторизации Supabase:', error);
      console.error('Детали ошибки:', {
        message: error.message,
        code: error.code,
        status: error.status
      });
      // Не блокируем вход - пользователь сможет работать офлайн
      console.warn('⚠️ Работа продолжена в локальном режиме');
    }
    
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

export const logout = async () => {
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
  
  // Выходим из Supabase
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Ошибка выхода из Supabase:', error);
  }
  
  localStorage.removeItem(STORAGE_KEY);
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

// Logging system
export interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  user?: string;
}

export const addLog = (message: string) => {
  const logs = getLogs();
  const user = getCurrentUser();
  
  // Format user display name without showing login credentials
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
  
  const newLog: LogEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toLocaleString('ru-RU'),
    message,
    user: userDisplay
  };
  logs.unshift(newLog);
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 1000))); // Keep last 1000 logs
};

export const getLogs = (startDate?: string, endDate?: string): LogEntry[] => {
  const logsStr = localStorage.getItem(LOGS_KEY);
  if (!logsStr) return [];
  try {
    const logs = JSON.parse(logsStr);
    
    if (!startDate && !endDate) return logs;
    
    return logs.filter((log: LogEntry) => {
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
  } catch {
    return [];
  }
};

// Employee management
const EMPLOYEES_KEY = 'system_employees';

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

export const getEmployees = (): Employee[] => {
  const employeesStr = localStorage.getItem(EMPLOYEES_KEY);
  if (!employeesStr) return [];
  try {
    return JSON.parse(employeesStr);
  } catch {
    return [];
  }
};

export const saveEmployee = (employee: Omit<Employee, 'id' | 'createdAt'>): Employee => {
  const employees = getEmployees();
  const newEmployee: Employee = {
    ...employee,
    id: Date.now().toString(),
    createdAt: new Date().toISOString()
  };
  employees.push(newEmployee);
  localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(employees));
  addLog(`Добавлен сотрудник: ${employee.name} (${employee.login})`);
  return newEmployee;
};

export const updateEmployee = (id: string, updates: Partial<Employee>): void => {
  const employees = getEmployees();
  const updated = employees.map(e => {
    if (e.id === id) {
      return { ...e, ...updates };
    }
    return e;
  });
  localStorage.setItem(EMPLOYEES_KEY, JSON.stringify(updated));
  addLog(`Обновлён сотрудник: ${updates.name || 'ID ' + id}`);
};
