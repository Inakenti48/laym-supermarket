# 🏪 ПРОМПТ ДЛЯ ВОССОЗДАНИЯ СИСТЕМЫ УПРАВЛЕНИЯ МАГАЗИНОМ

## Описание проекта

Создай веб-приложение "Система учета товаров для магазина" с поддержкой:
- Управления товарами (добавление, редактирование, удаление)
- AI-распознавания товаров по фото (2 фото: лицевая сторона + штрихкод)
- Касса для оформления продаж
- Управления поставщиками
- Отчетов и статистики
- Ролевой системы доступа

---

## ТЕХНОЛОГИЧЕСКИЙ СТЕК

```
Frontend:
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- React Query (TanStack Query)
- React Router DOM
- Lucide Icons
- Sonner (уведомления)

Backend:
- Supabase Edge Functions (Deno)
- MySQL база данных (внешняя)
- Lovable AI Gateway (Google Gemini) для распознавания

Сканирование:
- html5-qrcode (сканер штрихкодов)
- @zxing/library
- Tesseract.js (OCR)

Дополнительно:
- Recharts (графики)
- date-fns
- lodash
```

---

## СТРУКТУРА ФАЙЛОВ

```
src/
├── pages/
│   └── Index.tsx              # Главная страница с табами и авторизацией
│
├── components/
│   ├── ui/                    # shadcn компоненты (button, card, input, dialog...)
│   │
│   ├── DashboardTab.tsx       # Панель со статистикой
│   ├── InventoryTab.tsx       # Управление товарами + AI-сканирование
│   ├── CashierTab.tsx         # Касса для продаж
│   ├── PendingProductsTab.tsx # Очередь товаров (без цен)
│   ├── SuppliersTab.tsx       # Справочник поставщиков
│   ├── ReportsTab.tsx         # Отчеты по продажам
│   ├── ExpiryTab.tsx          # Контроль сроков годности
│   ├── EmployeesTab.tsx       # Управление сотрудниками
│   ├── CancellationsTab.tsx   # Отмененные продажи
│   ├── LogsTab.tsx            # Журнал действий
│   ├── DiagnosticsTab.tsx     # Настройки и диагностика
│   │
│   ├── AIProductRecognition.tsx   # AI-распознавание с камеры (2 фото)
│   ├── BarcodeScanner.tsx         # Сканер штрихкодов
│   ├── CameraScanner.tsx          # Камера для съемки
│   ├── PhotoGalleryRecognition.tsx # Загрузка фото из галереи
│   │
│   ├── CashierCartItem.tsx        # Товар в корзине
│   ├── PendingProductItem.tsx     # Товар в очереди
│   │
│   ├── RoleSelector.tsx           # Выбор роли при входе
│   ├── EmployeeLoginScreen.tsx    # Вход сотрудника
│   ├── DatabaseBackupButton.tsx   # Резервное копирование
│   └── WiFiPrinterSettings.tsx    # Настройки принтера
│
├── lib/
│   ├── mysqlDatabase.ts       # Запросы к MySQL через Edge Function
│   ├── mysqlCollections.ts    # Коллекции (products, queue, sales, suppliers)
│   ├── storage.ts             # Абстракция хранения товаров
│   ├── loginAuth.ts           # Авторизация по логину
│   ├── printer.ts             # Печать чеков
│   ├── barcodeGenerator.ts    # Генерация штрихкодов
│   ├── csvImport.ts           # Импорт из CSV
│   ├── imageCompression.ts    # Сжатие изображений
│   ├── suppliersDb.ts         # Работа с поставщиками
│   └── employees.ts           # Управление сотрудниками
│
├── hooks/
│   ├── useProductsSync.ts     # Синхронизация товаров
│   └── useFormSync.ts         # Синхронизация форм
│
└── integrations/
    └── supabase/
        └── client.ts          # Supabase клиент

supabase/functions/
├── mysql-query/index.ts           # Прокси для MySQL запросов
├── scan-product-photos/index.ts   # AI-распознавание товаров (2 фото)
├── fast-scan-product/index.ts     # Быстрое AI-распознавание
├── recognize-expiry-date/index.ts # Распознавание срока годности
├── login-by-username/index.ts     # Авторизация
├── s3-upload/index.ts             # Загрузка фото в S3
└── bulk-import-products/index.ts  # Массовый импорт
```

