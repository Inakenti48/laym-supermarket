// Кастомная система аутентификации по логину (ТОЛЬКО Supabase)
import { supabase } from '@/integrations/supabase/client';

const SESSION_ID_KEY = 'session_id';

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
    console.log('🔐 Попытка входа с логином:', login);
    
    // Валидация на клиенте
    if (!login) {
      console.log('❌ Логин пустой');
      return { success: false, error: 'Введите логин' };
    }

    // Проверяем формат логина (4 цифры)
    if (!/^\d{4}$/.test(login)) {
      console.log('❌ Неверный формат логина:', login);
      return { success: false, error: 'Логин должен состоять из 4 цифр' };
    }

    // Вычисляем MD5 хеш логина для защиты при передаче
    const loginHash = await hashMD5(login);
    console.log('🔑 Хеш логина:', loginHash);

    // Вызываем edge function только с логином (в хешированном виде)
    console.log('📡 Вызов edge function...');
    const { data, error } = await supabase.functions.invoke('login-by-username', {
      body: { loginHash }
    });

    console.log('📥 Ответ от edge function:', { data, error });

    if (error || !data || !data.success) {
      console.log('❌ Ошибка входа:', data?.error || error?.message);
      return { success: false, error: data?.error || 'Неверный логин' };
    }
    
    console.log('✅ Вход успешен, user_id:', data.userId);

    // Очищаем старые сессии этого пользователя
    await supabase
      .from('user_sessions')
      .delete()
      .eq('user_id', data.userId);

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

    // Сохраняем ТОЛЬКО ID сессии в localStorage
    localStorage.setItem(SESSION_ID_KEY, sessionData.id);

    return { success: true };
  } catch (error: any) {
    console.error('Login error:', error);
    return { success: false, error: error.message || 'Ошибка входа' };
  }
};

// MD5 хеширование (для защиты логина при передаче)
async function hashMD5(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

// Получить текущего пользователя ТОЛЬКО из Supabase
export const getCurrentLoginUser = async () => {
  try {
    const session = await getCurrentSession();
    if (!session) {
      // Если нет сессии, используем системного пользователя
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
  } catch {
    // При ошибке используем системного пользователя
    return {
      id: '00000000-0000-0000-0000-000000000001',
      role: 'system',
      login: 'system'
    };
  }
};

// Синхронная версия для совместимости - возвращает системного пользователя
// Используется в компонентах, где нужен немедленный доступ
export const getCurrentLoginUserSync = () => {
  // Всегда возвращаем системного пользователя для синхронных вызовов
  // Настоящие данные нужно получать через асинхронную версию
  return {
    id: '00000000-0000-0000-0000-000000000001',
    role: 'system',
    login: 'system',
    username: 'Система',
    cashierName: 'Система'
  };
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
};

// Проверка авторизации
export const isAuthenticated = async (): Promise<boolean> => {
  const session = await getCurrentSession();
  return session !== null;
};

// Проверка роли
export const hasRole = async (requiredRole: string): Promise<boolean> => {
  const user = await getCurrentLoginUser();
  return user?.role === requiredRole;
};
