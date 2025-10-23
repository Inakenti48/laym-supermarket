export type UserRole = 'admin' | 'cashier' | 'inventory';

interface User {
  role: UserRole;
  username: string;
}

const STORAGE_KEY = 'inventory_user';

export const login = (username: string, password: string, role: UserRole): boolean => {
  // Simple demo authentication
  const validCredentials = {
    admin: { username: 'admin', password: 'admin123' },
    cashier: { username: 'cashier', password: 'cashier123' },
    inventory: { username: 'inventory', password: 'inventory123' }
  };

  const creds = validCredentials[role];
  if (username === creds.username && password === creds.password) {
    const user: User = { role, username };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return true;
  }
  return false;
};

export const logout = () => {
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
