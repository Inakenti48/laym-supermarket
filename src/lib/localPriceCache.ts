// Локальный кэш цен из CSV файлов
// Используется для быстрого поиска цен без обращения к базе данных

interface PriceEntry {
  code: string;
  name: string;
  category: string;
  unit: string;
  purchasePrice: number;
  quantity: number;
}

let priceCache: Map<string, PriceEntry> | null = null;
let nameLookup: Map<string, PriceEntry> | null = null;

// Парсинг строки CSV с учётом разделителя ;
function parseCSVLine(line: string): string[] {
  return line.split(';').map(cell => cell.trim());
}

// Парсинг числа с запятой как разделителем
function parseNumber(str: string): number {
  if (!str) return 0;
  return parseFloat(str.replace(',', '.').replace(/[^\d.-]/g, '')) || 0;
}

// Загрузка и парсинг CSV файла
async function loadCSVFile(url: string): Promise<PriceEntry[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to load CSV from ${url}:`, response.status);
      return [];
    }
    
    const text = await response.text();
    const lines = text.split('\n');
    const entries: PriceEntry[] = [];
    
    // Пропускаем заголовок (первые 3 строки)
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const cells = parseCSVLine(line);
      // Структура: ;;;код;группа;название;ед.изм.;количество;закупочная цена;сумма
      const code = cells[3]?.trim();
      const category = cells[4]?.trim() || '';
      const name = cells[5]?.trim() || '';
      const unit = cells[6]?.trim() || 'шт';
      const quantity = parseNumber(cells[7]);
      const purchasePrice = parseNumber(cells[8]);
      
      if (code && name) {
        entries.push({
          code,
          name,
          category,
          unit,
          purchasePrice,
          quantity
        });
      }
    }
    
    return entries;
  } catch (error) {
    console.error(`Error loading CSV:`, error);
    return [];
  }
}

// Инициализация кэша цен
export async function initPriceCache(): Promise<number> {
  if (priceCache && priceCache.size > 0) {
    console.log('📦 Кэш цен уже загружен:', priceCache.size);
    return priceCache.size;
  }
  
  priceCache = new Map();
  nameLookup = new Map();
  
  // Загружаем все CSV файлы с ценами
  const csvFiles = [
    '/data/mm_prices.csv',
    '/data/price_reference.csv',
    '/data/products_part_1.csv',
    '/data/products_part_2.csv',
    '/data/products_part_3.csv',
    '/data/products_part_4.csv'
  ];
  
  for (const file of csvFiles) {
    try {
      const entries = await loadCSVFile(file);
      for (const entry of entries) {
        priceCache.set(entry.code, entry);
        // Также индексируем по имени (нормализованному)
        const normalizedName = entry.name.toLowerCase().replace(/\s+/g, ' ');
        nameLookup.set(normalizedName, entry);
      }
      console.log(`✅ Загружено из ${file}: ${entries.length} товаров`);
    } catch (e) {
      console.warn(`⚠️ Не удалось загрузить ${file}:`, e);
    }
  }
  
  console.log(`📦 Всего в кэше: ${priceCache.size} товаров`);
  return priceCache.size;
}

// Поиск цены по коду
export function findPriceByCode(code: string): PriceEntry | null {
  if (!priceCache) return null;
  return priceCache.get(code) || null;
}

// Поиск цены по штрихкоду (последние цифры)
export function findPriceByBarcode(barcode: string): PriceEntry | null {
  if (!priceCache || !barcode) return null;
  
  // Точное совпадение
  if (priceCache.has(barcode)) {
    return priceCache.get(barcode)!;
  }
  
  // Поиск по последним 4-6 цифрам
  const last6 = barcode.slice(-6);
  const last5 = barcode.slice(-5);
  const last4 = barcode.slice(-4);
  
  for (const [code, entry] of priceCache) {
    if (code.endsWith(last6) || code.endsWith(last5) || code.endsWith(last4)) {
      return entry;
    }
    if (code === last6 || code === last5 || code === last4) {
      return entry;
    }
  }
  
  return null;
}

// Поиск по названию (частичное совпадение)
export function findPriceByName(name: string): PriceEntry | null {
  if (!nameLookup || !name) return null;
  
  const normalizedSearch = name.toLowerCase().replace(/\s+/g, ' ');
  
  // Точное совпадение
  if (nameLookup.has(normalizedSearch)) {
    return nameLookup.get(normalizedSearch)!;
  }
  
  // Частичное совпадение
  for (const [storedName, entry] of nameLookup) {
    if (storedName.includes(normalizedSearch) || normalizedSearch.includes(storedName)) {
      return entry;
    }
  }
  
  return null;
}

// Получить все цены (для отладки)
export function getAllPrices(): PriceEntry[] {
  if (!priceCache) return [];
  return Array.from(priceCache.values());
}

// Получить все товары из кэша для использования как fallback
export function getAllCachedProducts(): Array<{
  barcode: string;
  name: string;
  category: string;
  purchase_price: number;
  sale_price: number;
}> {
  if (!priceCache) return [];
  return Array.from(priceCache.values()).map(entry => ({
    barcode: entry.code,
    name: entry.name,
    category: entry.category || 'Без категории',
    purchase_price: entry.purchasePrice,
    sale_price: Math.round(entry.purchasePrice * 1.3) // Наценка 30%
  }));
}

// Размер кэша
export function getCacheSize(): number {
  return priceCache?.size || 0;
}

// Очистка кэша
export function clearPriceCache(): void {
  priceCache = null;
  nameLookup = null;
}
