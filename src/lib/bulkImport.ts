import { importCSVProducts } from './csvImport';

const CSV_FILES = [
  '/data/products_part_1.csv',
  '/data/products_part_2.csv',
  '/data/products_part_3.csv',
  '/data/products_part_4.csv',
];

export const bulkImportAllProducts = async (userId: string) => {
  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const file of CSV_FILES) {
    try {
      const response = await fetch(file);
      const text = await response.text();
      const result = importCSVProducts(text, userId);
      
      totalImported += result.imported;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
      
      console.log(`Импортировано из ${file}: ${result.imported} товаров`);
    } catch (error) {
      console.error(`Ошибка импорта ${file}:`, error);
      totalErrors++;
    }
  }

  return {
    imported: totalImported,
    skipped: totalSkipped,
    errors: totalErrors
  };
};
