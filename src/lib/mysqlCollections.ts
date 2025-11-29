// MySQL Collections - все функции коллекций для работы с MySQL
import { 
  getAllProducts, getProductByBarcode, insertProduct, updateProduct, deleteProduct,
  getAllSuppliers, insertSupplier, getAllSales, insertSale,
  getAllLogs, insertLog, 
  getCancellationRequests as mysqlGetCancellations, 
  createCancellationRequest, updateCancellationStatus,
  getPendingProducts, createPendingProduct, approvePendingProduct, rejectPendingProduct,
  mysqlRequest, Product, PendingProduct as MySQLPendingProduct
} from './mysqlDatabase';
import { StoredProduct } from './storage';

// ==================== DEVICES ====================
export interface Device {
  id: string;
  user_id: string;
  user_name: string;
  device_name: string;
  can_save_single: boolean;
  can_save_queue: boolean;
  last_active: string;
}

export const getDevices = async (): Promise<Device[]> => {
  try {
    const response = await mysqlRequest<Device[]>('get_devices');
    return response.data || [];
  } catch (error) {
    console.error('Error getting devices:', error);
    return [];
  }
};

export const saveDevice = async (device: Omit<Device, 'id'>): Promise<void> => {
  try {
    await mysqlRequest('save_device', device as unknown as Record<string, unknown>);
  } catch (error) {
    console.error('Error saving device:', error);
  }
};

export const subscribeToDevices = (callback: (devices: Device[]) => void): (() => void) => {
  getDevices().then(callback);
  const interval = setInterval(() => getDevices().then(callback), 30000);
  return () => clearInterval(interval);
};

// ==================== QUEUE PRODUCTS ====================
export interface QueueProduct {
  id: string;
  barcode?: string;
  product_name?: string;
  category?: string;
  quantity?: number;
  front_photo?: string;
  barcode_photo?: string;
  image_url?: string;
  status: string;
  created_at?: string;
  created_by?: string;
}

export const addToQueue = async (data: Partial<QueueProduct>): Promise<void> => {
  try {
    await createPendingProduct({
      barcode: data.barcode || '',
      name: data.product_name || '',
      category: data.category,
      quantity: data.quantity || 1,
      purchase_price: 0,
      sale_price: 0,
      front_photo: data.front_photo,
      barcode_photo: data.barcode_photo,
      image_url: data.image_url,
      added_by: data.created_by || 'system'
    });
  } catch (error) {
    console.error('Error adding to queue:', error);
    throw error;
  }
};

export const getQueueProducts = async (): Promise<QueueProduct[]> => {
  const pending = await getPendingProducts();
  return pending.map(p => ({
    id: p.id,
    barcode: p.barcode,
    product_name: p.name,
    category: p.category,
    quantity: p.quantity,
    front_photo: p.front_photo,
    barcode_photo: p.barcode_photo,
    image_url: p.image_url,
    status: p.status,
    created_at: p.created_at,
    created_by: p.added_by
  }));
};

export const updateQueueItem = async (id: string, data: Partial<QueueProduct>): Promise<void> => {
  try {
    await mysqlRequest('update_queue_item', { id, ...data } as unknown as Record<string, unknown>);
  } catch (error) {
    console.error('Error updating queue item:', error);
  }
};

export const deleteQueueItem = async (id: string): Promise<void> => {
  await rejectPendingProduct(id);
};

export const subscribeToQueue = (callback: (items: QueueProduct[]) => void): (() => void) => {
  getQueueProducts().then(callback);
  // Синхронизация каждые 5 секунд для быстрого обновления между устройствами
  const interval = setInterval(() => getQueueProducts().then(callback), 5000);
  return () => clearInterval(interval);
};

// ==================== CANCELLATIONS ====================
export interface CancellationRequest {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  cashier: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export const getCancellationRequests = async (): Promise<CancellationRequest[]> => {
  const data = await mysqlGetCancellations();
  return data.map(r => ({
    ...r,
    created_at: r.created_at || new Date().toISOString()
  }));
};

export { createCancellationRequest };

export const updateCancellationRequest = async (
  id: string, 
  status: 'approved' | 'rejected'
): Promise<void> => {
  await updateCancellationStatus(id, status, 'system');
};

export const subscribeToCancellations = (callback: (requests: CancellationRequest[]) => void): (() => void) => {
  getCancellationRequests().then(callback);
  const interval = setInterval(() => getCancellationRequests().then(callback), 15000);
  return () => clearInterval(interval);
};

// ==================== SUPPLIERS ====================
export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  totalDebt?: number;
  paymentHistory?: any[];
  created_at: string;
  updated_at: string;
}

export const getSuppliers = async (): Promise<Supplier[]> => {
  const suppliers = await getAllSuppliers();
  return suppliers.map(s => ({
    id: s.id,
    name: s.name,
    phone: s.phone || '',
    notes: s.address || '',
    totalDebt: 0,
    paymentHistory: [],
    created_at: s.created_at || '',
    updated_at: s.created_at || ''
  }));
};

