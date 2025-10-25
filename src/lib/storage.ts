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

export const getStoredProducts = async (): Promise<StoredProduct[]> => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const findProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  if (!barcode) return null;
  const products = await getStoredProducts();
  return products.find(p => p.barcode === barcode) || null;
};

export const saveProduct = async (product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>, userId: string): Promise<StoredProduct> => {
  const products = await getStoredProducts();
  const now = new Date().toISOString();
  
  // Ищем существующий товар только если есть штрихкод
  const existing = product.barcode ? await findProductByBarcode(product.barcode) : null;
  
  if (existing) {
    // Обновляем количество и цены существующего товара
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
    
    const updated: StoredProduct = {
      ...existing,
      ...product,
      quantity: existing.quantity + product.quantity,
      lastUpdated: now,
      priceHistory: newPriceHistory,
    };
    
    const updatedProducts = products.map(p => 
      p.barcode === product.barcode ? updated : p
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProducts));
    return updated;
  } else {
    // Создаем новый товар
    const newProduct: StoredProduct = {
      ...product,
      id: Date.now().toString(),
      barcode: product.barcode || `NO-BARCODE-${Date.now()}`, // Генерируем уникальный ID если нет штрихкода
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
    
    const updatedProducts = [...products, newProduct];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProducts));
    return newProduct;
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
  const products = await getStoredProducts();
  const product = await findProductByBarcode(barcode);
  
  if (!product) {
    throw new Error(`Товар с штрихкодом ${barcode} не найден`);
  }
  
  const updatedProducts = products.map(p => {
    if (p.barcode === barcode) {
      return { ...p, quantity: p.quantity + quantityChange };
    }
    return p;
  });
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProducts));
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
  const data = localStorage.getItem(SUPPLIERS_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

export const saveSupplier = async (supplier: Omit<Supplier, 'id' | 'createdAt' | 'lastUpdated' | 'paymentHistory'>, userId: string): Promise<Supplier> => {
  const suppliers = await getSuppliers();
  const now = new Date().toISOString();
  
  const newSupplier: Supplier = {
    ...supplier,
    id: Date.now().toString(),
    paymentHistory: [],
    createdAt: now,
    lastUpdated: now,
  };
  
  const updatedSuppliers = [...suppliers, newSupplier];
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(updatedSuppliers));
  return newSupplier;
};

export const updateSupplier = async (id: string, updates: Partial<Supplier>): Promise<void> => {
  const suppliers = await getSuppliers();
  const updatedSuppliers = suppliers.map(s => {
    if (s.id === id) {
      return { ...s, ...updates, lastUpdated: new Date().toISOString() };
    }
    return s;
  });
  localStorage.setItem(SUPPLIERS_KEY, JSON.stringify(updatedSuppliers));
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
