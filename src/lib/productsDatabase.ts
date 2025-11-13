// Утилита для работы с встроенной базой данных товаров
// Структура данных: [штрихкод, название, закупочная цена, розничная цена]
type ProductData = [string, string, number, number];

let productsCache: ProductData[] | null = null;

/**
 * Загружает базу данных товаров из HTML файла
 */
export async function loadProductsDatabase(): Promise<ProductData[]> {
  if (productsCache) {
    return productsCache;
  }

  try {
    const response = await fetch('/data/products_database.html');
    const html = await response.text();
    
    // Извлекаем массив products из JavaScript кода
    const match = html.match(/const products = (\[[\s\S]*?\]);/);
    if (!match) {
      console.warn('⚠️ Не удалось найти массив products в базе данных');
      return [];
    }

    // Парсим JSON массив
    try {
      productsCache = JSON.parse(match[1]);
      console.log(`✅ Загружено ${productsCache?.length || 0} товаров из базы данных`);
      return productsCache || [];
    } catch (parseError) {
      console.error('❌ Ошибка парсинга данных товаров:', parseError);
      return [];
    }
  } catch (error) {
    console.error('❌ Ошибка загрузки базы данных товаров:', error);
    return [];
  }
}

/**
 * Ищет товар по штрихкоду в базе данных
 * @param barcode - полный штрихкод или его часть
 * @returns Найденный товар или null
 */
export async function findProductInDatabase(barcode: string): Promise<{
  barcode: string;
  name: string;
  purchasePrice: number;
  retailPrice: number;
} | null> {
  if (!barcode || barcode.trim().length === 0) {
    return null;
  }

  const products = await loadProductsDatabase();
  if (products.length === 0) {
    return null;
  }

  // Ищем точное совпадение или совпадение по окончанию штрихкода
  const normalizedBarcode = barcode.trim();
  const found = products.find(p => 
    p[0] === normalizedBarcode || 
    p[0].endsWith(normalizedBarcode)
  );

  if (found) {
    console.log('✅ Товар найден в базе данных:', {
      barcode: found[0],
      name: found[1],
      purchasePrice: found[2],
      retailPrice: found[3]
    });
    
    return {
      barcode: found[0],
      name: found[1],
      purchasePrice: found[2],
      retailPrice: found[3]
    };
  }

  return null;
}

/**
 * Очищает кэш базы данных (для перезагрузки данных)
 */
export function clearProductsDatabaseCache() {
  productsCache = null;
}