---

## РОЛЕВАЯ СИСТЕМА

| Роль | Доступ к табам |
|------|----------------|
| `admin` | ВСЕ разделы |
| `cashier1` | Касса 1 |
| `cashier2` | Касса 2 |
| `warehouse` | Товары, Очередь |
| `system` | Товары |

**Код ролей в Index.tsx:**
```typescript
const ALL_TABS_DATA = [
  { id: 'dashboard', label: 'Панель', icon: LayoutDashboard, roles: ['admin'] },
  { id: 'inventory', label: 'Товары', icon: Package, roles: ['admin', 'warehouse'] },
  { id: 'cashier', label: 'Касса 1', icon: ShoppingCart, roles: ['admin', 'cashier1'] },
  { id: 'cashier2', label: 'Касса 2', icon: ShoppingCart, roles: ['admin', 'cashier2'] },
  { id: 'pending-products', label: 'Очередь', icon: Upload, roles: ['admin', 'warehouse'] },
  { id: 'suppliers', label: 'Поставщики', icon: Building2, roles: ['admin'] },
  { id: 'reports', label: 'Отчёты', icon: FileText, roles: ['admin'] },
  { id: 'expiry', label: 'Сроки', icon: AlertTriangle, roles: ['admin'] },
  { id: 'diagnostics', label: 'Настройки', icon: Settings, roles: ['admin'] },
  { id: 'employees', label: 'Сотрудники', icon: Users, roles: ['admin'] },
  { id: 'cancellations', label: 'Отмены', icon: XCircle, roles: ['admin'] },
  { id: 'logs', label: 'Логи', icon: Activity, roles: ['admin'] },
];
```

---

## ГЛАВНАЯ СТРАНИЦА (Index.tsx)

```typescript
// Структура:
// 1. Проверка сессии из localStorage
// 2. Если нет сессии - показать RoleSelector (выбор роли/логин)
// 3. Если есть сессия - показать Header + Navigation + Content

// Header содержит:
// - Логотип и название
// - Индикатор подключения к MySQL
// - Кнопка резервного копирования
// - Кнопки Назад и Выход

// Navigation - горизонтальные табы (фильтруются по роли)

// Content - lazy-loaded компоненты табов через Suspense
```

---

## AI-РАСПОЗНАВАНИЕ ТОВАРОВ

### Процесс:
1. Пользователь делает **2 фото**: лицевая сторона + штрихкод
2. Фото отправляются в Edge Function `scan-product-photos`
3. AI (Google Gemini) анализирует и извлекает:
   - Штрихкод (цифры)
   - Название товара (бренд + продукт + вес)
   - Категорию
4. Данные возвращаются в форму
5. Пользователь проверяет, добавляет цены и сохраняет

### Edge Function (scan-product-photos):
```typescript
// Используем Lovable AI Gateway
const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash-lite', // Быстрая модель
    messages: [
      { role: 'system', content: 'Извлеки штрихкод, название, категорию' },
      { role: 'user', content: [
        { type: 'text', text: 'Распознай товар' },
        { type: 'image_url', image_url: { url: frontPhoto } },
        { type: 'image_url', image_url: { url: barcodePhoto } }
      ]}
    ],
    tools: [{
      type: "function",
      function: {
        name: "extract_product",
        parameters: {
          type: "object",
          properties: {
            barcode: { type: "string" },
            name: { type: "string" },
            category: { type: "string" }
          }
        }
      }
    }],
    tool_choice: { type: "function", function: { name: "extract_product" } }
  })
});
```

---

## MYSQL БАЗА ДАННЫХ

### Таблицы:

