// Utility to load prices from CSV product database by barcode
const CSV_FILES = [
  '/data/price_reference.csv', // Основной справочник цен
  '/data/products_part_1.csv',
  '/data/products_part_2.csv',
  '/data/products_part_3.csv',
  '/data/products_part_4.csv',
];

interface CSVProductPrice {
  barcode: string;
  purchase_price: number;
  sale_price: number;
  name?: string;
  category?: string;
}

let cachedProducts: CSVProductPrice[] | null = null;

// Декодирование Windows-1251 в UTF-8
const decodeWindows1251 = (buffer: ArrayBuffer): string => {
  const decoder = new TextDecoder('windows-1251');
  return decoder.decode(buffer);
};

export const loadCSVPrices = async (): Promise<CSVProductPrice[]> => {
  if (cachedProducts) {
    return cachedProducts;
  }

  const allProducts: CSVProductPrice[] = [];

  for (const file of CSV_FILES) {
    try {
      const response = await fetch(file);
      
      // Пробуем декодировать как Windows-1251 для файла price_reference.csv
      let text: string;
      if (file.includes('price_reference')) {
        const buffer = await response.arrayBuffer();
        text = decodeWindows1251(buffer);
      } else {
        text = await response.text();
      }
      
      const lines = text.split('\n').filter(line => line.trim());

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Парсим CSV с учетом точки с запятой как разделителя (для price_reference.csv)
        const delimiter = line.includes(';') ? ';' : ',';
        const parts = line.split(delimiter).map(p => p.trim().replace(/"/g, ''));
        
        if (parts.length < 6) continue;

        // Формат price_reference.csv: Код;Категория;Наименование;Ед.;Количество;Цена;Сумма
        // Формат старых CSV: barcode,name,category,unit,purchase_price,sale_price,...
        
        let barcode: string;
        let name: string;
        let category: string;
        let purchasePrice: number;
        let salePrice: number;
        
        if (file.includes('price_reference')) {
          // Новый формат: Код;Категория;Наименование;Ед.;Количество;Цена;Сумма
          barcode = parts[0];
          category = parts[1];
          name = parts[2];
          // Цена в CSV - это розничная цена, закупочная = 80% от розничной (примерная маржа)
          const price = parseFloat(parts[5]?.replace(',', '.')) || 0;
          salePrice = price;
          purchasePrice = Math.round(price * 0.7 * 100) / 100; // 30% маржа
        } else {
          // Старый формат
          barcode = parts[0];
          name = parts[1];
          category = parts[2];
          purchasePrice = parseFloat(parts[4]) || 0;
          salePrice = parseFloat(parts[5]) || 0;
        }

        if (barcode && salePrice > 0) {
          allProducts.push({
            barcode,
            purchase_price: purchasePrice,
            sale_price: salePrice,
            name,
            category
          });
        }
      }
      
      console.log(`✅ Загружено из ${file}: ${allProducts.length} товаров`);
    } catch (error) {
      console.error(`Error loading ${file}:`, error);
    }
  }

  cachedProducts = allProducts;
  console.log(`📦 Всего загружено товаров в справочник: ${allProducts.length}`);
  return allProducts;
};

// Поиск по штрихкоду с поддержкой частичного совпадения (последние 4+ цифры)
export const findPricesByBarcode = async (barcode: string): Promise<CSVProductPrice | null> => {
  if (!barcode || barcode.trim().length === 0) {
    return null;
  }
  
  const products = await loadCSVPrices();
  const normalizedBarcode = barcode.trim();
  
  // 1. Сначала ищем точное совпадение
  let found = products.find(p => p.barcode === normalizedBarcode);
  if (found) {
    console.log('✅ Найдено точное совпадение штрихкода:', found.barcode);
    return found;
  }
  
  // 2. Ищем по последним 4+ цифрам (если штрихкод длинный)
  if (normalizedBarcode.length >= 4) {
    const last4 = normalizedBarcode.slice(-4);
    found = products.find(p => p.barcode.endsWith(last4));
    if (found) {
      console.log(`✅ Найдено совпадение по последним 4 цифрам (${last4}):`, found.barcode);
      return found;
    }
  }
  
  // 3. Ищем где штрихкод из CSV заканчивается на наш штрихкод
  found = products.find(p => p.barcode.endsWith(normalizedBarcode));
  if (found) {
    console.log('✅ Найдено совпадение по окончанию:', found.barcode);
    return found;
  }
  
  // 4. Ищем где наш штрихкод заканчивается на штрихкод из CSV
  found = products.find(p => normalizedBarcode.endsWith(p.barcode));
  if (found) {
    console.log('✅ Найдено обратное совпадение:', found.barcode);
    return found;
  }
  
  console.log('❌ Товар не найден в справочнике цен:', normalizedBarcode);
  return null;
};

export const clearPriceCache = () => {
  cachedProducts = null;
};
