// Unified Database Layer - переключение между MySQL, PostgreSQL и External PG
import { getDatabaseMode } from './databaseMode';
import { supabase } from '@/integrations/supabase/client';
import * as mysql from './mysqlDatabase';
import * as externalPg from './externalPgDatabase';

// === PRODUCTS ===

export interface UnifiedProduct {
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

export async function getAllProducts(): Promise<UnifiedProduct[]> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.getAllProducts();
  }
  
  if (mode === 'external_pg') {
    return externalPg.getAllProducts();
  }
  
  // PostgreSQL (Cloud)
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('PostgreSQL getAllProducts error:', error);
    return [];
  }
  
  return (data || []).map(p => ({
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    category: p.category,
    purchase_price: p.purchase_price,
    sale_price: p.sale_price,
    quantity: p.quantity,
    unit: p.unit,
    supplier_id: p.supplier || undefined,
    expiry_date: p.expiry_date || undefined,
    created_by: p.created_by || undefined,
    created_at: p.created_at,
    updated_at: p.updated_at
  }));
}

export async function getProductByBarcode(barcode: string): Promise<UnifiedProduct | null> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.getProductByBarcode(barcode);
  }
  
  if (mode === 'external_pg') {
    return externalPg.getProductByBarcode(barcode);
  }
  
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
    purchase_price: data.purchase_price,
    sale_price: data.sale_price,
    quantity: data.quantity,
    unit: data.unit,
    supplier_id: data.supplier || undefined,
    expiry_date: data.expiry_date || undefined,
    created_by: data.created_by || undefined,
    created_at: data.created_at,
    updated_at: data.updated_at
  };
}

export async function insertProduct(product: Omit<UnifiedProduct, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; id?: string }> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.insertProduct(product);
  }
  
  if (mode === 'external_pg') {
    return externalPg.insertProduct(product);
  }
  
  const { data, error } = await supabase
    .from('products')
    .insert({
      barcode: product.barcode,
      name: product.name,
      category: product.category,
      purchase_price: product.purchase_price,
      sale_price: product.sale_price,
      quantity: product.quantity,
      unit: product.unit,
      supplier: product.supplier_id,
      expiry_date: product.expiry_date,
      created_by: product.created_by
    })
    .select('id')
    .single();
  
  return { success: !error, id: data?.id };
}

export async function updateProduct(barcode: string, updates: Partial<UnifiedProduct>): Promise<boolean> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.updateProduct(barcode, updates);
  }
  
  if (mode === 'external_pg') {
    return externalPg.updateProduct(barcode, updates);
  }
  
  const { error } = await supabase
    .from('products')
    .update({
      name: updates.name,
      category: updates.category,
      purchase_price: updates.purchase_price,
      sale_price: updates.sale_price,
      quantity: updates.quantity,
      unit: updates.unit,
      supplier: updates.supplier_id,
      expiry_date: updates.expiry_date
    })
    .eq('barcode', barcode);
  
  return !error;
}

export async function deleteProduct(barcode: string): Promise<boolean> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.deleteProduct(barcode);
  }
  
  if (mode === 'external_pg') {
    return externalPg.deleteProduct(barcode);
  }
  
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('barcode', barcode);
  
  return !error;
}

// === SUPPLIERS ===

export interface UnifiedSupplier {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  contact?: string;
  created_at?: string;
}

export async function getAllSuppliers(): Promise<UnifiedSupplier[]> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.getAllSuppliers();
  }
  
  if (mode === 'external_pg') {
    return externalPg.getAllSuppliers();
  }
  
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) return [];
  
  return (data || []).map(s => ({
    id: s.id,
    name: s.name,
    phone: s.phone || undefined,
    address: s.address || undefined,
    contact: s.contact_person || undefined,
    created_at: s.created_at
  }));
}

export async function insertSupplier(supplier: Omit<UnifiedSupplier, 'id' | 'created_at'>): Promise<{ success: boolean; id?: string }> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.insertSupplier(supplier);
  }
  
  if (mode === 'external_pg') {
    return externalPg.insertSupplier(supplier);
  }
  
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
      contact_person: supplier.contact
    })
    .select('id')
    .single();
  
  return { success: !error, id: data?.id };
}

// === SALES ===

export interface UnifiedSale {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  total: number;
  cashier_name: string;
  payment_method: string;
  created_at?: string;
}

