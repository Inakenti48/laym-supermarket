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
  lastUpdated: string;
  priceHistory: Array<{
    date: string;
    purchasePrice: number;
    retailPrice: number;
    changedBy: string;
  }>;
}

const STORAGE_KEY = 'inventory_products';

export const getStoredProducts = (): StoredProduct[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const findProductByBarcode = (barcode: string): StoredProduct | null => {
  const products = getStoredProducts();
  return products.find(p => p.barcode === barcode) || null;
};

export const saveProduct = (product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>, userId: string): StoredProduct => {
  const products = getStoredProducts();
  const existing = products.find(p => p.barcode === product.barcode);
  
  const now = new Date().toISOString();
  
  if (existing) {
    // Обновляем существующий товар
    const priceChanged = 
      existing.purchasePrice !== product.purchasePrice || 
      existing.retailPrice !== product.retailPrice;
    
    const updatedProduct: StoredProduct = {
      ...existing,
      ...product,
      lastUpdated: now,
      priceHistory: priceChanged
        ? [
            ...existing.priceHistory,
            {
              date: now,
              purchasePrice: product.purchasePrice,
              retailPrice: product.retailPrice,
              changedBy: userId,
            },
          ]
        : existing.priceHistory,
    };
    
    const filtered = products.filter(p => p.id !== existing.id);
    filtered.push(updatedProduct);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return updatedProduct;
  } else {
    // Создаем новый товар
    const newProduct: StoredProduct = {
      ...product,
      id: Date.now().toString(),
      lastUpdated: now,
      priceHistory: [
        {
          date: now,
          purchasePrice: product.purchasePrice,
          retailPrice: product.retailPrice,
          changedBy: userId,
        },
      ],
    };
    
    products.push(newProduct);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    return newProduct;
  }
};

export const getAllProducts = (): StoredProduct[] => {
  return getStoredProducts();
};

export const getExpiringProducts = (daysBeforeExpiry: number = 3): StoredProduct[] => {
  const products = getStoredProducts();
  const now = new Date();
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);
  
  return products.filter(product => {
    if (!product.expiryDate) return false;
    const expiryDate = new Date(product.expiryDate);
    return expiryDate >= now && expiryDate <= targetDate;
  });
};
