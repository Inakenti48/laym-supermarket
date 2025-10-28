// ESC/POS Printer commands
const ESC = '\x1b';
const GS = '\x1d';

export interface PrinterConfig {
  port: any | null;
  connected: boolean;
}

let printerPort: any | null = null;

// ESC/POS команды
const commands = {
  INIT: `${ESC}@`,
  ALIGN_CENTER: `${ESC}a1`,
  ALIGN_LEFT: `${ESC}a0`,
  BOLD_ON: `${ESC}E1`,
  BOLD_OFF: `${ESC}E0`,
  SIZE_NORMAL: `${GS}!0`,
  SIZE_DOUBLE: `${GS}!17`,
  CUT: `${GS}V66\x00`,
  OPEN_DRAWER: `${ESC}p\x00\x32\x78`, // ESC p m t1 t2 - стандартная команда открытия ящика
  FEED: '\n',
};

export const connectPrinter = async (): Promise<boolean> => {
  try {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API не поддерживается');
    }

    // @ts-ignore - Web Serial API
    printerPort = await navigator.serial.requestPort();
    await printerPort.open({ baudRate: 9600 });
    
    return true;
  } catch (error) {
    console.error('Ошибка подключения принтера:', error);
    return false;
  }
};

export const disconnectPrinter = async (): Promise<void> => {
  if (printerPort) {
    try {
      await printerPort.close();
      printerPort = null;
    } catch (error) {
      console.error('Ошибка отключения принтера:', error);
    }
  }
};

export const isPrinterConnected = (): boolean => {
  return printerPort !== null;
};

const writeToPort = async (data: string): Promise<void> => {
  if (!printerPort) {
    throw new Error('Принтер не подключен');
  }

  const writer = printerPort.writable?.getWriter();
  if (!writer) {
    throw new Error('Не удалось получить writer');
  }

  try {
    const encoder = new TextEncoder();
    await writer.write(encoder.encode(data));
  } finally {
    writer.releaseLock();
  }
};

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  time: string;
  cashier: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  total: number;
  received: number;
  change: number;
}

export const printReceipt = async (data: ReceiptData): Promise<boolean> => {
  try {
    if (!printerPort) {
      throw new Error('Принтер не подключен. Нажмите "Подключить принтер"');
    }

    let receipt = '';
    
    // Инициализация
    receipt += commands.INIT;
    
    // Открыть кассовый ящик сразу
    receipt += commands.OPEN_DRAWER;
    
    // Заголовок
    receipt += commands.ALIGN_CENTER;
    receipt += commands.SIZE_DOUBLE;
    receipt += commands.BOLD_ON;
    receipt += 'МАГАЗИН' + commands.FEED;
    receipt += commands.SIZE_NORMAL;
    receipt += 'супермаркет лайм' + commands.FEED;
    receipt += commands.BOLD_OFF;
    receipt += commands.FEED;
    
    // Информация о чеке
    receipt += commands.ALIGN_LEFT;
    receipt += commands.BOLD_ON;
    receipt += `Чек: ${data.receiptNumber}` + commands.FEED;
    receipt += `Дата: ${data.date}` + commands.FEED;
    receipt += `Время: ${data.time}` + commands.FEED;
    receipt += `Кассир: ${data.cashier}` + commands.FEED;
    receipt += commands.BOLD_OFF;
    receipt += '--------------------------------' + commands.FEED;
    
    // Товары
    receipt += commands.BOLD_ON;
    data.items.forEach(item => {
      const name = item.name.padEnd(20);
      const qty = `${item.quantity}x`.padStart(4);
      const price = `${item.price}₽`.padStart(8);
      receipt += `${name}${qty}${price}` + commands.FEED;
      receipt += `  Итого: ${item.total}₽` + commands.FEED;
    });
    receipt += commands.BOLD_OFF;
    
    receipt += '--------------------------------' + commands.FEED;
    
    // Итого
    receipt += commands.BOLD_ON;
    receipt += commands.SIZE_DOUBLE;
    receipt += `ИТОГО: ${data.total}₽` + commands.FEED;
    receipt += commands.SIZE_NORMAL;
    receipt += `Получено: ${data.received}₽` + commands.FEED;
    receipt += `Сдача: ${data.change}₽` + commands.FEED;
    receipt += commands.BOLD_OFF;
    receipt += commands.FEED;
    
    // Футер
    receipt += commands.ALIGN_CENTER;
    receipt += commands.BOLD_ON;
    receipt += 'Спасибо за покупку!' + commands.FEED;
    receipt += 'Приходите еще!' + commands.FEED;
    receipt += commands.BOLD_OFF;
    receipt += commands.FEED;
    receipt += commands.FEED;
    receipt += commands.FEED;
    
    // Отрезать чек
    receipt += commands.CUT;
    
    await writeToPort(receipt);
    return true;
  } catch (error) {
    console.error('Ошибка печати чека:', error);
    throw error;
  }
};

// Альтернативный метод для браузерной печати (если принтер не подключен)
export const printReceiptBrowser = (data: ReceiptData): void => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Чек ${data.receiptNumber}</title>
      <style>
        @page { 
          size: 80mm auto;
          margin: 0;
        }
        body {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          width: 80mm;
          margin: 0;
          padding: 5mm;
        }
        .center { text-align: center; }
        .bold { font-weight: bold; }
        .large { font-size: 16px; }
        .separator { border-top: 1px dashed #000; margin: 5px 0; }
        .item { display: flex; justify-content: space-between; margin: 2px 0; }
        .total { font-size: 14px; font-weight: bold; }
        @media print {
          body { width: 80mm; }
        }
      </style>
    </head>
    <body>
      <div class="center large bold">МАГАЗИН</div>
      <div class="center">супермаркет лайм</div>
      <div class="separator"></div>
      <div>Чек: ${data.receiptNumber}</div>
      <div>Дата: ${data.date}</div>
      <div>Время: ${data.time}</div>
      <div>Кассир: ${data.cashier}</div>
      <div class="separator"></div>
      ${data.items.map(item => `
        <div class="item">
          <span>${item.name}</span>
          <span>${item.quantity}x${item.price}₽</span>
        </div>
        <div class="item" style="padding-left: 10px;">
          <span>Итого:</span>
          <span>${item.total}₽</span>
        </div>
      `).join('')}
      <div class="separator"></div>
      <div class="total">ИТОГО: ${data.total}₽</div>
      <div>Получено: ${data.received}₽</div>
      <div>Сдача: ${data.change}₽</div>
      <div class="separator"></div>
      <div class="center">Спасибо за покупку!</div>
      <div class="center">Приходите еще!</div>
    </body>
    </html>
  `;

  // Создаем скрытый iframe для печати
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentWindow?.document;
  if (iframeDoc) {
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();

    // Печать и удаление iframe
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 250);
  }
};
