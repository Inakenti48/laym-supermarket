import { supabase } from '@/integrations/supabase/client';

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

// Сохранение фото товара в постоянную базу product_images
export const saveProductImage = async (
  barcode: string, 
  productName: string, 
  imageBase64: string
): Promise<boolean> => {
  try {
    // Получаем текущего пользователя (если есть)
    const { data: { user } } = await supabase.auth.getUser();

    // Конвертируем base64 в blob
    const base64Data = imageBase64.split(',')[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    // Генерируем имя файла
    const timestamp = Date.now();
    const fileName = `${barcode || 'no-barcode'}-${timestamp}.jpg`;
    const filePath = `products/${fileName}`;

    // Загружаем в storage
    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return false;
    }

    // Получаем публичный URL
    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    // Проверяем, есть ли уже запись для этого товара
    const { data: existing } = await supabase
      .from('product_images')
      .select('id')
      .eq('barcode', barcode)
      .eq('product_name', productName)
      .maybeSingle();

    if (existing) {
      // Обновляем существующую запись
      const { error: updateError } = await supabase
        .from('product_images')
        .update({
          image_url: urlData.publicUrl,
          storage_path: filePath,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Database update error:', updateError);
        return false;
      }
    } else {
      // Создаем новую запись
      const { error: dbError } = await supabase
        .from('product_images')
        .insert({
          barcode,
          product_name: productName,
          image_url: urlData.publicUrl,
          storage_path: filePath,
          created_by: user?.id
        });

      if (dbError) {
        console.error('Database insert error:', dbError);
        return false;
      }
    }

    console.log('✅ Product image saved to database');
    return true;
  } catch (err) {
    console.error('Error saving product image:', err);
    return false;
  }
};

export const getStoredProducts = async (): Promise<StoredProduct[]> => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching products:', error);
    return [];
  }
  
  return (data || []).map(p => ({
    id: p.id,
    barcode: p.barcode,
    name: p.name,
    category: p.category,
    purchasePrice: Number(p.purchase_price),
    retailPrice: Number(p.sale_price),
    quantity: p.quantity,
    unit: p.unit as 'шт' | 'кг',
    expiryDate: p.expiry_date || undefined,
    photos: [],
    paymentType: p.payment_type as 'full' | 'partial' | 'debt',
    paidAmount: Number(p.paid_amount),
    debtAmount: Number(p.debt_amount),
    addedBy: p.created_by || '',
    supplier: p.supplier || undefined,
    lastUpdated: p.updated_at,
    priceHistory: (p.price_history as any) || []
  }));
};

export const findProductByBarcode = async (barcode: string): Promise<StoredProduct | null> => {
  if (!barcode) return null;
  
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
    purchasePrice: Number(data.purchase_price),
    retailPrice: Number(data.sale_price),
    quantity: data.quantity,
    unit: data.unit as 'шт' | 'кг',
    expiryDate: data.expiry_date || undefined,
    photos: [],
    paymentType: data.payment_type as 'full' | 'partial' | 'debt',
    paidAmount: Number(data.paid_amount),
    debtAmount: Number(data.debt_amount),
    addedBy: data.created_by || '',
    supplier: data.supplier || undefined,
    lastUpdated: data.updated_at,
    priceHistory: (data.price_history as any) || []
  };
};

