// Локальная база данных IndexedDB для оффлайн работы и синхронизации
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface LocalDB extends DBSchema {
  products: {
    key: string;
    value: {
      id: string;
      data: any;
      syncStatus: 'pending' | 'synced' | 'error';
      createdAt: number;
      updatedAt: number;
      lastSyncAttempt?: number;
      syncError?: string;
    };
    indexes: { 'by-sync-status': string; 'by-created': number };
  };
  suppliers: {
    key: string;
    value: {
      id: string;
      data: any;
      syncStatus: 'pending' | 'synced' | 'error';
      createdAt: number;
      updatedAt: number;
      lastSyncAttempt?: number;
      syncError?: string;
    };
    indexes: { 'by-sync-status': string; 'by-created': number };
  };
  employees: {
    key: string;
    value: {
      id: string;
      data: any;
      syncStatus: 'pending' | 'synced' | 'error';
      createdAt: number;
      updatedAt: number;
      lastSyncAttempt?: number;
      syncError?: string;
    };
    indexes: { 'by-sync-status': string; 'by-created': number };
  };
  logs: {
    key: number;
    value: {
      id: number;
      message: string;
      userId?: string;
      userName?: string;
      syncStatus: 'pending' | 'synced' | 'error';
      createdAt: number;
      lastSyncAttempt?: number;
    };
    indexes: { 'by-sync-status': string; 'by-created': number };
  };
  product_images: {
    key: string;
    value: {
      id: string;
      barcode: string;
      productName: string;
      imageData: string; // base64
      syncStatus: 'pending' | 'synced' | 'error';
      createdAt: number;
      lastSyncAttempt?: number;
    };
    indexes: { 'by-sync-status': string; 'by-barcode': string };
  };
  sync_queue: {
    key: number;
    value: {
      id: number;
      type: 'product' | 'supplier' | 'employee' | 'log' | 'image';
      itemId: string;
      action: 'create' | 'update' | 'delete';
      data: any;
      attempts: number;
      maxAttempts: number;
      lastAttempt?: number;
      error?: string;
      createdAt: number;
    };
    indexes: { 'by-type': string; 'by-created': number };
  };
}

let dbInstance: IDBPDatabase<LocalDB> | null = null;

// Инициализация локальной базы данных
export async function initLocalDB(): Promise<IDBPDatabase<LocalDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<LocalDB>('SupermarketLocalDB', 1, {
    upgrade(db) {
      // Таблица товаров
      if (!db.objectStoreNames.contains('products')) {
        const productStore = db.createObjectStore('products', { keyPath: 'id' });
        productStore.createIndex('by-sync-status', 'syncStatus');
        productStore.createIndex('by-created', 'createdAt');
      }

      // Таблица поставщиков
      if (!db.objectStoreNames.contains('suppliers')) {
        const supplierStore = db.createObjectStore('suppliers', { keyPath: 'id' });
        supplierStore.createIndex('by-sync-status', 'syncStatus');
        supplierStore.createIndex('by-created', 'createdAt');
      }

      // Таблица сотрудников
      if (!db.objectStoreNames.contains('employees')) {
        const employeeStore = db.createObjectStore('employees', { keyPath: 'id' });
        employeeStore.createIndex('by-sync-status', 'syncStatus');
        employeeStore.createIndex('by-created', 'createdAt');
      }

      // Таблица логов
      if (!db.objectStoreNames.contains('logs')) {
        const logStore = db.createObjectStore('logs', { keyPath: 'id', autoIncrement: true });
        logStore.createIndex('by-sync-status', 'syncStatus');
        logStore.createIndex('by-created', 'createdAt');
      }

      // Таблица изображений товаров
      if (!db.objectStoreNames.contains('product_images')) {
        const imageStore = db.createObjectStore('product_images', { keyPath: 'id' });
        imageStore.createIndex('by-sync-status', 'syncStatus');
        imageStore.createIndex('by-barcode', 'barcode');
      }

      // Очередь синхронизации
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('by-type', 'type');
        queueStore.createIndex('by-created', 'createdAt');
      }
    },
  });

  console.log('✅ Локальная база данных инициализирована');
  return dbInstance;
}

