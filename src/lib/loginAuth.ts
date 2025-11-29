// Система аутентификации по логину (без Supabase)

const SESSION_KEY = 'app_session';
const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login-by-username`;

export interface AppSession {
  userId: string;
  role: string;
  login: string;
  name?: string;
  loginTime: number;
}

// MD5/SHA256 хеширование для передачи логина
async function hashLogin(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// Вход по логину
export const loginByUsername = async (login: string): Promise<{ 
  success: boolean; 
  error?: string;
  userId?: string;
  role?: string;
  login?: string;
  name?: string;
}> => {
  try {
    // Валидация
    if (!login || !/^\d{4}$/.test(login)) {
      return { success: false, error: 'Логин должен состоять из 4 цифр' };
    }

    const loginHash = await hashLogin(login);

    // Вызываем edge function напрямую через fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginHash }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!data.success) {
        return { success: false, error: data.error || 'Неверный логин' };
      }

      // Сохраняем сессию локально
      const session: AppSession = {
        userId: data.userId,
        role: data.role,
        login: data.login,
        name: data.name,
        loginTime: Date.now()
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));

      return { 
        success: true, 
        userId: data.userId, 
        role: data.role,
        login: data.login,
        name: data.name
      };
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        return { success: false, error: 'Сервер не отвечает, попробуйте позже' };
      }
      throw e;
    }
  } catch (error: any) {
    console.error('Login error:', error);
    return { success: false, error: 'Ошибка входа' };
  }
};

// Получить текущую сессию из localStorage
export const getCurrentSession = (): AppSession | null => {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
};

// Получить текущего пользователя
export const getCurrentLoginUser = async () => {
  const session = getCurrentSession();
  if (!session) {
    return {
      id: '00000000-0000-0000-0000-000000000001',
      role: 'system',
      login: 'system'
    };
  }
  
  return {
    id: session.userId,
    role: session.role,
    login: session.login
  };
};

// Синхронная версия
export const getCurrentLoginUserSync = () => {
  const session = getCurrentSession();
  if (!session) {
    return {
      id: '00000000-0000-0000-0000-000000000001',
      role: 'system',
      login: 'system',
      username: 'Система',
      cashierName: 'Система'
    };
  }
  
  return {
    id: session.userId,
    role: session.role,
    login: session.login,
    username: session.name || session.login,
    cashierName: session.name || session.login
  };
};

// Выход
export const logoutUser = async () => {
  localStorage.removeItem(SESSION_KEY);
};

// Проверка авторизации
export const isAuthenticated = async (): Promise<boolean> => {
  return getCurrentSession() !== null;
};

// Проверка роли
export const hasRole = async (requiredRole: string): Promise<boolean> => {
  const session = getCurrentSession();
  return session?.role === requiredRole;
};
