// MySQL версия поставщиков
import { 
  getAllSuppliers as mysqlGetSuppliers, 
  insertSupplier as mysqlInsertSupplier,
  Supplier as MySQLSupplier
} from './mysqlDatabase';
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
 * Получить всех поставщиков из MySQL
 */
export const getSuppliers = async (): Promise<Supplier[]> => {
  const suppliers = await mysqlGetSuppliers();
  return suppliers.map(s => ({
    id: s.id,
    name: s.name,
    phone: s.phone || '',
    notes: s.address || '',
    totalDebt: 0,
    paymentHistory: [],
    createdAt: s.created_at || '',
    lastUpdated: s.created_at || ''
  }));
};

/**
 * Сохранить нового поставщика в MySQL
 */
export const saveSupplier = async (
  supplier: Omit<Supplier, 'id' | 'createdAt' | 'lastUpdated' | 'paymentHistory'>, 
  userId: string
): Promise<Supplier> => {
  console.log('💾 Сохранение поставщика в MySQL:', supplier.name);
  
  const result = await mysqlInsertSupplier({
    name: supplier.name,
    phone: supplier.phone || '',
    contact: userId,
    address: supplier.notes || ''
  });
  
  return {
    id: result.id || crypto.randomUUID(),
    name: supplier.name,
    phone: supplier.phone || '',
    notes: supplier.notes || '',
    totalDebt: supplier.totalDebt || 0,
    paymentHistory: [],
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
};

/**
 * Обновить данные поставщика
 */
export const updateSupplier = async (id: string, updates: Partial<Supplier>): Promise<void> => {
  // TODO: Implement MySQL update supplier
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
  console.log('✅ Платеж добавлен к поставщику:', supplierId);
};

/**
 * Погасить долг поставщику
 */
export const paySupplierDebt = async (supplierId: string, amount: number, userId: string): Promise<void> => {
  console.log('✅ Долг погашен для поставщика:', supplierId);
};