export async function getAllSales(): Promise<UnifiedSale[]> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    const sales = await mysql.getAllSales();
    return sales.map(s => ({
      id: s.id,
      items: [{ barcode: s.barcode, name: s.product_name, quantity: s.quantity, price: s.unit_price }],
      total: s.total_price,
      cashier_name: s.cashier,
      payment_method: s.payment_method,
      created_at: s.sold_at
    }));
  }
  
  if (mode === 'external_pg') {
    const sales = await externalPg.getAllSales();
    return sales.map(s => ({
      id: s.id,
      items: typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []),
      total: s.total,
      cashier_name: s.cashier_name,
      payment_method: s.payment_method,
      created_at: s.created_at
    }));
  }
  
  const { data, error } = await supabase
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) return [];
  
  return (data || []).map(s => ({
    id: s.id,
    items: (s.items as any) || [],
    total: s.total,
    cashier_name: s.cashier_name,
    payment_method: s.payment_method,
    created_at: s.created_at
  }));
}

export async function insertSale(sale: Omit<UnifiedSale, 'id' | 'created_at'>): Promise<{ success: boolean; id?: string }> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    const item = sale.items[0];
    if (!item) return { success: false };
    
    return mysql.insertSale({
      barcode: item.barcode,
      product_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: sale.total,
      cashier: sale.cashier_name,
      payment_method: sale.payment_method
    });
  }
  
  if (mode === 'external_pg') {
    return externalPg.insertSale(sale);
  }
  
  const { data, error } = await supabase
    .from('sales')
    .insert({
      items: sale.items,
      total: sale.total,
      cashier_name: sale.cashier_name,
      cashier_role: 'cashier',
      payment_method: sale.payment_method
    })
    .select('id')
    .single();
  
  return { success: !error, id: data?.id };
}

// === EMPLOYEES ===

export interface UnifiedEmployee {
  id: string;
  name: string;
  role: string;
  phone?: string;
  login?: string;
  active: boolean;
  created_at?: string;
}

export async function getAllEmployees(): Promise<UnifiedEmployee[]> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    const employees = await mysql.getAllEmployees();
    return employees.map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      phone: e.phone,
      login: e.login,
      active: e.active,
      created_at: e.created_at
    }));
  }
  
  if (mode === 'external_pg') {
    const employees = await externalPg.getAllEmployees();
    return employees.map(e => ({
      id: e.id,
      name: e.name,
      role: e.role,
      phone: e.phone,
      login: e.login,
      active: e.active,
      created_at: e.created_at
    }));
  }
  
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) return [];
  
  return (data || []).map(e => ({
    id: e.id,
    name: e.name,
    role: e.position,
    phone: undefined,
    login: e.login || undefined,
    active: true,
    created_at: e.created_at
  }));
}

export async function insertEmployee(employee: Omit<UnifiedEmployee, 'id' | 'created_at'>): Promise<{ success: boolean; id?: string }> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.insertEmployee(employee);
  }
  
  // External PG and Cloud PG use same Supabase structure
  const { data, error } = await supabase
    .from('employees')
    .insert({
      name: employee.name,
      position: employee.role,
      login: employee.login
    })
    .select('id')
    .single();
  
  return { success: !error, id: data?.id };
}

// === SYSTEM LOGS ===

export async function getAllLogs(): Promise<mysql.SystemLog[]> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.getAllLogs();
  }
  
  if (mode === 'external_pg') {
    return externalPg.getAllLogs();
  }
  
  const { data, error } = await supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  
  if (error) return [];
  
  return (data || []).map(l => ({
    id: l.id,
    action: l.message,
    user_name: l.user_name || undefined,
    details: undefined,
    created_at: l.created_at
  }));
}

export async function insertLog(action: string, userName?: string, details?: string): Promise<boolean> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.insertLog(action, userName, details);
  }
  
  if (mode === 'external_pg') {
    return externalPg.insertLog(action, userName, details);
  }
  
  const { error } = await supabase
    .from('system_logs')
    .insert({
      message: `${action}${details ? `: ${details}` : ''}`,
      user_name: userName
    });
  
  return !error;
}

// === PENDING PRODUCTS (Queue) ===

export interface UnifiedPendingProduct {
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
  image_url?: string;
  added_by: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at?: string;
}

