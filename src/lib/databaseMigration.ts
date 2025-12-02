// Database Migration Tools
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as mysql from "./mysqlDatabase";
import { externalPgRequest } from "./externalPgDatabase";

interface MigrationProgress {
  table: string;
  total: number;
  migrated: number;
  errors: number;
}

type ProgressCallback = (progress: MigrationProgress) => void;

// =============================================
// MySQL → Cloud PostgreSQL
// =============================================

export async function migrateProductsToPostgres(onProgress?: ProgressCallback): Promise<{ success: boolean; count: number; errors: number }> {
  const products = await mysql.getAllProducts();
  let migrated = 0;
  let errors = 0;

  for (const product of products) {
    try {
      const { error } = await supabase
        .from('products')
        .upsert({
          barcode: product.barcode,
          name: product.name,
          category: product.category || '',
          purchase_price: product.purchase_price || 0,
          sale_price: product.sale_price || 0,
          quantity: product.quantity || 0,
          unit: product.unit || 'шт',
          supplier: product.supplier_id || null,
          expiry_date: product.expiry_date || null,
          created_by: product.created_by || 'migration'
        }, { onConflict: 'barcode' });

      if (error) {
        console.error('Product migration error:', error);
        errors++;
      } else {
        migrated++;
      }
    } catch (e) {
      errors++;
    }

    onProgress?.({ table: 'products', total: products.length, migrated, errors });
  }

  return { success: errors === 0, count: migrated, errors };
}

export async function migrateSuppliersToPostgres(onProgress?: ProgressCallback): Promise<{ success: boolean; count: number; errors: number }> {
  const suppliers = await mysql.getAllSuppliers();
  let migrated = 0;
  let errors = 0;

  for (const supplier of suppliers) {
    try {
      const { error } = await supabase
        .from('suppliers')
        .upsert({
          name: supplier.name,
          phone: supplier.phone || null,
          address: supplier.address || null,
          contact_person: supplier.contact || null
        }, { onConflict: 'name' });

      if (error) {
        console.error('Supplier migration error:', error);
        errors++;
      } else {
        migrated++;
      }
    } catch (e) {
      errors++;
    }

    onProgress?.({ table: 'suppliers', total: suppliers.length, migrated, errors });
  }

  return { success: errors === 0, count: migrated, errors };
}

export async function migratePendingProductsToPostgres(onProgress?: ProgressCallback): Promise<{ success: boolean; count: number; errors: number }> {
  const pending = await mysql.getPendingProducts();
  let migrated = 0;
  let errors = 0;

  for (const item of pending) {
    try {
      const { error } = await supabase
        .from('vremenno_product_foto')
        .upsert({
          barcode: item.barcode,
          product_name: item.name,
          purchase_price: item.purchase_price || 0,
          retail_price: item.sale_price || 0,
          quantity: item.quantity || 1,
          category: item.category || null,
          supplier: item.supplier || null,
          expiry_date: item.expiry_date || null,
          image_url: item.image_url || item.photo_url || '',
          storage_path: '',
          front_photo: item.front_photo || null,
          barcode_photo: item.barcode_photo || null,
          created_by: item.added_by || 'migration'
        }, { onConflict: 'barcode' });

      if (error) {
        console.error('Pending product migration error:', error);
        errors++;
      } else {
        migrated++;
      }
    } catch (e) {
      errors++;
    }

    onProgress?.({ table: 'pending_products', total: pending.length, migrated, errors });
  }

  return { success: errors === 0, count: migrated, errors };
}

