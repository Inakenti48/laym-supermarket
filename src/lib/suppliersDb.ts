// Firebase версия поставщиков (без Supabase)
import { 
  getSuppliers as getFirebaseSuppliers, 
  saveSupplier as saveFirebaseSupplier,
  updateSupplier as updateFirebaseSupplier,
  Supplier as FirebaseSupplier
} from './firebaseCollections';
import { toast } from 'sonner';

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
 * Получить всех поставщиков из Firebase
 */
export const getSuppliers = async (): Promise<Supplier[]> => {
  const suppliers = await getFirebaseSuppliers();
  return suppliers.map(s => ({
    id: s.id,
    name: s.name,
    phone: s.phone || '',
    notes: s.notes || '',
    totalDebt: Number(s.totalDebt || 0),
    paymentHistory: (s.paymentHistory as any) || [],
    createdAt: s.created_at,
    lastUpdated: s.updated_at
  }));
};

/**
 * Сохранить нового поставщика в Firebase
 */
export const saveSupplier = async (
  supplier: Omit<Supplier, 'id' | 'createdAt' | 'lastUpdated' | 'paymentHistory'>, 
  userId: string
): Promise<Supplier> => {
  console.log('💾 Сохранение поставщика в Firebase:', supplier.name);
  
  const result = await saveFirebaseSupplier({
    name: supplier.name,
    phone: supplier.phone || '',
    notes: supplier.notes || '',
    totalDebt: supplier.totalDebt || 0
  });
  
  return {
    id: result.id,
    name: result.name,
    phone: result.phone || '',
    notes: result.notes || '',
    totalDebt: Number(result.totalDebt || 0),
    paymentHistory: [],
    createdAt: result.created_at,
    lastUpdated: result.updated_at
  };
};

/**
 * Обновить данные поставщика
 */
export const updateSupplier = async (id: string, updates: Partial<Supplier>): Promise<void> => {
  const updateData: any = {};
  
  if (updates.name) updateData.name = updates.name;
  if (updates.phone !== undefined) updateData.phone = updates.phone || '';
  if (updates.notes !== undefined) updateData.notes = updates.notes || '';
  if (updates.totalDebt !== undefined) updateData.totalDebt = updates.totalDebt;
  if (updates.paymentHistory !== undefined) updateData.paymentHistory = updates.paymentHistory;
  
  await updateFirebaseSupplier(id, updateData);
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
  const suppliers = await getSuppliers();
  const supplier = suppliers.find(s => s.id === supplierId);

  if (!supplier) {
    throw new Error('Поставщик не найден');
  }

  const newPaymentRecord = {
    productName: payment.productName,
    productQuantity: payment.productQuantity,
    productPrice: payment.productPrice,
    paymentType: payment.paymentType,
    amount: payment.amount,
    changedBy: userId,
    date: new Date().toISOString()
  };

  const updatedHistory = [...(supplier.paymentHistory || []), newPaymentRecord];

  await updateSupplier(supplierId, {
    paymentHistory: updatedHistory as any
  });
  
  console.log('✅ Платеж добавлен к поставщику:', supplierId);
};

/**
 * Погасить долг поставщику
 */
export const paySupplierDebt = async (supplierId: string, amount: number, userId: string): Promise<void> => {
  const suppliers = await getSuppliers();
  const supplier = suppliers.find(s => s.id === supplierId);

  if (!supplier) {
    throw new Error('Поставщик не найден');
  }

  if (amount > (supplier.totalDebt || 0)) {
    throw new Error('Сумма больше текущего долга');
  }

  const debtPaymentRecord = {
    productName: 'Погашение долга',
    productQuantity: 0,
    productPrice: 0,
    paymentType: 'debt_payment' as any,
    amount: -amount,
    changedBy: userId,
    date: new Date().toISOString()
  };

  const updatedHistory = [...(supplier.paymentHistory || []), debtPaymentRecord];
  const newDebt = (supplier.totalDebt || 0) - amount;

  await updateSupplier(supplierId, {
    totalDebt: newDebt,
    paymentHistory: updatedHistory as any
  });
  
  console.log('✅ Долг погашен для поставщика:', supplierId);
};
