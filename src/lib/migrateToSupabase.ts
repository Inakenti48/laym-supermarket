import { supabase } from '@/integrations/supabase/client';
import { getStoredProducts, getCancellationRequests, getSuppliers } from './storage';
import type { StoredProduct, CancellationRequest, Supplier } from './storage';

export interface MigrationResult {
  success: boolean;
  productsCount: number;
  suppliersCount: number;
  errors: string[];
}

/**
 * Мигрирует все данные из localStorage в Supabase
 * Не удаляет данные из localStorage для безопасности
 */
export const migrateToSupabase = async (userId: string): Promise<MigrationResult> => {
  const errors: string[] = [];
  let productsCount = 0;
  let suppliersCount = 0;

  try {
    // 1. Мигрируем продукты
    const products = await getStoredProducts();
    console.log(`Начинаем миграцию ${products.length} товаров...`);

    for (const product of products) {
      try {
        const { error } = await supabase.from('products').insert({
          barcode: product.barcode,
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
          price_history: product.priceHistory.map(h => ({
            date: h.date,
            purchase_price: h.purchasePrice,
            retail_price: h.retailPrice,
            changed_by: h.changedBy
          })),
          created_by: userId,
          supplier: null // Пока не мигрируем связь с поставщиком
        });

        if (error) {
          // Если товар уже существует, пропускаем
          if (error.code === '23505') {
            console.log(`Товар ${product.barcode} уже существует, пропускаем`);
          } else {
            errors.push(`Ошибка добавления товара ${product.name}: ${error.message}`);
          }
        } else {
          productsCount++;
        }
      } catch (err) {
        errors.push(`Ошибка обработки товара ${product.name}: ${err}`);
      }
    }

    // 2. Мигрируем поставщиков
    const suppliers = getSuppliers();
    console.log(`Начинаем миграцию ${suppliers.length} поставщиков...`);

    for (const supplier of suppliers) {
      try {
        const { error } = await supabase.from('suppliers').insert({
          name: supplier.name,
          phone: supplier.phone,
          address: supplier.notes, // notes -> address
          debt: supplier.totalDebt,
          payment_history: supplier.paymentHistory.map(h => ({
            date: h.date,
            amount: h.amount,
            payment_type: h.paymentType,
            product_name: h.productName,
            product_quantity: h.productQuantity,
            product_price: h.productPrice,
            changed_by: h.changedBy
          })),
          created_by: userId
        });

        if (error) {
          errors.push(`Ошибка добавления поставщика ${supplier.name}: ${error.message}`);
        } else {
          suppliersCount++;
        }
      } catch (err) {
        errors.push(`Ошибка обработки поставщика ${supplier.name}: ${err}`);
      }
    }

    // 3. Мигрируем запросы на отмену
    const cancellations = getCancellationRequests();
    console.log(`Начинаем миграцию ${cancellations.length} запросов на отмену...`);

    for (const cancellation of cancellations) {
      try {
        // Находим пользователя по имени кассира
        const { data: profile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('full_name', cancellation.cashier)
          .single();

        const requestedBy = profile?.user_id || userId;

        for (const item of cancellation.items) {
          const { error } = await supabase.from('cancellation_requests').insert({
            barcode: item.barcode,
            product_name: item.name,
            quantity: item.quantity,
            reason: `Миграция из localStorage (кассир: ${cancellation.cashier})`,
            status: cancellation.status,
            requested_by: requestedBy
          });

          if (error && error.code !== '23505') {
            errors.push(`Ошибка добавления запроса на отмену для ${item.name}: ${error.message}`);
          }
        }
      } catch (err) {
        errors.push(`Ошибка обработки запроса на отмену: ${err}`);
      }
    }

    console.log('Миграция завершена!');
    console.log(`Перенесено товаров: ${productsCount}`);
    console.log(`Перенесено поставщиков: ${suppliersCount}`);
    if (errors.length > 0) {
      console.log(`Ошибок: ${errors.length}`);
      errors.forEach(err => console.error(err));
    }

    return {
      success: errors.length === 0 || (productsCount > 0 && suppliersCount >= 0),
      productsCount,
      suppliersCount,
      errors
    };
  } catch (err) {
    console.error('Критическая ошибка миграции:', err);
    return {
      success: false,
      productsCount,
      suppliersCount,
      errors: [...errors, `Критическая ошибка: ${err}`]
    };
  }
};

/**
 * Проверяет, нужна ли миграция (есть ли данные в localStorage)
 */
export const needsMigration = async (): Promise<boolean> => {
  const products = await getStoredProducts();
  return products.length > 0;
};

/**
 * Экспортирует данные из localStorage в JSON файл перед миграцией
 */
export const exportLocalStorageData = async (): Promise<void> => {
  const allData = {
    products: await getStoredProducts(),
    cancellations: getCancellationRequests(),
    suppliers: getSuppliers(),
    exportDate: new Date().toISOString(),
    version: '1.0',
    note: 'Резервная копия перед миграцией в Supabase'
  };

  const jsonString = JSON.stringify(allData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup_before_migration_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};