import { StoredProduct, getStoredProducts, saveProduct } from './storage';

export interface CSVProduct {
  barcode: string;
  name: string;
  category: string;
  unit: 'шт' | 'кг';
  quantity: number;
  purchasePrice: number;
  retailPrice: number;
}

export const parseCSVLine = (line: string): CSVProduct | null => {
  // Разбираем CSV строку
  const parts = line.split(',');
  
  if (parts.length < 10) return null;
  
  const barcode = parts[3]?.trim();
  const category = parts[4]?.trim();
  const name = parts[5]?.trim();
  const unit = parts[6]?.trim() as 'шт' | 'кг';
  const quantity = parseFloat(parts[7]?.trim() || '0');
  const purchasePrice = parseFloat(parts[8]?.trim() || '0');
  const retailPrice = parseFloat(parts[9]?.trim() || '0');
  
  // Пропускаем заголовок и невалидные строки
  if (!barcode || barcode === 'Код' || !name || !retailPrice) return null;
  
  return {
    barcode,
    name,
    category: category || 'Прочее',
    unit: unit === 'кг' ? 'кг' : 'шт',
    quantity,
    purchasePrice,
    retailPrice
  };
};

export const importCSVProducts = (csvContent: string, userId: string): { imported: number; skipped: number; errors: number } => {
  const lines = csvContent.split('\n');
  const existingProducts = getStoredProducts();
  const existingBarcodes = new Set(existingProducts.map(p => p.barcode));
  
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const line of lines) {
    try {
      const product = parseCSVLine(line);
      
      if (!product) {
        continue; // Пропускаем заголовки и невалидные строки
      }
      
      // Проверяем дубликаты
      if (existingBarcodes.has(product.barcode)) {
        skipped++;
        continue;
      }
      
      // Сохраняем товар
      saveProduct({
        barcode: product.barcode,
        name: product.name,
        category: product.category,
        unit: product.unit,
        quantity: product.quantity,
        purchasePrice: product.purchasePrice,
        retailPrice: product.retailPrice,
        photos: [],
        paymentType: 'full',
        paidAmount: product.purchasePrice * product.quantity,
        debtAmount: 0,
        addedBy: userId
      }, userId);
      
      existingBarcodes.add(product.barcode);
      imported++;
    } catch (error) {
      errors++;
      console.error('Ошибка импорта строки:', line, error);
    }
  }
  
  return { imported, skipped, errors };
};
