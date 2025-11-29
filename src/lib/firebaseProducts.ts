// DEPRECATED: Заглушка для обратной совместимости - все данные теперь в MySQL
import { getAllProducts, getProductByBarcode, insertProduct, updateProduct, deleteProduct, Product } from './mysqlDatabase';
import { StoredProduct } from './storage';

const convertToStoredProduct = (p: Product): StoredProduct => ({
  id: p.id, barcode: p.barcode, name: p.name, category: p.category || '',
  purchasePrice: p.purchase_price, retailPrice: p.sale_price, quantity: p.quantity,
  unit: 'шт', expiryDate: p.expiry_date, photos: [], paymentType: 'full',
  paidAmount: 0, debtAmount: 0, addedBy: p.created_by || '', supplier: p.supplier_id,
  lastUpdated: p.updated_at || '', priceHistory: []
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
    barcode: product.barcode, name: product.name, category: product.category || '',
    purchase_price: product.purchasePrice, sale_price: product.retailPrice,
    quantity: product.quantity, unit: product.unit || 'шт',
    expiry_date: product.expiryDate, created_by: userId
  });
  return { ...product, id: crypto.randomUUID(), lastUpdated: new Date().toISOString(), priceHistory: [] };
};

export const updateFirebaseProductQuantity = async (barcode: string, change: number) => {
  const product = await getProductByBarcode(barcode);
  if (product) await updateProduct(barcode, { quantity: product.quantity + change });
};

export const removeFirebaseExpiredProduct = async (barcode: string) => {
  const product = await findFirebaseProductByBarcode(barcode);
  await deleteProduct(barcode);
  return product;
};

export const getFirebaseExpiringProducts = async (days: number = 3): Promise<StoredProduct[]> => {
  const products = await getAllFirebaseProducts();
  const limit = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return products.filter(p => p.expiryDate && new Date(p.expiryDate) <= limit);
};

export const searchFirebaseProducts = async (query: string): Promise<StoredProduct[]> => {
  const products = await getAllFirebaseProducts();
  const q = query.toLowerCase();
  return products.filter(p => p.name.toLowerCase().includes(q) || p.barcode.includes(q));
};

export const enableFirebaseSync = () => console.log('MySQL sync enabled');
export const subscribeToFirebaseProducts = (callback: (products: StoredProduct[]) => void) => {
  getAllFirebaseProducts().then(callback);
  return () => {};
};
export const getFirebaseStatus = () => ({ mode: 'MySQL', message: 'MySQL подключен', connected: true });
export const testFirebaseConnection = async () => true;
export const initializeWithTestProducts = async () => {};
export const retryFirebaseConnection = async () => true;
export const clearAllFirebaseProducts = async () => {};
export const disableFirebaseSync = () => {};
export const isFirebaseEnabled = () => true;
