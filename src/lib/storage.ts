// MySQL Storage Layer - все операции через MySQL (без localStorage кэша)
import {
  getAllProducts as mysqlGetAllProducts,
  getProductByBarcode as mysqlGetProductByBarcode,
  insertProduct as mysqlInsertProduct,
  updateProduct as mysqlUpdateProduct,
  deleteProduct as mysqlDeleteProduct,
  getCancellationRequests as mysqlGetCancellations,
  createCancellationRequest as mysqlCreateCancellation,
  updateCancellationStatus as mysqlUpdateCancellation,
  insertSale,
  Product,
} from './mysqlDatabase';

export interface StoredProduct {
  id: string;
  barcode: string;
  name: string;
  category: string;
  purchasePrice: number;
  retailPrice: number;
  quantity: number;
  unit: 'шт';
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

// Конвертация MySQL Product в StoredProduct
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
  paidAmount: p.purchase_price * p.quantity,
  debtAmount: 0,
  addedBy: p.created_by || '',
  supplier: p.supplier_id,
  lastUpdated: p.updated_at || p.created_at || new Date().toISOString(),
  priceHistory: [{
    date: p.created_at || new Date().toISOString(),
    purchasePrice: p.purchase_price,
    retailPrice: p.sale_price,
    changedBy: p.created_by || ''
  }]
});

// Сохранение фото товара в S3
export const saveProductImage = async (
  barcode: string, 
  productName: string, 
  imageBase64: string,
  userId?: string
): Promise<boolean> => {
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload',
        fileName: `${barcode}_${Date.now()}.jpg`,
        fileData: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
        contentType: 'image/jpeg',
        folder: 'products'
      })
    });
    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('❌ Ошибка загрузки фото:', error);
    return false;
  }
};

// === ФУНКЦИИ РАБОТЫ С ТОВАРАМИ ===

// Memory cache для быстрого доступа
let productsCache: StoredProduct[] = [];
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 секунд

export const getStoredProducts = async (): Promise<StoredProduct[]> => {
  const now = Date.now();
  
  // Используем кэш если он свежий
  if (productsCache.length > 0 && (now - cacheTime) < CACHE_TTL) {
    return productsCache;
  }
  
  try {
    console.log('📦 Загрузка товаров из MySQL...');
    const products = await mysqlGetAllProducts();
    productsCache = products.map(convertToStoredProduct);
    cacheTime = now;
    return productsCache;
  } catch (error) {
    console.warn('⚠️ MySQL недоступен');
    return productsCache;
  }
};

export const findProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  if (!barcode) return null;
  
  try {
    const product = await mysqlGetProductByBarcode(barcode);
    if (!product) return null;
    return convertToStoredProduct(product);
  } catch (error) {
    console.warn('⚠️ MySQL недоступен');
    // Попробуем найти в кэше
    return productsCache.find(p => p.barcode === barcode) || null;
  }
};

export const saveProduct = async (
  product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>, 
  userId: string
): Promise<StoredProduct> => {
  const newProduct: StoredProduct = {
    ...product,
    id: crypto.randomUUID(),
    lastUpdated: new Date().toISOString(),
    priceHistory: [{
      date: new Date().toISOString(),
      purchasePrice: product.purchasePrice,
      retailPrice: product.retailPrice,
      changedBy: userId
    }]
  };
  
  // Сохраняем в MySQL
  await mysqlInsertProduct({
    barcode: product.barcode,
    name: product.name,
    category: product.category,
    purchase_price: product.purchasePrice,
    sale_price: product.retailPrice,
    quantity: product.quantity,
    unit: product.unit,
    supplier_id: product.supplier,
    expiry_date: product.expiryDate,
    created_by: userId
  });
  
  // Обновляем кэш
  const existingIndex = productsCache.findIndex(p => p.barcode === product.barcode);
  if (existingIndex >= 0) {
    productsCache[existingIndex] = { 
      ...productsCache[existingIndex], 
      ...newProduct, 
      quantity: productsCache[existingIndex].quantity + product.quantity 
    };
  } else {
    productsCache.push(newProduct);
  }
  
  console.log('☁️ Товар сохранен в MySQL');
  return newProduct;
};

