// Кастомная система аутентификации по логину (с хранением в Supabase)
import { supabase } from '@/integrations/supabase/client';

const SESSION_ID_KEY = 'session_id';
const SESSION_USER_KEY = 'app_user';

export interface AppSession {
  id?: string;
  userId: string;
  role: string;
  login: string;
  loginTime: number;
  expiresAt: string;
}

// Вход только по логину (MD5 шифрование на клиенте)
export const loginByUsername = async (login: string): Promise<{ success: boolean; error?: string }> => {
  try {
    // Валидация на клиенте
    if (!login) {
      return { success: false, error: 'Введите логин' };
    }

    // Проверяем формат логина (4 цифры)
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

    // Создаем сессию со сроком действия 30 дней
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Сохраняем сессию в Supabase
    const { data: sessionData, error: sessionError } = await supabase
      .from('user_sessions')
      .insert({
        user_id: data.userId,
        login: login,
        role: data.role,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (sessionError) {
      console.error('Session creation error:', sessionError);
      return { success: false, error: 'Ошибка создания сессии' };
    }

    // Сохраняем ID сессии в localStorage для быстрого доступа
    localStorage.setItem(SESSION_ID_KEY, sessionData.id);
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

// Получить текущую сессию из Supabase
export const getCurrentSession = async (): Promise<AppSession | null> => {
  const sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) return null;
  
  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('id', sessionId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (error || !data) {
      // Сессия не найдена или истекла
      localStorage.removeItem(SESSION_ID_KEY);
      localStorage.removeItem(SESSION_USER_KEY);
      return null;
    }

    // Обновляем время последней активности
    await supabase
      .from('user_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('id', sessionId);

    return {
      id: data.id,
      userId: data.user_id,
      role: data.role,
      login: data.login,
      loginTime: new Date(data.created_at).getTime(),
      expiresAt: data.expires_at
    };
  } catch {
    return null;
  }
};

// Получить текущего пользователя (синхронно из localStorage)
export const getCurrentLoginUser = () => {
  try {
    const userStr = localStorage.getItem(SESSION_USER_KEY);
    if (!userStr) return null;
    
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

// Выход с удалением сессии из Supabase
export const logoutUser = async () => {
  const sessionId = localStorage.getItem(SESSION_ID_KEY);
  
  if (sessionId) {
    // Удаляем сессию из Supabase
    try {
      await supabase
        .from('user_sessions')
        .delete()
        .eq('id', sessionId);
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  }
  
  localStorage.removeItem(SESSION_ID_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
};

// Проверка авторизации (синхронная версия для совместимости)
export const isAuthenticated = (): boolean => {
  return localStorage.getItem(SESSION_ID_KEY) !== null;
};

// Проверка роли
export const hasRole = (requiredRole: string): boolean => {
  const user = getCurrentLoginUser();
  return user?.role === requiredRole;
};
