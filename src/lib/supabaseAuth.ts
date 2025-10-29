import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'cashier' | 'inventory' | 'employee';

interface AuthUser {
  user: User;
  session: Session;
  role: AppRole | null;
  cashierName?: string;
}

// Проверяем роль пользователя
export const getUserRole = async (userId: string): Promise<AppRole | null> => {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data.role as AppRole;
};

// Получаем текущего пользователя с ролью
export const getCurrentAuthUser = async (): Promise<AuthUser | null> => {
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) return null;

  const role = await getUserRole(session.user.id);
  
  return {
    user: session.user,
    session,
    role,
  };
};

// Вход
export const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Логируем вход
  await logSystemAction('Вход в систему');
  
  return { success: true };
};

// Регистрация нового пользователя (только для админа)
export const signUp = async (
  email: string, 
  password: string, 
  role: AppRole,
  cashierName?: string
): Promise<{ success: boolean; error?: string }> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/`,
      data: {
        cashier_name: cashierName
      }
    }
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (data.user) {
    // Назначаем роль
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert([{
        user_id: data.user.id,
        role: role
      }]);

    if (roleError) {
      return { success: false, error: 'Ошибка назначения роли' };
    }

    // Обновляем профиль с именем кассира
    if (cashierName) {
      await supabase
        .from('profiles')
        .update({ full_name: cashierName })
        .eq('user_id', data.user.id);
    }
  }

  await logSystemAction(`Создан пользователь: ${email} (${role})`);

  return { success: true };
};

// Выход
export const signOut = async (): Promise<void> => {
  await logSystemAction('Выход из системы');
  await supabase.auth.signOut();
};

// Безопасное получение текущего пользователя с обработкой ошибок
export const getSafeUser = async (): Promise<{ user: User | null; error: string | null }> => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('❌ Ошибка получения пользователя:', {
        message: error.message,
        code: error.status
      });
      return { user: null, error: error.message };
    }
    
    if (!user) {
      console.warn('⚠️ Пользователь не авторизован');
      return { user: null, error: 'Пользователь не авторизован' };
    }
    
    return { user, error: null };
  } catch (error: any) {
    console.error('❌ Критическая ошибка при получении пользователя:', error);
    return { user: null, error: error.message || 'Неизвестная ошибка' };
  }
};

// Логирование действий
export const logSystemAction = async (message: string): Promise<void> => {
  const { user } = await getSafeUser();
  
  if (user) {
    try {
      await supabase.from('system_logs').insert({
        user_id: user.id,
        message
      });
    } catch (error) {
      console.warn('⚠️ Не удалось записать лог:', error);
    }
  }
};
