export type UserRole = 'admin' | 'cashier' | 'cashier2' | 'inventory' | 'employee';

interface User {
  role: UserRole;
  username: string;
  cashierName?: string;
  employeeId?: string;
}

const STORAGE_KEY = 'inventory_user';
const LOGS_KEY = 'system_logs';

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
  employeeId?: string
): Promise<boolean> => {
  let isValid = false;

  if (role === 'admin') {
    isValid = username === '8080';
  } else if (role === 'cashier') {
    if (!cashierName || cashierName.trim() === '') {
      return false;
    }
    isValid = username === '2030';
  } else if (role === 'cashier2') {
    isValid = username === '1111';
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

export const logout = () => {
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
  localStorage.removeItem(STORAGE_KEY);
};

export const getCurrentUser = (): User | null => {
  const userStr = localStorage.getItem(STORAGE_KEY);
  if (!userStr) return null;
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