export async function migrateAllToPostgres(
  onProgress?: (table: string, progress: MigrationProgress) => void
): Promise<{ products: number; suppliers: number; pending: number; errors: number }> {
  
  toast.info("Начинаем миграцию MySQL → Cloud PostgreSQL...");

  toast.info("Мигрируем поставщиков...");
  const suppliersResult = await migrateSuppliersToPostgres((p) => onProgress?.('suppliers', p));

  toast.info("Мигрируем товары...");
  const productsResult = await migrateProductsToPostgres((p) => onProgress?.('products', p));

  toast.info("Мигрируем очередь товаров...");
  const pendingResult = await migratePendingProductsToPostgres((p) => onProgress?.('pending', p));

  const totalErrors = suppliersResult.errors + productsResult.errors + pendingResult.errors;

  if (totalErrors === 0) {
    toast.success(`Миграция завершена! Товаров: ${productsResult.count}, Поставщиков: ${suppliersResult.count}, В очереди: ${pendingResult.count}`);
  } else {
    toast.warning(`Миграция завершена с ошибками (${totalErrors}). Товаров: ${productsResult.count}, Поставщиков: ${suppliersResult.count}`);
  }

  return {
    products: productsResult.count,
    suppliers: suppliersResult.count,
    pending: pendingResult.count,
    errors: totalErrors
  };
}

// =============================================
// MySQL → External PostgreSQL
// =============================================

export async function migrateToExternalPG(): Promise<{ products: number; suppliers: number; pending: number; errors: number }> {
  toast.info("Начинаем миграцию MySQL → External PostgreSQL...");

  let totalProducts = 0;
  let totalSuppliers = 0;
  let totalPending = 0;
  let totalErrors = 0;

  // Migrate suppliers first
  toast.info("Получаем поставщиков из MySQL...");
  const suppliers = await mysql.getAllSuppliers();
  
  if (suppliers.length > 0) {
    toast.info(`Мигрируем ${suppliers.length} поставщиков...`);
    for (const supplier of suppliers) {
      const result = await externalPgRequest('insert_supplier', { 
        supplier: {
          name: supplier.name,
          phone: supplier.phone || null,
          address: supplier.address || null,
          contact: supplier.contact || null
        }
      });
      if (result.success) {
        totalSuppliers++;
      } else {
        totalErrors++;
      }
    }
  }

  // Migrate products
  toast.info("Получаем товары из MySQL...");
  const products = await mysql.getAllProducts();
  
  if (products.length > 0) {
    toast.info(`Мигрируем ${products.length} товаров (пакетами по 100)...`);
    
    // Batch insert for better performance
    const batchSize = 100;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const result = await externalPgRequest('bulk_insert_products', { 
        products: batch.map(p => ({
          barcode: p.barcode,
          name: p.name,
          category: p.category || '',
          purchase_price: p.purchase_price || 0,
          sale_price: p.sale_price || 0,
          quantity: p.quantity || 0,
          unit: p.unit || 'шт',
          supplier_id: p.supplier_id || null,
          expiry_date: p.expiry_date || null,
          created_by: p.created_by || 'migration'
        }))
      });
      
      if (result.success && result.data) {
        totalProducts += (result.data as any).count || batch.length;
      } else {
        totalErrors += batch.length;
      }
      
      // Progress toast
      if ((i + batchSize) % 500 === 0 || i + batchSize >= products.length) {
        toast.info(`Товары: ${Math.min(i + batchSize, products.length)} / ${products.length}`);
      }
    }
  }

  // Migrate pending products
  toast.info("Получаем очередь товаров из MySQL...");
  const pending = await mysql.getPendingProducts();
  
  if (pending.length > 0) {
    toast.info(`Мигрируем ${pending.length} товаров из очереди...`);
    for (const item of pending) {
      const result = await externalPgRequest('create_pending_product', { 
        product: {
          barcode: item.barcode,
          name: item.name,
          purchase_price: item.purchase_price || 0,
          sale_price: item.sale_price || 0,
          quantity: item.quantity || 1,
          category: item.category || null,
          supplier: item.supplier || null,
          expiry_date: item.expiry_date || null,
          photo_url: item.photo_url || item.image_url || null,
          front_photo: item.front_photo || null,
          barcode_photo: item.barcode_photo || null,
          added_by: item.added_by || 'migration'
        }
      });
      if (result.success) {
        totalPending++;
      } else {
        // May be duplicate - not an error
        console.log('Pending product skip:', item.barcode);
      }
    }
  }

  if (totalErrors === 0) {
    toast.success(`Миграция завершена! Товаров: ${totalProducts}, Поставщиков: ${totalSuppliers}, В очереди: ${totalPending}`);
  } else {
    toast.warning(`Миграция завершена. Товаров: ${totalProducts}, Поставщиков: ${totalSuppliers}, В очереди: ${totalPending}, Ошибок: ${totalErrors}`);
  }

  return {
    products: totalProducts,
    suppliers: totalSuppliers,
    pending: totalPending,
    errors: totalErrors
  };
}