**products** - Товары
```sql
CREATE TABLE products (
  id VARCHAR(36) PRIMARY KEY,
  barcode VARCHAR(50) UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  purchase_price DECIMAL(10,2),   -- Закупочная цена
  sale_price DECIMAL(10,2),       -- Розничная цена
  quantity INT DEFAULT 0,
  unit VARCHAR(20) DEFAULT 'шт',
  supplier_id VARCHAR(36),
  expiry_date DATE,
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**products_queue** - Очередь товаров (ожидают заполнения цен)
```sql
CREATE TABLE products_queue (
  id VARCHAR(36) PRIMARY KEY,
  barcode VARCHAR(50),
  name VARCHAR(255),
  category VARCHAR(100),
  purchase_price VARCHAR(50),
  retail_price VARCHAR(50),
  quantity VARCHAR(50),
  expiry_date VARCHAR(50),
  front_photo TEXT,
  barcode_photo TEXT,
  user_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**sales** - Продажи
```sql
CREATE TABLE sales (
  id VARCHAR(36) PRIMARY KEY,
  items JSON,                      -- Массив товаров [{barcode, name, price, qty}]
  total DECIMAL(10,2),
  payment_method VARCHAR(20),      -- cash, card
  cashier_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**suppliers** - Поставщики
```sql
CREATE TABLE suppliers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(100),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**users** - Пользователи
```sql
CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  login VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,       -- admin, cashier1, cashier2, warehouse
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## MYSQL EDGE FUNCTION (mysql-query)

```typescript
// Принимает action и data, выполняет соответствующий запрос

const actions = {
  // Products
  'get_products': () => SELECT * FROM products,
  'get_product_by_barcode': (barcode) => SELECT * FROM products WHERE barcode = ?,
  'insert_product': (data) => INSERT INTO products (...) VALUES (...),
  'update_product': (id, data) => UPDATE products SET ... WHERE id = ?,
  'delete_product': (id) => DELETE FROM products WHERE id = ?,
  
  // Queue
  'get_queue': () => SELECT * FROM products_queue ORDER BY created_at DESC,
  'add_to_queue': (data) => INSERT INTO products_queue (...),
  'update_queue_item': (id, data) => UPDATE products_queue SET ... WHERE id = ?,
  'delete_queue_item': (id) => DELETE FROM products_queue WHERE id = ?,
  
  // Sales
  'add_sale': (data) => INSERT INTO sales (...),
  'get_sales': (from, to) => SELECT * FROM sales WHERE created_at BETWEEN ? AND ?,
  
  // Suppliers
  'get_suppliers': () => SELECT * FROM suppliers,
  'add_supplier': (data) => INSERT INTO suppliers (...),
  
  // Auth
  'login': (login, password) => SELECT * FROM users WHERE login = ? AND password_hash = ?
};
```

---

## КАССА (CashierTab)

### Функционал:
1. **Поиск товаров** по названию или штрихкоду
2. **Сканирование** штрихкодов камерой
3. **AI-распознавание** - быстрое добавление по фото
4. **Корзина** - список товаров с количеством
5. **Калькулятор сдачи** - ввод полученной суммы
6. **Печать чека** - на термопринтер или в браузере
7. **Быстрые товары** - кнопки для частых товаров

### Структура корзины:
```typescript
interface CartItem {
  id: string;
  name: string;
  price: number;      // Розничная цена
  quantity: number;
  barcode?: string;
}
```

---

## ОЧЕРЕДЬ ТОВАРОВ (PendingProductsTab)

### Логика:
1. AI-сканирование добавляет товары в `products_queue`
2. В очереди отображаются товары БЕЗ обеих цен
3. Пользователь заполняет закупочную и розничную цену
4. При сохранении товар переносится в `products`
5. Автоперенос товаров с заполненными ценами

### Автоперенос:
```typescript
// Если у товара есть barcode + name + purchasePrice > 0 + retailPrice > 0:
// 1. Добавляем в products
// 2. Удаляем из products_queue
```

---

## КОМПОНЕНТ INVENTORYTAB

### Функционал:
1. **Форма добавления товара** с полями:
   - Штрихкод
   - Название
   - Категория (автоопределение по названию)
   - Закупочная цена
   - Розничная цена
   - Количество
   - Единица измерения
   - Срок годности
   - Поставщик

2. **Кнопки AI-сканирования:**
   - 📸 Сканировать товар (2 фото)
   - 📷 Из галереи
   - 📅 Распознать срок годности

3. **Автосохранение** при заполнении всех полей

4. **Проверка дубликатов** по штрихкоду

---

## АВТООПРЕДЕЛЕНИЕ КАТЕГОРИИ

```typescript
const determineCategoryFromName = (productName: string): string => {
  const name = productName.toLowerCase();
  
  if (name.includes('хлеб') || name.includes('молоко') || name.includes('сыр')) 
    return 'Продукты питания';
    
  if (name.includes('вода') || name.includes('сок') || name.includes('кола')) 
    return 'Напитки';
    
  if (name.includes('порошок') || name.includes('мыло') || name.includes('гель')) 
    return 'Бытовая химия';
    
  if (name.includes('шампунь') || name.includes('крем')) 
    return 'Косметика';
    
  if (name.includes('детск') || name.includes('памперс')) 
    return 'Детские товары';
    
  return 'Другое';
};
```

---

## СЕКРЕТЫ (Environment Variables)

```
# Supabase (автоматически)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

# MySQL (в Edge Function secrets)
MYSQL_HOST=
MYSQL_PORT=3306
MYSQL_USER=
MYSQL_PASSWORD=
MYSQL_DATABASE=

# AI (автоматически в Lovable Cloud)
LOVABLE_API_KEY=

# S3 для фото (опционально)
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_BUCKET=
S3_REGION=
```

---

## СВЯЗЬ КНОПОК С ФАЙЛАМИ

| Кнопка/Элемент | Файл | Действие |
|----------------|------|----------|
| "Сканировать товар" | `AIProductRecognition.tsx` | Открывает камеру для 2 фото |
| "Из галереи" | `PhotoGalleryRecognition.tsx` | Загрузка фото из галереи |
| "Сканировать штрихкод" | `BarcodeScanner.tsx` | Камера для сканирования |
| "Добавить товар" | `InventoryTab.tsx` | Сохраняет в MySQL |
| "В очередь" | `InventoryTab.tsx` → `mysqlCollections.addToQueue` | Добавляет в products_queue |
| "Оформить продажу" | `CashierTab.tsx` → `mysqlCollections.addSale` | Создает запись в sales |
| "Печать чека" | `CashierTab.tsx` → `printer.ts` | Печатает чек |
| "Сохранить" (очередь) | `PendingProductsTab.tsx` → `mysqlDatabase.insertProduct` | Переносит в products |
| "Резервная копия" | `DatabaseBackupButton.tsx` → `databaseBackup.ts` | Экспорт данных |
| "Выход" | `Index.tsx` → `clearSession()` | Очищает localStorage |

---

## ПОТОКИ ДАННЫХ

### Добавление товара через AI:
```
[Камера] → [2 фото] → [Edge Function scan-product-photos] 
→ [AI Gemini] → {barcode, name, category} 
→ [Форма InventoryTab] → [Пользователь добавляет цены]
→ [mysqlDatabase.insertProduct] → [MySQL products]
```

### Оформление продажи:
```
[Поиск/Сканирование] → [Добавить в корзину] 
→ [Рассчитать сдачу] → [Оформить] 
→ [mysqlCollections.addSale] → [MySQL sales]
→ [Обновить остатки] → [Печать чека]
```

### Очередь товаров:
```
[AI-сканирование без цен] → [products_queue]
→ [Заполнение цен в PendingProductsTab]
→ [Автоперенос] → [MySQL products]
```

---

## СТИЛИ (index.css)

```css
:root {
  /* Основные цвета */
  --background: 0 0% 71%;          /* Серый фон #b6b6b6 */
  --foreground: 222 47% 11%;
  --primary: 220 70% 50%;
  --secondary: 220 14% 96%;
  
  /* Карточки */
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  
  /* Кнопки */
  --primary: 220 70% 50%;
  --primary-foreground: 0 0% 100%;
  
  /* Радиусы */
  --radius: 0.5rem;
}
```

---

## ДОПОЛНИТЕЛЬНЫЕ ИНСТРУКЦИИ

1. **Lazy Loading** - все табы загружаются лениво через `lazy()` и `Suspense`
2. **Кэширование** - товары кэшируются в памяти для быстрого поиска
3. **Автосохранение** - форма сохраняется автоматически при заполнении всех полей
4. **Retry Logic** - повторные попытки при ошибках сети (3 попытки)
5. **Responsive** - адаптивный дизайн для мобильных устройств
6. **Toast уведомления** - через sonner для всех действий

---

## ПРИМЕР ЗАПУСКА

```bash
# Установка зависимостей
npm install

# Запуск dev сервера
npm run dev

# Сборка
npm run build
```

Для работы нужно:
1. Настроить MySQL базу и добавить секреты
2. Создать таблицы (см. схему выше)
3. Добавить пользователя admin в таблицу users