export const saveProduct = async (product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>, userId: string): Promise<StoredProduct> => {
  const now = new Date().toISOString();
  const existing = product.barcode ? await findProductByBarcode(product.barcode) : null;
  
  if (existing) {
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
    
    const { data, error } = await supabase
      .from('products')
      .update({
        name: product.name,
        category: product.category,
        purchase_price: product.purchasePrice,
        sale_price: product.retailPrice,
        quantity: existing.quantity + product.quantity,
        unit: product.unit,
        expiry_date: product.expiryDate || null,
        payment_type: product.paymentType,
        paid_amount: product.paidAmount,
        debt_amount: product.debtAmount,
        supplier: product.supplier || null,
        price_history: newPriceHistory as any,
        updated_at: now
      })
      .eq('barcode', product.barcode)
      .select()
      .single();
    
    if (error) throw error;
    
    return {
      id: data.id,
      barcode: data.barcode,
      name: data.name,
      category: data.category,
      purchasePrice: Number(data.purchase_price),
      retailPrice: Number(data.sale_price),
      quantity: data.quantity,
      unit: data.unit as 'шт' | 'кг',
      expiryDate: data.expiry_date || undefined,
      photos: [],
      paymentType: data.payment_type as 'full' | 'partial' | 'debt',
      paidAmount: Number(data.paid_amount),
      debtAmount: Number(data.debt_amount),
      addedBy: data.created_by || '',
      supplier: data.supplier || undefined,
      lastUpdated: data.updated_at,
      priceHistory: (data.price_history as any) || []
    };
  } else {
    console.log('💾 Создание нового товара - сохранение в Supabase...');
    
    // Проверяем авторизацию
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Пользователь не авторизован');
    }
    
    const newPriceHistory = [
      {
        date: now,
        purchasePrice: product.purchasePrice,
        retailPrice: product.retailPrice,
        changedBy: userId,
      },
    ];
    
    const productToInsert = {
      barcode: product.barcode || `NO-BARCODE-${Date.now()}`,
      name: product.name,
      category: product.category,
      purchase_price: product.purchasePrice,
      sale_price: product.retailPrice,
      quantity: product.quantity,
      unit: product.unit,
      expiry_date: product.expiryDate || null,
      payment_type: product.paymentType,
      paid_amount: product.paidAmount,
      debt_amount: product.debtAmount,
      supplier: product.supplier || null,
      price_history: newPriceHistory as any,
      created_by: user.id
    };
    
    console.log('☁️ Сохранение товара в Supabase...');
    const { data, error } = await supabase
      .from('products')
      .insert(productToInsert)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Ошибка сохранения товара:', error);
      throw error;
    }
    
    console.log('✅ Товар успешно сохранен:', data.id);
    
    return {
      id: data.id,
      barcode: data.barcode,
      name: data.name,
      category: data.category,
      purchasePrice: Number(data.purchase_price),
      retailPrice: Number(data.sale_price),
      quantity: data.quantity,
      unit: data.unit as 'шт' | 'кг',
      expiryDate: data.expiry_date || undefined,
      photos: product.photos || [],
      paymentType: data.payment_type as 'full' | 'partial' | 'debt',
      paidAmount: Number(data.paid_amount),
      debtAmount: Number(data.debt_amount),
      addedBy: user.id,
      supplier: data.supplier || undefined,
      lastUpdated: data.updated_at,
      priceHistory: newPriceHistory
    };
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
  const product = await findProductByBarcode(barcode);
  
  if (!product) {
    throw new Error(`Товар с штрихкодом ${barcode} не найден`);
  }
  
  const { error } = await supabase
    .from('products')
    .update({ 
      quantity: product.quantity + quantityChange,
      updated_at: new Date().toISOString()
    })
    .eq('barcode', barcode);
  
  if (error) throw error;
};

export const removeExpiredProduct = async (barcode: string): Promise<StoredProduct | null> => {
  const product = await findProductByBarcode(barcode);
  
  if (!product) {
    return null;
  }
  
  const { error } = await supabase
    .from('products')
    .update({ 
      quantity: 0,
      updated_at: new Date().toISOString()
    })
    .eq('barcode', barcode);
  
  if (error) {
    console.error('Error removing expired product:', error);
    return null;
  }
  
  return product;
};

// Система отмены товаров
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

export const createCancellationRequest = async (items: Array<{ barcode: string; name: string; quantity: number; price: number }>, cashier: string): Promise<CancellationRequest> => {
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
  // Note: getSuppliers moved to suppliersDb.ts
  const { getSuppliers } = await import('./suppliersDb');
  
  const allData = {
    products: await getStoredProducts(),
    cancellations: await getCancellationRequests(),
    suppliers: await getSuppliers(),
    exportDate: new Date().toISOString(),
    version: '2.0'
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
    console.log('Import from backup not implemented for Supabase');
    return false;
  } catch (error) {
    console.error('Ошибка импорта данных:', error);
    return false;
  }
};
