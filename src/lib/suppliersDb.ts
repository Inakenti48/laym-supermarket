import { supabase } from '@/integrations/supabase/client';

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  notes: string;
  totalDebt: number;
  paymentHistory: Array<{
    date: string;
    amount: number;
    paymentType: 'full' | 'partial' | 'debt';
    productName: string;
    productQuantity: number;
    productPrice: number;
    changedBy: string;
  }>;
  createdAt: string;
  lastUpdated: string;
}

/**
 * Получить всех поставщиков из базы данных
 */
export const getSuppliers = async (): Promise<Supplier[]> => {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching suppliers:', error);
    return [];
  }
  
  return (data || []).map(s => ({
    id: s.id,
    name: s.name,
    phone: s.phone || '',
    notes: s.address || '',
    totalDebt: Number(s.debt || 0),
    paymentHistory: (s.payment_history as any) || [],
    createdAt: s.created_at,
    lastUpdated: s.updated_at
  }));
};

/**
 * Сохранить нового поставщика в базу данных
 */
export const saveSupplier = async (
  supplier: Omit<Supplier, 'id' | 'createdAt' | 'lastUpdated' | 'paymentHistory'>, 
  userId: string
): Promise<Supplier> => {
  console.log('💾 Сохранение поставщика в Supabase...', {
    name: supplier.name,
    phone: supplier.phone
  });
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError) {
    console.error('❌ Ошибка получения пользователя:', {
      message: authError.message,
      code: authError.status
    });
    throw new Error('Ошибка авторизации');
  }
  
  if (!user) {
    console.warn('⚠️ Пользователь не авторизован');
    throw new Error('Пользователь не авторизован');
  }
  
  console.log('✅ Пользователь авторизован:', user.id);
  
  const supplierData = {
    name: supplier.name,
    phone: supplier.phone || null,
    contact_person: supplier.name,
    address: supplier.notes || null,
    debt: supplier.totalDebt || 0,
    payment_history: [] as any,
    created_by: user.id
  };
  
  console.log('☁️ Сохранение в базу данных...');
  const { data, error } = await supabase
    .from('suppliers')
    .insert(supplierData)
    .select()
    .single();
  
  if (error) {
    console.error('❌ Ошибка сохранения поставщика:', error);
    throw error;
  }
  
  console.log('✅ Поставщик успешно сохранен:', data.id);
  
  return {
    id: data.id,
    name: data.name,
    phone: data.phone || '',
    notes: data.address || '',
    totalDebt: Number(data.debt || 0),
    paymentHistory: [],
    createdAt: data.created_at,
    lastUpdated: data.updated_at
  };
};

/**
 * Обновить данные поставщика
 */
export const updateSupplier = async (id: string, updates: Partial<Supplier>): Promise<void> => {
  const updateData: any = {
    updated_at: new Date().toISOString()
  };
  
  if (updates.name) updateData.name = updates.name;
  if (updates.phone !== undefined) updateData.phone = updates.phone || null;
  if (updates.notes !== undefined) updateData.address = updates.notes || null;
  if (updates.totalDebt !== undefined) updateData.debt = updates.totalDebt;
  if (updates.paymentHistory !== undefined) updateData.payment_history = updates.paymentHistory;
  
  const { error } = await supabase
    .from('suppliers')
    .update(updateData)
    .eq('id', id);
  
  if (error) {
    console.error('❌ Ошибка обновления поставщика:', error);
    throw error;
  }
  
  console.log('✅ Поставщик обновлен:', id);
};

/**
 * Добавить платеж или операцию поставщику
 */
export const addSupplierPayment = async (
  supplierId: string, 
  payment: {
    amount: number;
    paymentType: 'full' | 'partial' | 'debt';
    productName: string;
    productQuantity: number;
    productPrice: number;
  },
  userId: string
): Promise<void> => {
  // Получаем текущего поставщика
  const { data: supplier, error: supplierError } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', supplierId)
    .single();

  if (supplierError || !supplier) {
    throw new Error('Поставщик не найден');
  }

  // Создаем новую запись в истории платежей
  const newPaymentRecord = {
    productName: payment.productName,
    productQuantity: payment.productQuantity,
    productPrice: payment.productPrice,
    paymentType: payment.paymentType,
    amount: payment.amount,
    changedBy: userId,
    date: new Date().toISOString()
  };

  const currentHistory = Array.isArray(supplier.payment_history) ? supplier.payment_history : [];
  const updatedHistory = [...currentHistory, newPaymentRecord];

  // Обновляем поставщика
  await updateSupplier(supplierId, {
    paymentHistory: updatedHistory as any
  });
  
  console.log('✅ Платеж добавлен к поставщику:', supplierId);
};

/**
 * Погасить долг поставщику
 */
export const paySupplierDebt = async (supplierId: string, amount: number, userId: string): Promise<void> => {
  // Получаем текущего поставщика
  const { data: supplier, error: supplierError } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', supplierId)
    .single();

  if (supplierError || !supplier) {
    throw new Error('Поставщик не найден');
  }

  if (amount > (supplier.debt || 0)) {
    throw new Error('Сумма больше текущего долга');
  }

  // Создаем запись о погашении долга
  const debtPaymentRecord = {
    productName: 'Погашение долга',
    productQuantity: 0,
    productPrice: 0,
    paymentType: 'debt_payment',
    amount: -amount,
    changedBy: userId,
    date: new Date().toISOString()
  };

  const currentHistory = Array.isArray(supplier.payment_history) ? supplier.payment_history : [];
  const updatedHistory = [...currentHistory, debtPaymentRecord];
  const newDebt = (supplier.debt || 0) - amount;

  // Обновляем поставщика
  await updateSupplier(supplierId, {
    totalDebt: newDebt,
    paymentHistory: updatedHistory as any
  });
  
  console.log('✅ Долг погашен для поставщика:', supplierId);
};
