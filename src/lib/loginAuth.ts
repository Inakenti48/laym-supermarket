// Кастомная система аутентификации по логину (без Supabase Auth)
import { supabase } from '@/integrations/supabase/client';

const SESSION_KEY = 'app_session';
const SESSION_USER_KEY = 'app_user';

export interface AppSession {
  userId: string;
  role: string;
  login: string;
  loginTime: number;
}

// Вход по логину
export const loginByUsername = async (login: string, password: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // Валидация на клиенте
    if (!login || !password) {
      return { success: false, error: 'Логин и пароль обязательны' };
    }

    if (!/^\d{4}$/.test(login)) {
      return { success: false, error: 'Логин должен состоять из 4 цифр' };
    }

    // Вызываем edge function
    const { data, error } = await supabase.functions.invoke('login-by-username', {
      body: { login, password }
    });

    if (error || !data || !data.success) {
      return { success: false, error: data?.error || 'Неверный логин или пароль' };
    }

    // Сохраняем сессию в localStorage
    const session: AppSession = {
      userId: data.userId,
      role: data.role,
      login: data.login,
      loginTime: Date.now()
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
      id: data.userId,
      role: data.role,
      login: data.login
    }));

    return { success: true };
  } catch (error: any) {
    console.error('Login error:', error);
    return { success: false, error: error.message || 'Ошибка входа' };
  }
};

// Получить текущую сессию
export const getCurrentSession = (): AppSession | null => {
  try {
    const sessionStr = localStorage.getItem(SESSION_KEY);
    if (!sessionStr) return null;
    
    const session = JSON.parse(sessionStr);
    return session;
  } catch {
    return null;
  }
};

// Получить текущего пользователя
export const getCurrentLoginUser = () => {
  try {
    const userStr = localStorage.getItem(SESSION_USER_KEY);
    if (!userStr) return null;
    
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

// Выход
export const logoutUser = () => {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
};

// Проверка авторизации
export const isAuthenticated = (): boolean => {
  return getCurrentSession() !== null;
};

// Проверка роли
export const hasRole = (requiredRole: string): boolean => {
  const session = getCurrentSession();
  return session?.role === requiredRole;
};
