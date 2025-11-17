// Wi-Fi принтер для печати штрих-кодов

const ESC = '\x1b';
const GS = '\x1d';

interface WiFiPrinterConfig {
  ipAddress: string;
  port: number;
}

// Храним конфигурацию принтера
let printerConfig: WiFiPrinterConfig | null = null;

/**
 * Устанавливает конфигурацию Wi-Fi принтера
 */
export const setWiFiPrinterConfig = (ipAddress: string, port: number = 9100) => {
  printerConfig = { ipAddress, port };
  localStorage.setItem('wifi_printer_config', JSON.stringify(printerConfig));
};

/**
 * Загружает сохраненную конфигурацию принтера
 */
export const loadWiFiPrinterConfig = (): WiFiPrinterConfig | null => {
  try {
    const saved = localStorage.getItem('wifi_printer_config');
    if (saved) {
      printerConfig = JSON.parse(saved);
      return printerConfig;
    }
  } catch (error) {
    console.error('Ошибка загрузки конфигурации принтера:', error);
  }
  return null;
};

/**
 * Отправляет данные на Wi-Fi принтер
 */
const sendToPrinter = async (data: string): Promise<boolean> => {
  if (!printerConfig) {
    throw new Error('Wi-Fi принтер не настроен');
  }

  try {
    // Используем fetch для отправки данных на принтер через HTTP
    const url = `http://${printerConfig.ipAddress}:${printerConfig.port}/print`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
      },
      body: data,
      mode: 'no-cors', // Для кросс-доменных запросов
    });

    console.log('✅ Данные отправлены на принтер');
    return true;
  } catch (error) {
    console.error('❌ Ошибка отправки на принтер:', error);
    
    // Fallback: попробуем через прямое TCP соединение (если браузер поддерживает)
    try {
      const socket = await connectToSocket(printerConfig.ipAddress, printerConfig.port);
      await writeToSocket(socket, data);
      socket.close();
      return true;
    } catch (socketError) {
      console.error('❌ Ошибка TCP соединения:', socketError);
      throw new Error('Не удалось подключиться к принтеру');
    }
  }
};

/**
 * Подключается к принтеру через TCP (если поддерживается)
 */
const connectToSocket = async (host: string, port: number): Promise<any> => {
  // Используем Web Socket API если доступен
  if ('WebSocket' in window) {
    const ws = new WebSocket(`ws://${host}:${port}`);
    
    return new Promise((resolve, reject) => {
      ws.onopen = () => resolve(ws);
      ws.onerror = (error) => reject(error);
    });
  }
  
  throw new Error('WebSocket не поддерживается');
};

/**
 * Записывает данные в сокет
 */
const writeToSocket = async (socket: any, data: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      socket.send(data);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Печатает штрих-коды на Wi-Fi принтере
 */
export const printBarcodesWiFi = async (
  barcodes: string[],
  productName: string,
  productPrice?: number
): Promise<boolean> => {
  if (!printerConfig) {
    throw new Error('Wi-Fi принтер не настроен. Установите IP-адрес принтера в настройках.');
  }

  try {
    for (const barcode of barcodes) {
      const printData = formatBarcodeLabel(barcode, productName, productPrice);
      await sendToPrinter(printData);
      
      // Небольшая задержка между печатью этикеток
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`✅ Напечатано ${barcodes.length} штрих-кодов`);
    return true;
  } catch (error) {
    console.error('❌ Ошибка печати штрих-кодов:', error);
    throw error;
  }
};

/**
 * Форматирует этикетку со штрих-кодом для печати
 */
const formatBarcodeLabel = (
  barcode: string,
  productName: string,
  productPrice?: number
): string => {
  const commands = {
    INIT: `${ESC}@`,
    ALIGN_CENTER: `${ESC}a1`,
    ALIGN_LEFT: `${ESC}a0`,
    BOLD_ON: `${ESC}E1`,
    BOLD_OFF: `${ESC}E0`,
    SIZE_NORMAL: `${GS}!0`,
    SIZE_SMALL: `${GS}!0`,
    BARCODE_HEIGHT: `${GS}h\x64`, // Высота штрих-кода 100 точек
    BARCODE_WIDTH: `${GS}w\x02`, // Ширина модуля 2
    BARCODE_TEXT_BELOW: `${GS}H2`, // Печать текста под штрих-кодом
    BARCODE_EAN13: `${GS}k\x43\x0D`, // EAN-13 + длина
    CUT: `${GS}V66\x00`,
    FEED: '\n',
  };

  // Формируем команды печати
  let printCommands = '';
  
  // Инициализация
  printCommands += commands.INIT;
  
  // Название товара (по центру, жирным)
  printCommands += commands.ALIGN_CENTER;
  printCommands += commands.BOLD_ON;
  printCommands += commands.SIZE_NORMAL;
  printCommands += productName.substring(0, 32); // Максимум 32 символа
  printCommands += commands.FEED;
  printCommands += commands.BOLD_OFF;
  
  // Цена (если указана)
  if (productPrice) {
    printCommands += commands.SIZE_NORMAL;
    printCommands += `Цена: ${productPrice.toFixed(2)} ₸`;
    printCommands += commands.FEED;
  }
  
  printCommands += commands.FEED;
  
  // Настройки штрих-кода
  printCommands += commands.BARCODE_HEIGHT;
  printCommands += commands.BARCODE_WIDTH;
  printCommands += commands.BARCODE_TEXT_BELOW;
  
  // Печать штрих-кода EAN-13
  printCommands += commands.BARCODE_EAN13;
  printCommands += barcode;
  
  // Подача бумаги и отрез
  printCommands += commands.FEED;
  printCommands += commands.FEED;
  printCommands += commands.FEED;
  printCommands += commands.CUT;
  
  return printCommands;
};

/**
 * Тестирует подключение к принтеру
 */
export const testWiFiPrinterConnection = async (): Promise<boolean> => {
  if (!printerConfig) {
    throw new Error('Wi-Fi принтер не настроен');
  }

  try {
    const testData = `${ESC}@Тест подключения${GS}V66\x00`;
    await sendToPrinter(testData);
    return true;
  } catch (error) {
    console.error('❌ Ошибка тестирования принтера:', error);
    return false;
  }
};

// Загружаем конфигурацию при импорте модуля
loadWiFiPrinterConfig();
