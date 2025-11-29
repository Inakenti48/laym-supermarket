// MySQL-based auth (Firebase removed)
export type AppRole = 'admin' | 'cashier' | 'cashier2' | 'inventory' | 'system';

export interface AppSession {
  role: AppRole;
  userName?: string;
  userId?: string;
  login?: string;
}

export const initFirebaseUsers = async (): Promise<{ success: boolean; message: string }> => {
  return { success: true, message: 'MySQL mode - no Firebase users needed' };
};

export const firebaseDb = null;

export const loginWithFirebase = async (login: string): Promise<{ success: boolean; session?: AppSession; userName?: string; error?: string }> => {
  const roleMap: Record<string, AppRole> = { 
    admin: 'admin', 
    cashier: 'cashier', 
    cashier2: 'cashier2', 
    inventory: 'inventory', 
    system: 'system' 
  };
  const role = roleMap[login.toLowerCase()] || 'cashier';
  const userId = crypto.randomUUID();
  const session: AppSession = { role, userName: login, userId, login };
  localStorage.setItem('app_session', JSON.stringify(session));
  return { success: true, session, userName: login };
};

export const logoutFirebase = () => localStorage.removeItem('app_session');

export const getCurrentSession = (): AppSession | null => {
  const saved = localStorage.getItem('app_session');
  return saved ? JSON.parse(saved) : null;
};