export async function getPendingProducts(): Promise<UnifiedPendingProduct[]> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.getPendingProducts();
  }
  
  if (mode === 'external_pg') {
    const pending = await externalPg.getPendingProducts();
    return pending.map(p => ({
      ...p,
      image_url: p.photo_url
    }));
  }
  
  const { data, error } = await supabase
    .from('vremenno_product_foto')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) return [];
  
  return (data || []).map(p => ({
    id: p.id,
    barcode: p.barcode,
    name: p.product_name,
    purchase_price: p.purchase_price || 0,
    sale_price: p.retail_price || 0,
    quantity: p.quantity || 1,
    category: p.category || undefined,
    supplier: p.supplier || undefined,
    expiry_date: p.expiry_date || undefined,
    photo_url: p.image_url || undefined,
    front_photo: p.front_photo || undefined,
    barcode_photo: p.barcode_photo || undefined,
    image_url: p.image_url,
    added_by: p.created_by || 'unknown',
    status: 'pending' as const,
    created_at: p.created_at || undefined
  }));
}

export async function createPendingProduct(product: Omit<UnifiedPendingProduct, 'id' | 'status' | 'created_at'>): Promise<{ success: boolean; id?: string }> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.createPendingProduct(product);
  }
  
  if (mode === 'external_pg') {
    return externalPg.createPendingProduct(product);
  }
  
  const { data, error } = await supabase
    .from('vremenno_product_foto')
    .insert({
      barcode: product.barcode,
      product_name: product.name,
      purchase_price: product.purchase_price,
      retail_price: product.sale_price,
      quantity: product.quantity,
      category: product.category,
      supplier: product.supplier,
      expiry_date: product.expiry_date,
      image_url: product.image_url || product.photo_url || '',
      storage_path: '',
      front_photo: product.front_photo,
      barcode_photo: product.barcode_photo,
      created_by: product.added_by
    })
    .select('id')
    .single();
  
  return { success: !error, id: data?.id };
}

export async function approvePendingProduct(id: string): Promise<boolean> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.approvePendingProduct(id);
  }
  
  if (mode === 'external_pg') {
    return externalPg.approvePendingProduct(id);
  }
  
  const { error } = await supabase
    .from('vremenno_product_foto')
    .delete()
    .eq('id', id);
  
  return !error;
}

export async function rejectPendingProduct(id: string): Promise<boolean> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.rejectPendingProduct(id);
  }
  
  if (mode === 'external_pg') {
    return externalPg.rejectPendingProduct(id);
  }
  
  const { error } = await supabase
    .from('vremenno_product_foto')
    .delete()
    .eq('id', id);
  
  return !error;
}

// === CANCELLATION REQUESTS ===

export async function getCancellationRequests(): Promise<mysql.CancellationRequest[]> {
  const mode = getDatabaseMode();
  
  if (mode === 'mysql') {
    return mysql.getCancellationRequests();
  }
  
  if (mode === 'external_pg') {
    const cancellations = await externalPg.getCancellationRequests();
    return cancellations.map(c => ({
      id: c.id,
      items: typeof c.items === 'string' ? JSON.parse(c.items) : (c.items || []),
      cashier: c.cashier,
      status: c.status,
      created_at: c.created_at
    }));
  }
  
  const { data, error } = await supabase
    .from('cancellation_requests')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) return [];
  
  return (data || []).map(c => ({
    id: c.id,
    items: [{ barcode: c.barcode, name: c.product_name, quantity: c.quantity, price: 0 }],
    cashier: c.requested_by || 'unknown',
    status: c.status as 'pending' | 'approved' | 'rejected',
    created_at: c.created_at,
    processed_at: c.updated_at,
    processed_by: undefined
  }));
}

// === TEST CONNECTION ===

export async function testConnection(): Promise<{ mysql: boolean; postgresql: boolean; external_pg: boolean }> {
  const mysqlOk = await mysql.testConnection();
  const externalPgOk = await externalPg.testConnection();
  
  const { error } = await supabase.from('products').select('id').limit(1);
  const pgOk = !error;
  
  return { mysql: mysqlOk, postgresql: pgOk, external_pg: externalPgOk };
}

// Получить текущий режим БД
export { getDatabaseMode } from './databaseMode';
