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

// Вход только по логину (MD5 шифрование на клиенте)
export const loginByUsername = async (login: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // Валидация на клиенте
    if (!login) {
      return { success: false, error: 'Логин обязателен' };
    }

    if (!/^\d{4}$/.test(login)) {
      return { success: false, error: 'Логин должен состоять из 4 цифр' };
    }

    // Вычисляем MD5 хеш логина для защиты при передаче
    const loginHash = await hashMD5(login);

    // Вызываем edge function только с логином (в хешированном виде)
    const { data, error } = await supabase.functions.invoke('login-by-username', {
      body: { loginHash }
    });

    if (error || !data || !data.success) {
      return { success: false, error: data?.error || 'Неверный логин' };
    }

    // Сохраняем сессию в localStorage
    const session: AppSession = {
      userId: data.userId,
      role: data.role,
      login: login,
      loginTime: Date.now()
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
      id: data.userId,
      role: data.role,
      login: login
    }));

    return { success: true };
  } catch (error: any) {
    console.error('Login error:', error);
    return { success: false, error: error.message || 'Ошибка входа' };
  }
};

// MD5 хеширование (для защиты логина при передаче)
async function hashMD5(text: string): Promise<string> {
  // Простая реализация MD5 для браузера
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Используем Web Crypto API для создания хеша
  // Так как MD5 не поддерживается напрямую, используем SHA-256 и берем первые 32 символа
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Берем первые 32 символа для имитации MD5 (32 hex символа = 128 бит)
  return hashHex.substring(0, 32);
}

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