export const getAllProducts = async (): Promise<StoredProduct[]> => {
  return getStoredProducts();
};

export const getExpiringProducts = async (daysBeforeExpiry: number = 3): Promise<StoredProduct[]> => {
  const products = await getStoredProducts();
  const now = new Date();
  const limitDate = new Date(now.getTime() + daysBeforeExpiry * 24 * 60 * 60 * 1000);
  return products.filter(p => p.expiryDate && new Date(p.expiryDate) <= limitDate);
};

export const isProductExpired = (product: StoredProduct): boolean => {
  if (!product.expiryDate) return false;
  return new Date(product.expiryDate) < new Date();
};

export const updateProductQuantity = async (barcode: string, quantityChange: number): Promise<void> => {
  // Обновляем кэш
  const index = productsCache.findIndex(p => p.barcode === barcode);
  if (index >= 0) {
    productsCache[index].quantity += quantityChange;
  }
  
  // Синхронизируем с MySQL
  try {
    const product = await mysqlGetProductByBarcode(barcode);
    if (product) {
      await mysqlUpdateProduct(barcode, { quantity: product.quantity + quantityChange });
    }
  } catch (error) {
    console.warn('⚠️ Не удалось синхронизировать количество с MySQL:', error);
  }
};

export const removeExpiredProduct = async (barcode: string): Promise<StoredProduct | null> => {
  let removedProduct: StoredProduct | null = null;
  
  const index = productsCache.findIndex(p => p.barcode === barcode);
  if (index >= 0) {
    removedProduct = productsCache[index];
    productsCache.splice(index, 1);
  }
  
  try {
    await mysqlDeleteProduct(barcode);
  } catch (error) {
    console.warn('⚠️ Не удалось удалить из MySQL:', error);
  }
  
  return removedProduct;
};

// Upsert товара
export const upsertProduct = async (
  productData: {
    barcode: string;
    name: string;
    category?: string;
    supplier?: string | null;
    unit?: string;
    purchase_price: number;
    sale_price: number;
    quantity: number;
    expiry_date?: string | null;
    created_by?: string;
  }
): Promise<{ success: boolean; isUpdate: boolean; newQuantity?: number }> => {
  const existingIndex = productsCache.findIndex(p => p.barcode === productData.barcode);
  
  let newQuantity = productData.quantity;
  let isUpdate = false;
  
  if (existingIndex >= 0) {
    isUpdate = true;
    newQuantity = productsCache[existingIndex].quantity + productData.quantity;
    productsCache[existingIndex] = {
      ...productsCache[existingIndex],
      name: productData.name,
      category: productData.category || productsCache[existingIndex].category,
      supplier: productData.supplier || productsCache[existingIndex].supplier,
      purchasePrice: productData.purchase_price,
      retailPrice: productData.sale_price,
      quantity: newQuantity,
      expiryDate: productData.expiry_date || productsCache[existingIndex].expiryDate,
      lastUpdated: new Date().toISOString()
    };
  } else {
    const newProduct: StoredProduct = {
      id: crypto.randomUUID(),
      barcode: productData.barcode,
      name: productData.name,
      category: productData.category || '',
      supplier: productData.supplier || undefined,
      unit: 'шт',
      purchasePrice: productData.purchase_price,
      retailPrice: productData.sale_price,
      quantity: productData.quantity,
      expiryDate: productData.expiry_date || undefined,
      paymentType: 'full',
      paidAmount: productData.purchase_price * productData.quantity,
      debtAmount: 0,
      addedBy: productData.created_by || '',
      photos: [],
      lastUpdated: new Date().toISOString(),
      priceHistory: [{
        date: new Date().toISOString(),
        purchasePrice: productData.purchase_price,
        retailPrice: productData.sale_price,
        changedBy: productData.created_by || ''
      }]
    };
    productsCache.push(newProduct);
  }
  
  // Синхронизируем с MySQL
  try {
    const existing = await mysqlGetProductByBarcode(productData.barcode);
    if (existing) {
      await mysqlUpdateProduct(productData.barcode, {
        name: productData.name,
        category: productData.category || '',
        purchase_price: productData.purchase_price,
        sale_price: productData.sale_price,
        quantity: newQuantity,
        expiry_date: productData.expiry_date || undefined
      });
    } else {
      await mysqlInsertProduct({
        barcode: productData.barcode,
        name: productData.name,
        category: productData.category || '',
        purchase_price: productData.purchase_price,
        sale_price: productData.sale_price,
        quantity: productData.quantity,
        unit: productData.unit || 'шт',
        expiry_date: productData.expiry_date || undefined,
        created_by: productData.created_by
      });
    }
    return { success: true, isUpdate, newQuantity };
  } catch (error) {
    console.warn('⚠️ MySQL недоступен:', error);
    return { success: true, isUpdate, newQuantity };
  }
};

