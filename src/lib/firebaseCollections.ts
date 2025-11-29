// DEPRECATED: Заглушка для обратной совместимости - все данные теперь в MySQL
import { 
  getAllProducts, getAllSuppliers, getAllSales, getAllLogs, 
  getCancellationRequests, createCancellationRequest, updateCancellationStatus,
  insertLog, getPendingProducts, createPendingProduct, approvePendingProduct, rejectPendingProduct,
  insertSale
} from './mysqlDatabase';

// Queue products
export interface QueueProduct { id: string; barcode?: string; name?: string; status: string; created_at?: string; }
export const addToQueue = async (data: any) => createPendingProduct({ ...data, added_by: data.addedBy || 'system' });
export const getQueueProducts = async () => getPendingProducts();
export const updateQueueItem = async (id: string, data: any) => {};
export const deleteQueueItem = async (id: string) => rejectPendingProduct(id);
export const subscribeToQueue = (cb: (items: any[]) => void) => { getQueueProducts().then(cb); return () => {}; };

// Devices
export interface Device { id: string; name: string; type: string; }
export const subscribeToDevices = (cb: (d: Device[]) => void) => { cb([]); return () => {}; };
export const saveDevice = async (d: any) => {};
export const getDevices = async () => [];

// Cancellations  
export const subscribeToCancellations = (cb: (c: any[]) => void) => { getCancellationRequests().then(cb); return () => {}; };

// Sales
export const addSale = async (sale: any) => insertSale(sale);

// Product returns
export interface ProductReturn { id: string; }
export const getProductReturns = async () => [];
export const addProductReturn = async (r: any) => {};

// Suppliers subscribe
export const subscribeToSuppliers = (cb: (s: any[]) => void) => { getSuppliers().then(cb); return () => {}; };

// System logs
export interface SystemLog { id: string; action: string; user_name?: string; details?: string; created_at?: string; }

export const getSystemLogs = async (limit: number = 100) => getAllLogs();
export const getSales = async (limit: number = 100) => getAllSales();
export { getCancellationRequests, createCancellationRequest };
export const updateCancellationRequest = async (id: string, status: 'approved' | 'rejected', userId: string) => 
  updateCancellationStatus(id, status, userId);
export const getDevices = async () => [];
export const saveProductImageFirebase = async () => true;
export const addSystemLog = async (action: string, userName?: string, details?: string) => 
  insertLog({ action, user_name: userName, details });

export interface CancellationRequest {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  cashier: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

// Suppliers
export const getSuppliers = async () => {
  const suppliers = await getAllSuppliers();
  return suppliers.map(s => ({
    id: s.id, name: s.name, phone: s.phone || '', notes: s.address || '',
    totalDebt: 0, paymentHistory: [], created_at: s.created_at || '', updated_at: s.created_at || ''
  }));
};
export const saveSupplier = async (data: { name: string; phone?: string; notes?: string; totalDebt?: number }) => {
  return { id: crypto.randomUUID(), ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
};
export const updateSupplier = async (id: string, data: any) => {};
export type Supplier = { id: string; name: string; phone?: string; notes?: string; totalDebt?: number; paymentHistory?: any[]; created_at: string; updated_at: string; };
