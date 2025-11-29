// Импорт CSV без Supabase - через MySQL edge function
import { bulkInsertProducts } from './mysqlDatabase';

export const bulkImportFromCSV = async (csvFiles: string[]) => {
  try {
    const allProducts: any[] = [];

    // Читаем все CSV файлы
    for (const filePath of csvFiles) {
      const response = await fetch(filePath);
      const text = await response.text();
      const lines = text.split('\n');
      
      // Пропускаем заголовок (первая строка)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',');
        if (parts.length < 10) continue;

        const barcode = parts[3]?.trim();
        const category = parts[4]?.trim();
        const name = parts[5]?.trim();
        const unit = parts[6]?.trim();
        const quantity = parseFloat(parts[7]?.trim() || '0');
        const purchasePrice = parseFloat(parts[8]?.trim() || '0');
        const salePrice = parseFloat(parts[9]?.trim() || '0');

        if (barcode && name) {
          allProducts.push({
            barcode,
            name,
            category,
            unit,
            quantity,
            purchase_price: purchasePrice,
            sale_price: salePrice
          });
        }
      }
    }

    console.log(`📦 Parsed ${allProducts.length} products from CSV files`);

    // Отправляем на MySQL партиями по 100
    const batchSize = 100;
    let totalInserted = 0;
    let totalErrors = 0;

    for (let i = 0; i < allProducts.length; i += batchSize) {
      const batch = allProducts.slice(i, i + batchSize);
      
      console.log(`📤 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allProducts.length / batchSize)}`);
      
      const result = await bulkInsertProducts(batch);

      if (result.success) {
        totalInserted += result.count || 0;
      } else {
        totalErrors += batch.length;
      }
      
      // Задержка между партиями
      if (i + batchSize < allProducts.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return {
      success: true,
      inserted: totalInserted,
      errors: totalErrors,
      total: allProducts.length
    };

  } catch (error) {
    console.error('❌ Bulk import error:', error);
    throw error;
  }
};
