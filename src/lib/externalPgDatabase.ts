// External PostgreSQL Database Layer - через Edge Function external-pg-query

const EXTERNAL_PG_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/external-pg-query`;

interface ExternalPGResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

const DEFAULT_TIMEOUT = 10000;
const MAX_RETRIES = 2;

export async function externalPgRequest<T = unknown>(
  action: string, 
  data?: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT
): Promise<ExternalPGResponse<T>> {
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(EXTERNAL_PG_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const result = await response.json();
      
      if (result.success) return result;
      
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      
      return result;
    } catch (error: any) {
      clearTimeout(timeoutId);
      
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      
      if (error.name === 'AbortError') {
        return { success: false, error: 'Timeout - сервер не отвечает' };
      }
      
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
  
  return { success: false, error: 'Все попытки исчерпаны' };
}

// === PRODUCTS ===

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  purchase_price: number;
  sale_price: number;
  quantity: number;
  unit: string;
  supplier_id?: string;
  expiry_date?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export async function getAllProducts(): Promise<Product[]> {
  const result = await externalPgRequest<Product[]>('get_products');
  return result.data || [];
}

export async function getProductByBarcode(barcode: string): Promise<Product | null> {
  const result = await externalPgRequest<Product>('get_product_by_barcode', { barcode });
  return result.data || null;
}

export async function insertProduct(product: Omit<Product, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; id?: string }> {
  const result = await externalPgRequest<{ insertId: string }>('insert_product', { product });
  return { success: result.success, id: result.data?.insertId };
}

export async function updateProduct(barcode: string, updates: Partial<Product>): Promise<boolean> {
  const result = await externalPgRequest('update_product', { barcode, updates });
  return result.success;
}

export async function deleteProduct(barcode: string): Promise<boolean> {
  const result = await externalPgRequest('delete_product', { barcode });
  return result.success;
}

export async function bulkInsertProducts(products: Array<Omit<Product, 'id' | 'created_at' | 'updated_at'>>): Promise<{ success: boolean; count?: number }> {
  const result = await externalPgRequest<{ count: number }>('bulk_insert_products', { products });
  return { success: result.success, count: result.data?.count };
}

// === SUPPLIERS ===

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  created_at?: string;
}

export async function getAllSuppliers(): Promise<Supplier[]> {
  const result = await externalPgRequest<Supplier[]>('get_suppliers');
  return result.data || [];
}

export async function insertSupplier(supplier: Omit<Supplier, 'id' | 'created_at'>): Promise<{ success: boolean; id?: string }> {
  const result = await externalPgRequest<{ insertId: string }>('insert_supplier', { supplier });
  return { success: result.success, id: result.data?.insertId };
}

// === SALES ===

export interface Sale {
  id: string;
  items: any;
  total: number;
  cashier_name: string;
  payment_method: string;
  created_at?: string;
}

export async function getAllSales(): Promise<Sale[]> {
  const result = await externalPgRequest<Sale[]>('get_sales');
  return result.data || [];
}

export async function insertSale(sale: Omit<Sale, 'id' | 'created_at'>): Promise<{ success: boolean; id?: string }> {
  const result = await externalPgRequest<{ insertId: string }>('insert_sale', { sale });
  return { success: result.success, id: result.data?.insertId };
}

// === EMPLOYEES ===

export interface Employee {
  id: string;
  name: string;
  role: string;
  phone?: string;
  login?: string;
  active: boolean;
  created_at?: string;
}

export async function getAllEmployees(): Promise<Employee[]> {
  const result = await externalPgRequest<Employee[]>('get_employees');
  return result.data || [];
}

// === SYSTEM LOGS ===

export interface SystemLog {
  id: string;
  action: string;
  user_name?: string;
  details?: string;
  created_at?: string;
}

export async function getAllLogs(): Promise<SystemLog[]> {
  const result = await externalPgRequest<SystemLog[]>('get_logs');
  return result.data || [];
}

export async function insertLog(action: string, userName?: string, details?: string): Promise<boolean> {
  const result = await externalPgRequest('insert_log', { action, user_name: userName, details });
  return result.success;
}

// === CANCELLATION REQUESTS ===

export interface CancellationRequest {
  id: string;
  items: any;
  cashier: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
}

export async function getCancellationRequests(): Promise<CancellationRequest[]> {
  const result = await externalPgRequest<CancellationRequest[]>('get_cancellations');
  return result.data || [];
}

// === PENDING PRODUCTS ===

export interface PendingProduct {
  id: string;
  barcode: string;
  name: string;
  purchase_price: number;
  sale_price: number;
  quantity: number;
  category?: string;
  supplier?: string;
  expiry_date?: string;
  photo_url?: string;
  front_photo?: string;
  barcode_photo?: string;
  added_by: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
}

export async function getPendingProducts(): Promise<PendingProduct[]> {
  const result = await externalPgRequest<PendingProduct[]>('get_pending_products');
  return result.data || [];
}

export async function createPendingProduct(product: Omit<PendingProduct, 'id' | 'status' | 'created_at'>): Promise<{ success: boolean; id?: string }> {
  const result = await externalPgRequest<{ insertId: string }>('create_pending_product', { product });
  return { success: result.success, id: result.data?.insertId };
}

export async function approvePendingProduct(id: string): Promise<boolean> {
  const result = await externalPgRequest('approve_pending_product', { id });
  return result.success;
}

export async function rejectPendingProduct(id: string): Promise<boolean> {
  const result = await externalPgRequest('reject_pending_product', { id });
  return result.success;
}

// === TEST CONNECTION ===

export async function testConnection(): Promise<boolean> {
  const result = await externalPgRequest('test_connection');
  return result.success;
}
