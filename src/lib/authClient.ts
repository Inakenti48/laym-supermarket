// Кастомный клиент Supabase с настройками для 24-часовой сессии
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 часа в миллисекундах
const LAST_ACTIVITY_KEY = 'lastActivityTime';

// Создаем клиент с бессрочной сессией (до выхода)
export const authClient = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true, // Сохраняем сессию до выхода
    autoRefreshToken: true, // Автоматически обновляем токен
  }
});

// Больше не проверяем истечение сессии - сессия бессрочная до выхода
export const checkSessionExpiry = (): boolean => {
  return true; // Всегда валидная сессия
};

// Больше не нужно обновлять активность
export const updateLastActivity = (): void => {
  // Пустая функция для обратной совместимости
};

// Очищаем данные сессии при выходе
export const clearSession = (): void => {
  localStorage.removeItem(LAST_ACTIVITY_KEY);
};