// =============================================
// Cloud PostgreSQL → External PostgreSQL
// =============================================

export async function migrateCloudToExternalPG(): Promise<{ products: number; suppliers: number; pending: number; errors: number }> {
  toast.info("Начинаем миграцию Cloud PG → External PostgreSQL...");

  let totalProducts = 0;
  let totalSuppliers = 0;
  let totalPending = 0;
  let totalErrors = 0;

  // Migrate suppliers
  toast.info("Получаем поставщиков из Cloud PG...");
  const { data: suppliers } = await supabase.from('suppliers').select('*');
  
  if (suppliers && suppliers.length > 0) {
    toast.info(`Мигрируем ${suppliers.length} поставщиков...`);
    for (const supplier of suppliers) {
      const result = await externalPgRequest('insert_supplier', { 
        supplier: {
          name: supplier.name,
          phone: supplier.phone || null,
          address: supplier.address || null,
          contact: supplier.contact_person || null
        }
      });
      if (result.success) {
        totalSuppliers++;
      } else {
        totalErrors++;
      }
    }
  }

  // Migrate products
  toast.info("Получаем товары из Cloud PG...");
  const { data: products } = await supabase.from('products').select('*');
  
  if (products && products.length > 0) {
    toast.info(`Мигрируем ${products.length} товаров...`);
    
    const batchSize = 100;
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      const result = await externalPgRequest('bulk_insert_products', { 
        products: batch.map(p => ({
          barcode: p.barcode,
          name: p.name,
          category: p.category || '',
          purchase_price: p.purchase_price || 0,
          sale_price: p.sale_price || 0,
          quantity: p.quantity || 0,
          unit: p.unit || 'шт',
          supplier_id: p.supplier || null,
          expiry_date: p.expiry_date || null,
          created_by: p.created_by || 'migration'
        }))
      });
      
      if (result.success && result.data) {
        totalProducts += (result.data as any).count || batch.length;
      } else {
        totalErrors += batch.length;
      }
    }
  }

  // Migrate pending products (vremenno_product_foto)
  toast.info("Получаем очередь из Cloud PG...");
  const { data: pending } = await supabase.from('vremenno_product_foto').select('*');
  
  if (pending && pending.length > 0) {
    toast.info(`Мигрируем ${pending.length} товаров из очереди...`);
    for (const item of pending) {
      const result = await externalPgRequest('create_pending_product', { 
        product: {
          barcode: item.barcode,
          name: item.product_name,
          purchase_price: item.purchase_price || 0,
          sale_price: item.retail_price || 0,
          quantity: item.quantity || 1,
          category: item.category || null,
          supplier: item.supplier || null,
          expiry_date: item.expiry_date || null,
          photo_url: item.image_url || null,
          front_photo: item.front_photo || null,
          barcode_photo: item.barcode_photo || null,
          added_by: item.created_by || 'migration'
        }
      });
      if (result.success) {
        totalPending++;
      }
    }
  }

  toast.success(`Миграция завершена! Товаров: ${totalProducts}, Поставщиков: ${totalSuppliers}, В очереди: ${totalPending}`);

  return {
    products: totalProducts,
    suppliers: totalSuppliers,
    pending: totalPending,
    errors: totalErrors
  };
}
