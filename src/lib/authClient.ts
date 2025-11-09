// Кастомный клиент Supabase с настройками для 24-часовой сессии
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
const LAST_ACTIVITY_KEY = 'lastActivityTime';

// Создаем клиент с настройками для 24-часовой сессии
export const authClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: false, // Отключаем автоматическое сохранение сессии
    autoRefreshToken: false, // Отключаем автообновление токена
  }
});

// Проверяем, не истекла ли сессия (24 часа)
export const checkSessionExpiry = (): boolean => {
  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  
  if (!lastActivity) {
    return false; // Нет записи о последней активности
  }
  
  const timeSinceLastActivity = Date.now() - parseInt(lastActivity);
  
  if (timeSinceLastActivity > SESSION_TIMEOUT) {
    // Сессия истекла - удаляем данные
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    authClient.auth.signOut();
    return false;
  }
  
  return true;
};

// Обновляем время последней активности
export const updateLastActivity = (): void => {
  localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
};

// Очищаем данные сессии при выходе
export const clearSession = (): void => {
  localStorage.removeItem(LAST_ACTIVITY_KEY);
};
