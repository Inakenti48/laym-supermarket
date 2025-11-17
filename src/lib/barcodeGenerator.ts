// Генератор уникальных штрих-кодов

/**
 * Генерирует уникальный штрих-код EAN-13
 * Формат: 200XXXXXXXXX + контрольная цифра
 */
export const generateUniqueBarcode = (): string => {
  // Префикс 200 для внутренних штрих-кодов
  const prefix = '200';
  
  // Генерируем 9 случайных цифр
  let randomDigits = '';
  for (let i = 0; i < 9; i++) {
    randomDigits += Math.floor(Math.random() * 10).toString();
  }
  
  // Формируем код без контрольной цифры
  const barcodeWithoutCheck = prefix + randomDigits;
  
  // Вычисляем контрольную цифру
  const checkDigit = calculateEAN13CheckDigit(barcodeWithoutCheck);
  
  return barcodeWithoutCheck + checkDigit;
};

/**
 * Вычисляет контрольную цифру для EAN-13
 */
const calculateEAN13CheckDigit = (barcode: string): string => {
  let sum = 0;
  
  // Суммируем цифры с весами 1 и 3 (слева направо)
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(barcode[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  
  // Контрольная цифра = (10 - (сумма % 10)) % 10
  const checkDigit = (10 - (sum % 10)) % 10;
  
  return checkDigit.toString();
};

/**
 * Генерирует массив уникальных штрих-кодов
 */
export const generateMultipleBarcodes = (count: number, existingBarcodes: Set<string> = new Set()): string[] => {
  const barcodes: string[] = [];
  const allExisting = new Set([...existingBarcodes, ...barcodes]);
  
  while (barcodes.length < count) {
    const newBarcode = generateUniqueBarcode();
    
    // Проверяем, что код уникален
    if (!allExisting.has(newBarcode)) {
      barcodes.push(newBarcode);
      allExisting.add(newBarcode);
    }
  }
  
  return barcodes;
};

/**
 * Проверяет валидность штрих-кода EAN-13
 */
export const isValidEAN13 = (barcode: string): boolean => {
  if (barcode.length !== 13) return false;
  if (!/^\d+$/.test(barcode)) return false;
  
  const checkDigit = barcode[12];
  const calculatedCheck = calculateEAN13CheckDigit(barcode.substring(0, 12));
  
  return checkDigit === calculatedCheck;
};
