export interface StoredProduct {
  id: string;
  barcode: string;
  name: string;
  category: string;
  purchasePrice: number;
  retailPrice: number;
  quantity: number;
  unit: 'шт' | 'кг';
  expiryDate?: string;
  photos: string[];
  paymentType: 'full' | 'partial' | 'debt';
  paidAmount: number;
  debtAmount: number;
  addedBy: string;
  supplier?: string;
  lastUpdated: string;
  priceHistory: Array<{
    date: string;
    purchasePrice: number;
    retailPrice: number;
    changedBy: string;
  }>;
}

const STORAGE_KEY = 'inventory_products';

import { supabase } from '@/integrations/supabase/client';

export const getStoredProducts = async (): Promise<StoredProduct[]> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Преобразуем данные из Supabase в формат StoredProduct
    return (data || []).map(product => ({
      id: product.id,
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      purchasePrice: Number(product.purchase_price),
      retailPrice: Number(product.sale_price),
      quantity: product.quantity,
      unit: product.unit as 'шт' | 'кг',
      expiryDate: product.expiry_date || undefined,
      photos: [], // Фото загружаются отдельно
      paymentType: product.payment_type as 'full' | 'partial' | 'debt',
      paidAmount: Number(product.paid_amount),
      debtAmount: Number(product.debt_amount),
      addedBy: product.created_by || '',
      supplier: product.supplier || undefined,
      lastUpdated: product.updated_at,
      priceHistory: Array.isArray(product.price_history) 
        ? product.price_history.map((h: any) => ({
            date: h.date,
            purchasePrice: Number(h.purchase_price || h.purchasePrice),
            retailPrice: Number(h.retail_price || h.retailPrice),
            changedBy: h.changed_by || h.changedBy
          }))
        : []
    }));
  } catch (error) {
    console.error('Ошибка загрузки товаров:', error);
    return [];
  }
};

export const findProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle();
    
    if (error || !data) return null;
    
    return {
      id: data.id,
      barcode: data.barcode,
      name: data.name,
      category: data.category,
      purchasePrice: Number(data.purchase_price),
      retailPrice: Number(data.sale_price),
      quantity: data.quantity,
      unit: data.unit as 'шт' | 'кг',
      expiryDate: data.expiry_date || undefined,
      photos: [],
      paymentType: data.payment_type as 'full' | 'partial' | 'debt',
      paidAmount: Number(data.paid_amount),
      debtAmount: Number(data.debt_amount),
      addedBy: data.created_by || '',
      supplier: data.supplier || undefined,
      lastUpdated: data.updated_at,
      priceHistory: Array.isArray(data.price_history)
        ? data.price_history.map((h: any) => ({
            date: h.date,
            purchasePrice: Number(h.purchase_price || h.purchasePrice),
            retailPrice: Number(h.retail_price || h.retailPrice),
            changedBy: h.changed_by || h.changedBy
          }))
        : []
    };
  } catch (error) {
    console.error('Ошибка поиска товара:', error);
    return null;
  }
};