// Сохранение товара локально
export async function saveProductLocally(product: any): Promise<string> {
  const db = await initLocalDB();
  const id = product.id || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.put('products', {
    id,
    data: product,
    syncStatus: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Добавляем в очередь синхронизации
  await db.add('sync_queue', {
    id: Date.now(),
    type: 'product',
    itemId: id,
    action: 'create',
    data: product,
    attempts: 0,
    maxAttempts: 5,
    createdAt: Date.now(),
  });

  console.log('💾 Товар сохранен локально:', id);
  return id;
}

// Сохранение поставщика локально
export async function saveSupplierLocally(supplier: any): Promise<string> {
  const db = await initLocalDB();
  const id = supplier.id || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.put('suppliers', {
    id,
    data: supplier,
    syncStatus: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await db.add('sync_queue', {
    id: Date.now(),
    type: 'supplier',
    itemId: id,
    action: 'create',
    data: supplier,
    attempts: 0,
    maxAttempts: 5,
    createdAt: Date.now(),
  });

  console.log('💾 Поставщик сохранен локально:', id);
  return id;
}

// Сохранение сотрудника локально
export async function saveEmployeeLocally(employee: any): Promise<string> {
  const db = await initLocalDB();
  const id = employee.id || `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.put('employees', {
    id,
    data: employee,
    syncStatus: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  await db.add('sync_queue', {
    id: Date.now(),
    type: 'employee',
    itemId: id,
    action: 'create',
    data: employee,
    attempts: 0,
    maxAttempts: 5,
    createdAt: Date.now(),
  });

  console.log('💾 Сотрудник сохранен локально:', id);
  return id;
}

// Сохранение лога локально
export async function saveLogLocally(message: string, userId?: string, userName?: string): Promise<void> {
  const db = await initLocalDB();
  
  const logId = await db.add('logs', {
    id: Date.now(),
    message,
    userId,
    userName,
    syncStatus: 'pending',
    createdAt: Date.now(),
  });

  await db.add('sync_queue', {
    id: Date.now(),
    type: 'log',
    itemId: logId.toString(),
    action: 'create',
    data: { message, userId, userName },
    attempts: 0,
    maxAttempts: 5,
    createdAt: Date.now(),
  });

  console.log('💾 Лог сохранен локально');
}

// Сохранение изображения товара локально
export async function saveProductImageLocally(barcode: string, productName: string, imageData: string): Promise<string> {
  const db = await initLocalDB();
  const id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.put('product_images', {
    id,
    barcode,
    productName,
    imageData,
    syncStatus: 'pending',
    createdAt: Date.now(),
  });

  await db.add('sync_queue', {
    id: Date.now(),
    type: 'image',
    itemId: id,
    action: 'create',
    data: { barcode, productName, imageData },
    attempts: 0,
    maxAttempts: 5,
    createdAt: Date.now(),
  });

  console.log('💾 Изображение сохранено локально:', id);
  return id;
}

// Получение всех несинхронизированных элементов
export async function getPendingSyncItems(): Promise<{
  products: any[];
  suppliers: any[];
  employees: any[];
  logs: any[];
  images: any[];
}> {
  const db = await initLocalDB();
  
  const [products, suppliers, employees, logs, images] = await Promise.all([
    db.getAllFromIndex('products', 'by-sync-status', 'pending'),
    db.getAllFromIndex('suppliers', 'by-sync-status', 'pending'),
    db.getAllFromIndex('employees', 'by-sync-status', 'pending'),
    db.getAllFromIndex('logs', 'by-sync-status', 'pending'),
    db.getAllFromIndex('product_images', 'by-sync-status', 'pending'),
  ]);

  return { products, suppliers, employees, logs, images };
}

// Получение статистики синхронизации
export async function getSyncStats(): Promise<{
  pending: number;
  synced: number;
  errors: number;
  lastSync?: number;
}> {
  const db = await initLocalDB();
  const queue = await db.getAll('sync_queue');
  
  const pending = queue.filter(item => item.attempts < item.maxAttempts).length;
  const errors = queue.filter(item => item.attempts >= item.maxAttempts).length;
  
  const lastSync = localStorage.getItem('last-sync-time');
  
  return {
    pending,
    synced: 0, // Будет обновляться после синхронизации
    errors,
    lastSync: lastSync ? parseInt(lastSync) : undefined,
  };
}

// Очистка успешно синхронизированных элементов старше 7 дней
export async function cleanupSyncedItems(): Promise<void> {
  const db = await initLocalDB();
  const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  const stores = ['products', 'suppliers', 'employees', 'logs', 'product_images'] as const;
  
  for (const storeName of stores) {
    const items = await db.getAllFromIndex(storeName, 'by-sync-status', 'synced');
    for (const item of items) {
      if (item.createdAt < weekAgo) {
        await db.delete(storeName, item.id);
      }
    }
  }
  
  console.log('🧹 Очистка старых синхронизированных данных завершена');
}

// Получение всех локальных данных для отображения
export async function getAllLocalData(): Promise<{
  products: any[];
  suppliers: any[];
  employees: any[];
}> {
  const db = await initLocalDB();
  
  const [products, suppliers, employees] = await Promise.all([
    db.getAll('products'),
    db.getAll('suppliers'),
    db.getAll('employees'),
  ]);

  return {
    products: products.map(p => p.data),
    suppliers: suppliers.map(s => s.data),
    employees: employees.map(e => e.data),
  };
}
