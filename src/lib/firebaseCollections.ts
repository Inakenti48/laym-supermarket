// Firebase коллекции для замены Supabase таблиц
import { firebaseDb } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  addDoc
} from 'firebase/firestore';

// ============ DEVICES ============
export interface Device {
  id: string;
  user_id: string;
  user_name: string;
  device_name: string;
  can_save_single: boolean;
  can_save_queue: boolean;
  last_active: string;
  created_at: string;
}

export const getDevices = async (): Promise<Device[]> => {
  try {
    const snapshot = await getDocs(collection(firebaseDb, 'devices'));
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device));
  } catch (err) {
    console.warn('⚠️ Ошибка загрузки устройств:', err);
    return [];
  }
};

export const saveDevice = async (device: Omit<Device, 'id' | 'created_at'>): Promise<string> => {
  try {
    const q = query(collection(firebaseDb, 'devices'), where('user_id', '==', device.user_id));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await updateDoc(docRef, {
        ...device,
        last_active: new Date().toISOString()
      });
      return snapshot.docs[0].id;
    }
    
    const docRef = await addDoc(collection(firebaseDb, 'devices'), {
      ...device,
      created_at: new Date().toISOString(),
      last_active: new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    console.error('❌ Ошибка сохранения устройства:', err);
    throw err;
  }
};

export const subscribeToDevices = (callback: (devices: Device[]) => void): (() => void) => {
  return onSnapshot(
    query(collection(firebaseDb, 'devices'), orderBy('last_active', 'desc')),
    (snapshot) => {
      const devices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Device));
      callback(devices);
    },
    (error) => console.warn('⚠️ Ошибка подписки на устройства:', error)
  );
};

// ============ SYSTEM_LOGS ============
export interface SystemLog {
  id: string;
  action: string;
  user_id?: string;
  user_name?: string;
  details?: string;
  created_at: string;
}

export const addSystemLog = async (log: Omit<SystemLog, 'id' | 'created_at'>): Promise<void> => {
  try {
    await addDoc(collection(firebaseDb, 'system_logs'), {
      ...log,
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.warn('⚠️ Ошибка добавления лога:', err);
  }
};

export const getSystemLogs = async (limitCount: number = 100): Promise<SystemLog[]> => {
  try {
    const q = query(
      collection(firebaseDb, 'system_logs'),
      orderBy('created_at', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemLog));
  } catch (err) {
    console.warn('⚠️ Ошибка загрузки логов:', err);
    return [];
  }
};

// ============ PRODUCT QUEUE (vremenno_product_foto) ============
export interface QueueProduct {
  id: string;
  barcode: string;
  product_name: string;
  category?: string;
  front_photo?: string;
  barcode_photo?: string;
  image_url?: string;
  quantity: number;
  created_by?: string;
  created_at: string;
  status: 'pending' | 'processed';
}

export const getQueueProducts = async (): Promise<QueueProduct[]> => {
  try {
    const q = query(
      collection(firebaseDb, 'product_queue'),
      where('status', '==', 'pending'),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QueueProduct));
  } catch (err) {
    console.warn('⚠️ Ошибка загрузки очереди:', err);
    return [];
  }
};

export const addToQueue = async (item: Omit<QueueProduct, 'id' | 'created_at' | 'status'>): Promise<string> => {
  try {
    // Проверяем существование
    const q = query(
      collection(firebaseDb, 'product_queue'),
      where('barcode', '==', item.barcode),
      where('status', '==', 'pending')
    );
    const existing = await getDocs(q);
    
    if (!existing.empty) {
      console.log('⚠️ Товар уже в очереди');
      return existing.docs[0].id;
    }
    
    const docRef = await addDoc(collection(firebaseDb, 'product_queue'), {
      ...item,
      status: 'pending',
      created_at: new Date().toISOString()
    });
    console.log('📋 Добавлено в очередь Firebase:', docRef.id);
    return docRef.id;
  } catch (err) {
    console.error('❌ Ошибка добавления в очередь:', err);
    throw err;
  }
};

export const updateQueueItem = async (id: string, updates: Partial<QueueProduct>): Promise<void> => {
  try {
    await updateDoc(doc(firebaseDb, 'product_queue', id), updates);
  } catch (err) {
    console.error('❌ Ошибка обновления очереди:', err);
    throw err;
  }
};

export const deleteQueueItem = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(firebaseDb, 'product_queue', id));
    console.log('🗑️ Удалено из очереди:', id);
  } catch (err) {
    console.error('❌ Ошибка удаления из очереди:', err);
    throw err;
  }
};