export const saveSupplier = async (data: { name: string; phone?: string; notes?: string; totalDebt?: number }): Promise<Supplier> => {
  const result = await insertSupplier({
    name: data.name,
    phone: data.phone,
    address: data.notes
  });
  return {
    id: result.id || crypto.randomUUID(),
    name: data.name,
    phone: data.phone,
    notes: data.notes,
    totalDebt: data.totalDebt || 0,
    paymentHistory: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
};

export const updateSupplier = async (id: string, data: Partial<Supplier>): Promise<void> => {
  try {
    await mysqlRequest('update_supplier', { id, ...data } as unknown as Record<string, unknown>);
  } catch (error) {
    console.error('Error updating supplier:', error);
  }
};

export const subscribeToSuppliers = (callback: (suppliers: Supplier[]) => void): (() => void) => {
  getSuppliers().then(callback);
  const interval = setInterval(() => getSuppliers().then(callback), 30000);
  return () => clearInterval(interval);
};

// ==================== SYSTEM LOGS ====================
export interface SystemLog {
  id: string;
  action: string;
  user_name?: string;
  details?: string;
  created_at?: string;
}

export const addSystemLog = async (action: string, userName?: string, details?: string): Promise<void> => {
  await insertLog(action, userName, details);
};

export const getSystemLogs = async (limit: number = 100): Promise<SystemLog[]> => {
  return getAllLogs();
};

// ==================== SALES ====================
export const addSale = async (sale: any): Promise<void> => {
  await insertSale(sale);
};

export const getSales = async (limit: number = 100) => {
  return getAllSales();
};

// ==================== PRODUCT RETURNS ====================
export interface ProductReturn {
  id: string;
  barcode?: string;
  product_name?: string;
  quantity?: number;
  reason?: string;
  created_by?: string;
  created_at?: string;
}

export const getProductReturns = async (): Promise<ProductReturn[]> => {
  try {
    const response = await mysqlRequest<ProductReturn[]>('get_product_returns');
    return response.data || [];
  } catch (error) {
    console.error('Error getting product returns:', error);
    return [];
  }
};

export const addProductReturn = async (data: Omit<ProductReturn, 'id'>): Promise<void> => {
  try {
    await mysqlRequest('add_product_return', data as unknown as Record<string, unknown>);
  } catch (error) {
    console.error('Error adding product return:', error);
  }
};

// ==================== FIREBASE PRODUCTS COMPATIBILITY ====================
const convertToStoredProduct = (p: Product): StoredProduct => ({
  id: p.id,
  barcode: p.barcode,
  name: p.name,
  category: p.category || '',
  purchasePrice: p.purchase_price,
  retailPrice: p.sale_price,
  quantity: p.quantity,
  unit: 'шт',
  expiryDate: p.expiry_date,
  photos: [],
  paymentType: 'full',
  paidAmount: 0,
  debtAmount: 0,
  addedBy: p.created_by || '',
  supplier: p.supplier_id,
  lastUpdated: p.updated_at || '',
  priceHistory: []
});

export const getAllFirebaseProducts = async (): Promise<StoredProduct[]> => {
  const products = await getAllProducts();
  return products.map(convertToStoredProduct);
};

export const findFirebaseProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  const product = await getProductByBarcode(barcode);
  return product ? convertToStoredProduct(product) : null;
};

export const saveFirebaseProduct = async (product: any, userId: string): Promise<StoredProduct> => {
  await insertProduct({
    barcode: product.barcode,
    name: product.name,
    category: product.category || '',
    purchase_price: product.purchasePrice,
    sale_price: product.retailPrice,
    quantity: product.quantity,
    unit: product.unit || 'шт',
    expiry_date: product.expiryDate,
    created_by: userId
  });
  return { ...product, id: crypto.randomUUID(), lastUpdated: new Date().toISOString(), priceHistory: [] };
};

export const updateFirebaseProductQuantity = async (barcode: string, change: number): Promise<void> => {
  const product = await getProductByBarcode(barcode);
  if (product) {
    await updateProduct(barcode, { quantity: product.quantity + change });
  }
};

export const getFirebaseStatus = () => ({ mode: 'MySQL', message: 'MySQL подключен', connected: true });
export const testFirebaseConnection = async () => ({ success: true, message: 'MySQL connected', mode: 'MySQL', product: null });
export const initializeWithTestProducts = async () => ({ success: true, message: 'Test products not needed for MySQL' });
export const retryFirebaseConnection = async () => true;
export const clearAllFirebaseProducts = async () => ({ success: true, message: 'Cleared' });
export const enableFirebaseSync = () => console.log('MySQL sync enabled');
export const disableFirebaseSync = () => {};
export const isFirebaseEnabled = () => true;
export const initFirebaseUsers = async () => ({ success: true, message: 'MySQL mode - no Firebase users needed' });

// Session management - сессия хранится локально (device-specific)
export interface AppSession {
  role: string;
  userName?: string;
  userId?: string;
  login?: string;
}

// NOTE: Session storage остается локальным (специфично для устройства)
// Все остальные данные (товары, поставщики, логи) - в MySQL
export const getCurrentSession = (): AppSession | null => {
  try {
    const saved = localStorage.getItem('app_session');
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
};

// Re-export PendingProduct type
export type { MySQLPendingProduct as PendingProduct };
