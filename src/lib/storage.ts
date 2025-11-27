import { supabase } from '@/integrations/supabase/client';
import { retryOperation } from './retryUtils';
import {
  getAllFirebaseProducts,
  findFirebaseProductByBarcode,
  saveFirebaseProduct,
  updateFirebaseProductQuantity,
  removeFirebaseExpiredProduct,
  getFirebaseExpiringProducts
} from './firebaseProducts';

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

// Сохранение фото товара в ImageKit и базу product_images
export const saveProductImage = async (
  barcode: string, 
  productName: string, 
  imageBase64: string,
  userId?: string
): Promise<boolean> => {
  return await retryOperation(
    async () => {
      // Загружаем в ImageKit через edge function
      const { data: uploadResult, error: uploadError } = await supabase.functions.invoke(
        'upload-to-imagekit',
        {
          body: {
            base64Image: imageBase64,
            fileName: `${barcode || 'no-barcode'}-${Date.now()}.jpg`,
            folder: '/products'
          }
        }
      );

      if (uploadError || !uploadResult?.success) {
        console.error('ImageKit upload error:', uploadError || uploadResult?.error);
        throw new Error(uploadError?.message || uploadResult?.error || 'Failed to upload to ImageKit');
      }

      const imageUrl = uploadResult.url;
      const fileId = uploadResult.fileId;

      // Проверяем, есть ли уже запись для этого товара
      const { data: existing } = await supabase
        .from('product_images')
        .select('id')
        .eq('barcode', barcode)
        .eq('product_name', productName)
        .maybeSingle();

      if (existing) {
        // Обновляем существующую запись
        const updateData: any = {
          image_url: imageUrl,
          storage_path: fileId,
          updated_at: new Date().toISOString()
        };

        const { error: updateError } = await supabase
          .from('product_images')
          .update(updateData)
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        // Создаем новую запись
        const insertData: any = {
          barcode,
          product_name: productName,
          image_url: imageUrl,
          storage_path: fileId
        };
        
        if (userId) {
          insertData.created_by = userId;
        }

        const { error: dbError } = await supabase
          .from('product_images')
          .insert(insertData);

        if (dbError) throw dbError;
      }

      console.log('✅ Фото сохранено в ImageKit:', imageUrl);
      return true;
    },
    {
      maxAttempts: 5,
      initialDelay: 1000,
      onRetry: (attempt) => {
        console.log(`🔄 Повторная попытка сохранения фото (попытка ${attempt})...`);
      }
    }
  ).catch((err) => {
    console.error('Failed to save product image:', err);
    return false;
  });
};

// === FIREBASE ФУНКЦИИ ДЛЯ ТОВАРОВ ===

export const getStoredProducts = async (): Promise<StoredProduct[]> => {
  console.log('📦 Загрузка товаров из Firebase...');
  return getAllFirebaseProducts();
};

export const findProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  if (!barcode) return null;
  return findFirebaseProductByBarcode(barcode);
};

export const saveProduct = async (
  product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>, 
  userId: string
): Promise<StoredProduct> => {
  return await retryOperation(
    async () => {
      console.log('💾 Сохранение товара в Firebase...');
      return saveFirebaseProduct(product, userId);
    },
    {
      maxAttempts: 5,
      initialDelay: 1000,
      onRetry: (attempt, error) => {
        console.log(`🔄 Повторная попытка сохранения товара "${product.name}" (попытка ${attempt})...`, error);
      }
    }
  );
};

export const getAllProducts = async (): Promise<StoredProduct[]> => {
  return getStoredProducts();
};

export const getExpiringProducts = async (daysBeforeExpiry: number = 3): Promise<StoredProduct[]> => {
  return getFirebaseExpiringProducts(daysBeforeExpiry);
};

export const isProductExpired = (product: StoredProduct): boolean => {
  if (!product.expiryDate) return false;
  const now = new Date();
  const expiryDate = new Date(product.expiryDate);
  return expiryDate < now;
};

export const updateProductQuantity = async (barcode: string, quantityChange: number): Promise<void> => {
  return updateFirebaseProductQuantity(barcode, quantityChange);
};

export const removeExpiredProduct = async (barcode: string): Promise<StoredProduct | null> => {
  return removeFirebaseExpiredProduct(barcode);
};

// === СИСТЕМА ОТМЕНЫ ТОВАРОВ (остаётся в Supabase) ===

export interface CancellationRequest {
  id: string;
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>;
  cashier: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const getCancellationRequests = async (): Promise<CancellationRequest[]> => {
  const { data, error } = await supabase
    .from('cancellation_requests')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching cancellation requests:', error);
    return [];
  }
  
  return (data || []).map(r => ({
    id: r.id,
    items: [{ barcode: r.barcode, name: r.product_name, quantity: r.quantity, price: 0 }],
    cashier: r.requested_by || '',
    requestedAt: r.created_at,
    status: r.status as 'pending' | 'approved' | 'rejected'
  }));
};

export const createCancellationRequest = async (
  items: Array<{ barcode: string; name: string; quantity: number; price: number }>, 
  cashier: string
): Promise<CancellationRequest> => {
  const now = new Date().toISOString();
  const newRequest: CancellationRequest = {
    id: '',
    items,
    cashier,
    requestedAt: now,
    status: 'pending'
  };
  
  const { data: userData } = await supabase.auth.getUser();
  
  for (const item of items) {
    await supabase.from('cancellation_requests').insert({
      barcode: item.barcode,
      product_name: item.name,
      quantity: item.quantity,
      reason: 'Отмена продажи',
      status: 'pending',
      requested_by: userData?.user?.id || null
    });
  }
  
  return newRequest;
};

export const updateCancellationRequest = async (id: string, status: 'approved' | 'rejected'): Promise<void> => {
  const { data, error } = await supabase
    .from('cancellation_requests')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  
  if (status === 'approved' && data) {
    await updateProductQuantity(data.barcode, data.quantity);
  }
};

export const cleanupOldCancellations = async (): Promise<void> => {
  const dayAgo = new Date();
  dayAgo.setDate(dayAgo.getDate() - 1);
  
  await supabase
    .from('cancellation_requests')
    .delete()
    .lt('created_at', dayAgo.toISOString());
};

export const exportAllData = async () => {
  const { getSuppliers } = await import('./suppliersDb');
  
  const allData = {
    products: await getStoredProducts(),
    cancellations: await getCancellationRequests(),
    suppliers: await getSuppliers(),
    exportDate: new Date().toISOString(),
    version: '3.0-firebase'
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

export const importAllData = async (jsonData: string) => {
  try {
    const data = JSON.parse(jsonData);
    console.log('Import from backup not implemented for Firebase');
    return false;
  } catch (error) {
    console.error('Ошибка импорта данных:', error);
    return false;
  }
};
