import { createClient } from '@supabase/supabase-js';

// Клиент для внешней базы Supabase
// URL и ключ берутся из переменных окружения
const EXTERNAL_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL || '';
const EXTERNAL_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_KEY || '';

export const externalSupabase = EXTERNAL_URL && EXTERNAL_KEY 
  ? createClient(EXTERNAL_URL, EXTERNAL_KEY, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      }
    })
  : null;

export const isExternalDbConfigured = () => {
  return !!(EXTERNAL_URL && EXTERNAL_KEY);
};

// Функция для проверки подключения к внешней БД
export const testExternalConnection = async (): Promise<{ success: boolean; error?: string }> => {
  if (!externalSupabase) {
    return { success: false, error: 'External database not configured' };
  }

  try {
    const { error } = await externalSupabase.from('products').select('id').limit(1);
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
};

// CRUD операции для products
export const getExternalProducts = async () => {
  if (!externalSupabase) return [];
  const { data, error } = await externalSupabase.from('products').select('*');
  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }
  return data || [];
};

export const addExternalProduct = async (product: any) => {
  if (!externalSupabase) throw new Error('External DB not configured');
  const { data, error } = await externalSupabase.from('products').insert([product]).select().single();
  if (error) throw error;
  return data;
};

export const updateExternalProduct = async (id: string, updates: any) => {
  if (!externalSupabase) throw new Error('External DB not configured');
  const { data, error } = await externalSupabase.from('products').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteExternalProduct = async (id: string) => {
  if (!externalSupabase) throw new Error('External DB not configured');
  const { error } = await externalSupabase.from('products').delete().eq('id', id);
  if (error) throw error;
};

// CRUD операции для suppliers
export const getExternalSuppliers = async () => {
  if (!externalSupabase) return [];
  const { data, error } = await externalSupabase.from('suppliers').select('*');
  if (error) {
    console.error('Error fetching suppliers:', error);
    return [];
  }
  return data || [];
};

export const addExternalSupplier = async (supplier: any) => {
  if (!externalSupabase) throw new Error('External DB not configured');
  const { data, error } = await externalSupabase.from('suppliers').insert([supplier]).select().single();
  if (error) throw error;
  return data;
};

// CRUD операции для sales
export const addExternalSale = async (sale: any) => {
  if (!externalSupabase) throw new Error('External DB not configured');
  const { data, error } = await externalSupabase.from('sales').insert([sale]).select().single();
  if (error) throw error;
  return data;
};

export const getExternalSales = async (startDate?: Date, endDate?: Date) => {
  if (!externalSupabase) return [];
  
  let query = externalSupabase.from('sales').select('*');
  
  if (startDate) {
    query = query.gte('created_at', startDate.toISOString());
  }
  if (endDate) {
    query = query.lte('created_at', endDate.toISOString());
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching sales:', error);
    return [];
  }
  return data || [];
};

// System logs
export const addExternalLog = async (userId: string | null, message: string) => {
  if (!externalSupabase) return;
  await externalSupabase.from('system_logs').insert([{ user_id: userId, message }]);
};
