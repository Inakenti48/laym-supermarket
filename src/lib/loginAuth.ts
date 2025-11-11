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

// Вход только по логину (пароль = логин)
export const loginByUsername = async (login: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // Валидация на клиенте
    if (!login) {
      return { success: false, error: 'Логин обязателен' };
    }

    if (!/^\d{4}$/.test(login)) {
      return { success: false, error: 'Логин должен состоять из 4 цифр' };
    }

    // Создаём email на основе логина
    const email = `user-${login}@system.local`;
    const password = login; // Пароль = логин

    console.log('🔐 Попытка входа:', { email });

    // Входим через Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      console.error('❌ Ошибка входа через Supabase Auth:', authError);
      return { success: false, error: 'Неверный логин' };
    }

    if (!authData.user) {
      return { success: false, error: 'Ошибка получения данных пользователя' };
    }

    // Получаем роль пользователя
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', authData.user.id)
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('❌ Ошибка получения роли:', roleError);
      await supabase.auth.signOut();
      return { success: false, error: 'Ошибка получения роли пользователя' };
    }

    // Сохраняем данные в localStorage для совместимости
    const session: AppSession = {
      userId: authData.user.id,
      role: roleData.role,
      login: login,
      loginTime: Date.now()
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
      id: authData.user.id,
      role: roleData.role,
      login: login,
      username: login
    }));

    console.log('✅ Вход выполнен:', { userId: authData.user.id, role: roleData.role });
    return { success: true };
  } catch (error: any) {
    console.error('💥 Login error:', error);
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
export const logoutUser = async () => {
  // Выходим из Supabase Auth
  await supabase.auth.signOut();
  
  // Очищаем localStorage
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
