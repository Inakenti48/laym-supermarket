export type UserRole = 'admin' | 'cashier' | 'inventory';

interface User {
  role: UserRole;
  username: string;
  cashierName?: string;
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
  password: string, 
  role: UserRole, 
  cashierName?: string
): Promise<boolean> => {
  let isValid = false;

  if (role === 'admin') {
    const passwordHash = await sha256(password);
    isValid = username === '8080' && passwordHash === ADMIN_PASSWORD_HASH;
  } else if (role === 'cashier') {
    if (!cashierName || cashierName.trim() === '') {
      return false;
    }
    isValid = username === '2030' && password === '2030';
  } else if (role === 'inventory') {
    isValid = username === '4050' && password === '4050';
  }

  if (isValid) {
    const user: User = { role, username, cashierName };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    addLog(`Вход в систему: ${role}${cashierName ? ` (${cashierName})` : ''}`);
    return true;
  }
  return false;
};

export const logout = () => {
  const user = getCurrentUser();
  if (user) {
    addLog(`Выход из системы: ${user.role}${user.cashierName ? ` (${user.cashierName})` : ''}`);
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
  const newLog: LogEntry = {
    id: Date.now().toString(),
    timestamp: new Date().toLocaleString('ru-RU'),
    message,
    user: user ? `${user.role}${user.cashierName ? ` (${user.cashierName})` : ''}` : 'Система'
  };
  logs.unshift(newLog);
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs.slice(0, 1000))); // Keep last 1000 logs
};

export const getLogs = (): LogEntry[] => {
  const logsStr = localStorage.getItem(LOGS_KEY);
  if (!logsStr) return [];
  try {
    return JSON.parse(logsStr);
  } catch {
    return [];
  }
};