export const subscribeToQueue = (callback: (items: QueueProduct[]) => void): (() => void) => {
  return onSnapshot(
    query(
      collection(firebaseDb, 'product_queue'),
      where('status', '==', 'pending'),
      orderBy('created_at', 'desc')
    ),
    (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as QueueProduct));
      callback(items);
    },
    (error) => console.warn('⚠️ Ошибка подписки на очередь:', error)
  );
};

export const getQueueCount = async (): Promise<number> => {
  try {
    const q = query(
      collection(firebaseDb, 'product_queue'),
      where('status', '==', 'pending')
    );
    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch {
    return 0;
  }
};

// ============ CANCELLATION REQUESTS ============
export interface CancellationRequest {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  cashier: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export const getCancellationRequests = async (): Promise<CancellationRequest[]> => {
  try {
    const q = query(
      collection(firebaseDb, 'cancellation_requests'),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CancellationRequest));
  } catch (err) {
    console.warn('⚠️ Ошибка загрузки заявок на отмену:', err);
    return [];
  }
};

export const createCancellationRequest = async (
  items: CancellationRequest['items'],
  cashier: string
): Promise<string> => {
  try {
    const docRef = await addDoc(collection(firebaseDb, 'cancellation_requests'), {
      items,
      cashier,
      status: 'pending',
      created_at: new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    console.error('❌ Ошибка создания заявки:', err);
    throw err;
  }
};

export const updateCancellationRequest = async (id: string, status: 'approved' | 'rejected'): Promise<void> => {
  try {
    await updateDoc(doc(firebaseDb, 'cancellation_requests', id), { status });
  } catch (err) {
    console.error('❌ Ошибка обновления заявки:', err);
    throw err;
  }
};

export const subscribeToCancellations = (callback: (requests: CancellationRequest[]) => void): (() => void) => {
  return onSnapshot(
    query(collection(firebaseDb, 'cancellation_requests'), orderBy('created_at', 'desc')),
    (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CancellationRequest));
      callback(requests);
    },
    (error) => console.warn('⚠️ Ошибка подписки на заявки:', error)
  );
};

// ============ SALES ============
export interface Sale {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  total: number;
  payment_method: string;
  cashier: string;
  created_at: string;
}

export const addSale = async (sale: Omit<Sale, 'id' | 'created_at'>): Promise<string> => {
  try {
    const docRef = await addDoc(collection(firebaseDb, 'sales'), {
      ...sale,
      created_at: new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    console.error('❌ Ошибка сохранения продажи:', err);
    throw err;
  }
};

export const getSales = async (limitCount: number = 100): Promise<Sale[]> => {
  try {
    const q = query(
      collection(firebaseDb, 'sales'),
      orderBy('created_at', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
  } catch (err) {
    console.warn('⚠️ Ошибка загрузки продаж:', err);
    return [];
  }
};

// ============ SUPPLIERS ============
export interface Supplier {
  id: string;
  name: string;
  phone: string;
  notes: string;
  totalDebt: number;
  paymentHistory: Array<{
    date: string;
    amount: number;
    paymentType: 'debt' | 'full' | 'partial';
    productName: string;
    productQuantity: number;
    productPrice: number;
    changedBy: string;
  }>;
  created_at: string;
  updated_at: string;
  // Aliases for compatibility with suppliersDb
  createdAt?: string;
  lastUpdated?: string;
}

export const getSuppliers = async (): Promise<Supplier[]> => {
  try {
    const q = query(
      collection(firebaseDb, 'suppliers'),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
  } catch (err) {
    console.warn('⚠️ Ошибка загрузки поставщиков:', err);
    return [];
  }
};

export const saveSupplier = async (supplier: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'paymentHistory'>): Promise<Supplier> => {
  try {
    const now = new Date().toISOString();
    const docRef = await addDoc(collection(firebaseDb, 'suppliers'), {
      ...supplier,
      paymentHistory: [],
      created_at: now,
      updated_at: now
    });
    return {
      id: docRef.id,
      ...supplier,
      paymentHistory: [],
      created_at: now,
      updated_at: now
    };
  } catch (err) {
    console.error('❌ Ошибка сохранения поставщика:', err);
    throw err;
  }
};

export const updateSupplier = async (id: string, updates: Partial<Supplier>): Promise<void> => {
  try {
    await updateDoc(doc(firebaseDb, 'suppliers', id), {
      ...updates,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Ошибка обновления поставщика:', err);
    throw err;
  }
};

export const deleteSupplier = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(firebaseDb, 'suppliers', id));
  } catch (err) {
    console.error('❌ Ошибка удаления поставщика:', err);
    throw err;
  }
};

export const subscribeToSuppliers = (callback: (suppliers: Supplier[]) => void): (() => void) => {
  return onSnapshot(
    query(collection(firebaseDb, 'suppliers'), orderBy('created_at', 'desc')),
    (snapshot) => {
      const suppliers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
      callback(suppliers);
    },
    (error) => console.warn('⚠️ Ошибка подписки на поставщиков:', error)
  );
};

// ============ PRODUCT RETURNS ============
export interface ProductReturn {
  id: string;
  barcode: string;
  product_name: string;
  quantity: number;
  reason: string;
  returned_by: string;
  created_at: string;
}

export const getProductReturns = async (): Promise<ProductReturn[]> => {
  try {
    const q = query(
      collection(firebaseDb, 'product_returns'),
      orderBy('created_at', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductReturn));
  } catch (err) {
    console.warn('⚠️ Ошибка загрузки возвратов:', err);
    return [];
  }
};

export const addProductReturn = async (ret: Omit<ProductReturn, 'id' | 'created_at'>): Promise<string> => {
  try {
    const docRef = await addDoc(collection(firebaseDb, 'product_returns'), {
      ...ret,
      created_at: new Date().toISOString()
    });
    return docRef.id;
  } catch (err) {
    console.error('❌ Ошибка добавления возврата:', err);
    throw err;
  }
};

// ============ PRODUCT IMAGES (локальное хранение base64) ============
export interface ProductImage {
  id: string;
  barcode: string;
  product_name: string;
  image_url: string;
  created_at: string;
}

export const saveProductImageFirebase = async (
  barcode: string,
  productName: string,
  imageBase64: string
): Promise<boolean> => {
  try {
    // Проверяем существование
    const q = query(
      collection(firebaseDb, 'product_images'),
      where('barcode', '==', barcode)
    );
    const existing = await getDocs(q);
    
    if (!existing.empty) {
      await updateDoc(existing.docs[0].ref, {
        image_url: imageBase64,
        updated_at: new Date().toISOString()
      });
    } else {
      await addDoc(collection(firebaseDb, 'product_images'), {
        barcode,
        product_name: productName,
        image_url: imageBase64,
        created_at: new Date().toISOString()
      });
    }
    console.log('✅ Фото сохранено в Firebase');
    return true;
  } catch (err) {
    console.error('❌ Ошибка сохранения фото:', err);
    return false;
  }
};

export const getProductImage = async (barcode: string): Promise<string | null> => {
  try {
    const q = query(
      collection(firebaseDb, 'product_images'),
      where('barcode', '==', barcode)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data().image_url;
    }
    return null;
  } catch {
    return null;
  }
};
