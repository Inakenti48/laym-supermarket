// MySQL → PostgreSQL Migration
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import * as mysql from "./mysqlDatabase";

interface MigrationProgress {
  table: string;
  total: number;
  migrated: number;
  errors: number;
}

type ProgressCallback = (progress: MigrationProgress) => void;

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
  
  toast.info("Начинаем миграцию MySQL → PostgreSQL...");

  // Migrate suppliers first (products may reference them)
  toast.info("Мигрируем поставщиков...");
  const suppliersResult = await migrateSuppliersToPostgres((p) => onProgress?.('suppliers', p));

  // Migrate products
  toast.info("Мигрируем товары...");
  const productsResult = await migrateProductsToPostgres((p) => onProgress?.('products', p));

  // Migrate pending products
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