// Обновить товар по ID
export const updateProductById = async (
  id: string,
  updates: Partial<{
    quantity: number;
    name: string;
    category: string;
    supplier: string | null;
    purchasePrice: number;
    salePrice: number;
    expiryDate: string | null;
  }>
): Promise<boolean> => {
  try {
    const product = productsCache.find(p => p.id === id);
    if (product) {
      const mysqlUpdates: Partial<Product> = {};
      if (updates.quantity !== undefined) mysqlUpdates.quantity = updates.quantity;
      if (updates.name !== undefined) mysqlUpdates.name = updates.name;
      if (updates.category !== undefined) mysqlUpdates.category = updates.category;
      if (updates.purchasePrice !== undefined) mysqlUpdates.purchase_price = updates.purchasePrice;
      if (updates.salePrice !== undefined) mysqlUpdates.sale_price = updates.salePrice;
      if (updates.expiryDate !== undefined) mysqlUpdates.expiry_date = updates.expiryDate || undefined;
      
      await mysqlUpdateProduct(product.barcode, mysqlUpdates);
      
      // Обновляем кэш
      Object.assign(product, updates);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Ошибка обновления товара:', error);
    return false;
  }
};

// Получить товар по ID
export const getProductById = async (id: string): Promise<StoredProduct | null> => {
  return productsCache.find(p => p.id === id) || null;
};

// Удалить товар
export const deleteProduct = async (barcode: string): Promise<boolean> => {
  try {
    await mysqlDeleteProduct(barcode);
    
    // Удаляем из кэша
    const index = productsCache.findIndex(p => p.barcode === barcode);
    if (index >= 0) {
      productsCache.splice(index, 1);
    }
    return true;
  } catch (error) {
    console.error('❌ Ошибка удаления товара:', error);
    return false;
  }
};

// === СИСТЕМА ОТМЕНЫ ТОВАРОВ ===

export interface CancellationRequest {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  cashier: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const getCancellationRequests = async (): Promise<CancellationRequest[]> => {
  const requests = await mysqlGetCancellations();
  return requests.map(r => ({
    id: r.id,
    items: r.items,
    cashier: r.cashier,
    requestedAt: r.created_at || '',
    status: r.status
  }));
};

export const createCancellationRequest = async (
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>, 
  cashier: string
): Promise<CancellationRequest> => {
  const result = await mysqlCreateCancellation(items, cashier);
  return {
    id: result.id || crypto.randomUUID(),
    items,
    cashier,
    requestedAt: new Date().toISOString(),
    status: 'pending'
  };
};

export const approveCancellation = async (id: string, adminId: string): Promise<void> => {
  await mysqlUpdateCancellation(id, 'approved', adminId);
};

export const rejectCancellation = async (id: string, adminId: string): Promise<void> => {
  await mysqlUpdateCancellation(id, 'rejected', adminId);
};

// === ПРОДАЖИ ===

export const recordSale = async (
  barcode: string,
  productName: string,
  quantity: number,
  unitPrice: number,
  cashier: string,
  paymentMethod: string = 'cash'
): Promise<boolean> => {
  try {
    await insertSale({
      barcode,
      product_name: productName,
      quantity,
      unit_price: unitPrice,
      total_price: quantity * unitPrice,
      cashier,
      payment_method: paymentMethod
    });
    return true;
  } catch (error) {
    console.error('❌ Ошибка записи продажи:', error);
    return false;
  }
};

// Invalidate cache
export const invalidateProductsCache = (): void => {
  productsCache = [];
  cacheTime = 0;
};