export const saveProduct = async (product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>, userId: string): Promise<StoredProduct> => {
  try {
    const existing = await findProductByBarcode(product.barcode);
    const now = new Date().toISOString();
    
    if (existing) {
      // Обновляем существующий товар
      const priceChanged = 
        existing.purchasePrice !== product.purchasePrice || 
        existing.retailPrice !== product.retailPrice;
      
      const newPriceHistory = priceChanged
        ? [
            ...existing.priceHistory,
            {
              date: now,
              purchasePrice: product.purchasePrice,
              retailPrice: product.retailPrice,
              changedBy: userId,
            },
          ]
        : existing.priceHistory;
      
      const { data, error } = await supabase
        .from('products')
        .update({
          name: product.name,
          category: product.category,
          purchase_price: product.purchasePrice,
          sale_price: product.retailPrice,
          quantity: product.quantity,
          unit: product.unit,
          expiry_date: product.expiryDate || null,
          payment_type: product.paymentType,
          paid_amount: product.paidAmount,
          debt_amount: product.debtAmount,
          supplier: product.supplier || null,
          price_history: newPriceHistory.map(h => ({
            date: h.date,
            purchase_price: h.purchasePrice,
            retail_price: h.retailPrice,
            changed_by: h.changedBy
          }))
        })
        .eq('barcode', product.barcode)
        .select()
        .single();
      
      if (error) throw error;
      
      return {
        ...existing,
        ...product,
        id: data.id,
        lastUpdated: now,
        priceHistory: newPriceHistory
      };
    } else {
      // Создаем новый товар
      const initialPriceHistory = [
        {
          date: now,
          purchasePrice: product.purchasePrice,
          retailPrice: product.retailPrice,
          changedBy: userId,
        },
      ];
      
      const { data, error } = await supabase
        .from('products')
        .insert({
          barcode: product.barcode,
          name: product.name,
          category: product.category,
          purchase_price: product.purchasePrice,
          sale_price: product.retailPrice,
          quantity: product.quantity,
          unit: product.unit,
          expiry_date: product.expiryDate || null,
          payment_type: product.paymentType,
          paid_amount: product.paidAmount,
          debt_amount: product.debtAmount,
          supplier: product.supplier || null,
          price_history: initialPriceHistory.map(h => ({
            date: h.date,
            purchase_price: h.purchasePrice,
            retail_price: h.retailPrice,
            changed_by: h.changedBy
          })),
          created_by: userId
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return {
        ...product,
        id: data.id,
        lastUpdated: now,
        priceHistory: initialPriceHistory
      };
    }
  } catch (error) {
    console.error('Ошибка сохранения товара:', error);
    throw error;
  }
};

export const getAllProducts = async (): Promise<StoredProduct[]> => {
  return getStoredProducts();
};

export const getExpiringProducts = async (daysBeforeExpiry: number = 3): Promise<StoredProduct[]> => {
  const products = await getStoredProducts();
  const now = new Date();
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);
  
  return products.filter(product => {
    if (!product.expiryDate) return false;
    const expiryDate = new Date(product.expiryDate);
    return expiryDate >= now && expiryDate <= targetDate;
  });
};

export const isProductExpired = (product: StoredProduct): boolean => {
  if (!product.expiryDate) return false;
  const now = new Date();
  const expiryDate = new Date(product.expiryDate);
  return expiryDate < now;
};

export const updateProductQuantity = async (barcode: string, quantityChange: number): Promise<void> => {
  try {
    const product = await findProductByBarcode(barcode);
    if (!product) {
      throw new Error(`Товар с штрихкодом ${barcode} не найден`);
    }
    
    const { error } = await supabase
      .from('products')
      .update({ quantity: product.quantity + quantityChange })
      .eq('barcode', barcode);
    
    if (error) throw error;
  } catch (error) {
    console.error('Ошибка обновления количества:', error);
    throw error;
  }
};

// Система отмены товаров
export interface CancellationRequest {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  cashier: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

const CANCELLATIONS_KEY = 'cancellation_requests';

export const getCancellationRequests = (): CancellationRequest[] => {
  const data = localStorage.getItem(CANCELLATIONS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const createCancellationRequest = (items: Array<{ barcode: string; name: string; quantity: number; price: number }>, cashier: string): CancellationRequest => {
  const requests = getCancellationRequests();
  const newRequest: CancellationRequest = {
    id: Date.now().toString(),
    items,
    cashier,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  };
  requests.push(newRequest);
  localStorage.setItem(CANCELLATIONS_KEY, JSON.stringify(requests));
  return newRequest;
};

export const updateCancellationRequest = (id: string, status: 'approved' | 'rejected'): void => {
  const requests = getCancellationRequests();
  const updated = requests.map(r => {
    if (r.id === id) {
      return { ...r, status };
    }
    return r;
  });
  localStorage.setItem(CANCELLATIONS_KEY, JSON.stringify(updated));
  
  // Если отмена одобрена, возвращаем товары в склад
  if (status === 'approved') {
    const request = requests.find(r => r.id === id);
    if (request) {
      request.items.forEach(item => {
        updateProductQuantity(item.barcode, item.quantity);
      });
    }
  }
};

// Удаление старых запросов (старше 24 часов)
export const cleanupOldCancellations = (): void => {
  const requests = getCancellationRequests();
  const now = new Date().getTime();
  const dayInMs = 24 * 60 * 60 * 1000;
  
  const filtered = requests.filter(r => {
    const requestTime = new Date(r.requestedAt).getTime();
    return now - requestTime < dayInMs;
  });
  
  localStorage.setItem(CANCELLATIONS_KEY, JSON.stringify(filtered));
};

// Поставщики
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

const SUPPLIERS_KEY = 'suppliers';

export const getSuppliers = async (): Promise<Supplier[]> => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return (data || []).map(supplier => ({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone || '',
      notes: supplier.address || '',
      totalDebt: Number(supplier.debt || 0),
      paymentHistory: Array.isArray(supplier.payment_history) 
        ? supplier.payment_history.map((h: any) => ({
            date: h.date,
            amount: Number(h.amount),
            paymentType: h.payment_type || h.paymentType,
            productName: h.product_name || h.productName,
            productQuantity: Number(h.product_quantity || h.productQuantity || 0),
            productPrice: Number(h.product_price || h.productPrice || 0),
            changedBy: h.changed_by || h.changedBy
          }))
        : [],
      createdAt: supplier.created_at,
      lastUpdated: supplier.updated_at
    }));
  } catch (error) {
    console.error('Ошибка загрузки поставщиков:', error);
    return [];
  }
};

export const saveSupplier = async (supplier: Omit<Supplier, 'id' | 'createdAt' | 'lastUpdated' | 'paymentHistory'>, userId: string): Promise<Supplier> => {
  try {
    const { data, error } = await supabase
      .from('suppliers')
      .insert({
        name: supplier.name,
        phone: supplier.phone || null,
        address: supplier.notes || null,
        debt: supplier.totalDebt || 0,
        payment_history: []
      })
      .select()
      .single();
    
    if (error) throw error;
    
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
  } catch (error) {
    console.error('Ошибка сохранения поставщика:', error);
    throw error;
  }
};

export const updateSupplier = async (id: string, updates: Partial<Supplier>): Promise<void> => {
  try {
    await supabase
      .from('suppliers')
      .update({
        name: updates.name,
        phone: updates.phone || null,
        address: updates.notes || null,
        debt: updates.totalDebt || null,
      })
      .eq('id', id);
  } catch (error) {
    console.error('Ошибка обновления поставщика:', error);
    throw error;
  }
};

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
  // Эта функция пока не используется, будет реализована позже
  console.log('addSupplierPayment - not implemented yet');
};

export const paySupplierDebt = async (supplierId: string, amount: number, userId: string): Promise<void> => {
  // Эта функция пока не используется, будет реализована позже
  console.log('paySupplierDebt - not implemented yet');
};

// Экспорт всех данных для резервного копирования
export const exportAllData = () => {
  const allData = {
    products: getStoredProducts(),
    cancellations: getCancellationRequests(),
    suppliers: getSuppliers(),
    exportDate: new Date().toISOString(),
    version: '1.0'
  };

  const jsonString = JSON.stringify(allData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Импорт данных из резервной копии
export const importAllData = (jsonData: string) => {
  try {
    const data = JSON.parse(jsonData);
    
    if (data.products) {
      localStorage.setItem('products', JSON.stringify(data.products));
    }
    if (data.cancellations) {
      localStorage.setItem('cancellationRequests', JSON.stringify(data.cancellations));
    }
    if (data.suppliers) {
      localStorage.setItem('suppliers', JSON.stringify(data.suppliers));
    }
    
    return true;
  } catch (error) {
    console.error('Ошибка импорта данных:', error);
    return false;
  }
};
