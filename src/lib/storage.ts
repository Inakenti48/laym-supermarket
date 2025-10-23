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

export const isProductExpired = (product: StoredProduct): boolean => {
  if (!product.expiryDate) return false;
  const now = new Date();
  const expiryDate = new Date(product.expiryDate);
  return expiryDate < now;
};

export const updateProductQuantity = (barcode: string, quantityChange: number): void => {
  const products = getStoredProducts();
  const updated = products.map(p => {
    if (p.barcode === barcode) {
      return { ...p, quantity: p.quantity + quantityChange };
    }
    return p;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
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

export const getSuppliers = (): Supplier[] => {
  const data = localStorage.getItem(SUPPLIERS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveSupplier = (supplier: Omit<Supplier, 'id' | 'createdAt' | 'lastUpdated' | 'paymentHistory'>, userId: string): Supplier => {
  const suppliers = getSuppliers();
  const now = new Date().toISOString();
  
  const newSupplier: Supplier = {
    ...supplier,
    id: Date.now().toString(),
    paymentHistory: [],
    createdAt: now,
    lastUpdated: now,
  };
  
  suppliers.push(newSupplier);
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(suppliers));
  return newSupplier;
};

export const updateSupplier = (id: string, updates: Partial<Supplier>): void => {
  const suppliers = getSuppliers();
  const updated = suppliers.map(s => {
    if (s.id === id) {
      return { ...s, ...updates, lastUpdated: new Date().toISOString() };
    }
    return s;
  });
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(updated));
};

export const addSupplierPayment = (
  supplierId: string, 
  payment: {
    amount: number;
    paymentType: 'full' | 'partial' | 'debt';
    productName: string;
    productQuantity: number;
    productPrice: number;
  },
  userId: string
): void => {
  const suppliers = getSuppliers();
  const updated = suppliers.map(s => {
    if (s.id === supplierId) {
      const totalCost = payment.productPrice * payment.productQuantity;
      const newDebt = payment.paymentType === 'full' 
        ? s.totalDebt 
        : payment.paymentType === 'debt'
        ? s.totalDebt + totalCost
        : s.totalDebt + (totalCost - payment.amount);
      
      return {
        ...s,
        totalDebt: Math.max(0, newDebt),
        paymentHistory: [
          ...s.paymentHistory,
          {
            date: new Date().toISOString(),
            amount: payment.amount,
            paymentType: payment.paymentType,
            productName: payment.productName,
            productQuantity: payment.productQuantity,
            productPrice: payment.productPrice,
            changedBy: userId,
          }
        ],
        lastUpdated: new Date().toISOString(),
      };
    }
    return s;
  });
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(updated));
};

export const paySupplierDebt = (supplierId: string, amount: number, userId: string): void => {
  const suppliers = getSuppliers();
  const updated = suppliers.map(s => {
    if (s.id === supplierId) {
      return {
        ...s,
        totalDebt: Math.max(0, s.totalDebt - amount),
        paymentHistory: [
          ...s.paymentHistory,
          {
            date: new Date().toISOString(),
            amount: -amount,
            paymentType: 'partial' as const,
            productName: 'Погашение долга',
            productQuantity: 0,
            productPrice: 0,
            changedBy: userId,
          }
        ],
        lastUpdated: new Date().toISOString(),
      };
    }
    return s;
  });
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(updated));
};
