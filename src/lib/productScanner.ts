// Система сканирования товаров с сохранением в S3 и MySQL
import { findPriceByBarcode, initPriceCache } from './localPriceCache';

const S3_UPLOAD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-upload`;
const S3_ENDPOINT = 'https://s3.timeweb.cloud'; // Базовый URL для получения фото
const S3_BUCKET = 'b6f597e1-22bca3e1-d32e-432e-8f68-4fb3f3e85b63';

// Инициализируем кэш цен при загрузке модуля
let priceCacheInitialized = false;
async function ensurePriceCache() {
  if (!priceCacheInitialized) {
    await initPriceCache();
    priceCacheInitialized = true;
  }
}

export interface ScannedProduct {
  barcode: string;
  name?: string;
  category?: string;
  purchase_price?: number;
  sale_price?: number;
  quantity?: number;
  expiry_date?: string;
  front_photo_url?: string;
  barcode_photo_url?: string;
  scanned_by: string;
}

// Загрузить фото в S3 с именованием по штрихкоду
export async function uploadProductPhoto(
  barcode: string,
  imageBase64: string,
  type: 'front' | 'barcode'
): Promise<string | null> {
  try {
    // Убираем data:image prefix если есть
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    
    // Имя файла: {barcode}_front.jpg или {barcode}_barcode.jpg
    const fileName = `${barcode}_${type}.jpg`;
    
    const response = await fetch(S3_UPLOAD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upload',
        fileName: fileName,
        fileData: base64Data,
        contentType: 'image/jpeg',
        folder: 'products'
      })
    });
    
    const result = await response.json();
    
    if (result.success && result.url) {
      console.log(`✅ Фото загружено: ${result.url}`);
      return result.url;
    }
    
    console.error('❌ Ошибка загрузки фото:', result.error);
    return null;
  } catch (error) {
    console.error('❌ Ошибка загрузки фото:', error);
    return null;
  }
}

// Получить URL фото по штрихкоду
export function getProductPhotoUrl(barcode: string, type: 'front' | 'barcode'): string {
  return `${S3_ENDPOINT}/${S3_BUCKET}/products/${barcode}_${type}.jpg`;
}

// Добавить отсканированный товар в очередь (MySQL pending_products)
import { createPendingProduct, getProductByBarcode, insertProduct } from './mysqlDatabase';

export async function addScannedProduct(product: ScannedProduct): Promise<{ 
  success: boolean; 
  addedToQueue: boolean; 
  message: string 
}> {
  try {
    // Убеждаемся что кэш цен загружен
    await ensurePriceCache();
    
    // Сначала проверяем переданные цены
    let purchasePrice = product.purchase_price || 0;
    let salePrice = product.sale_price || 0;
    let productName = product.name || '';
    let productCategory = product.category || '';
    let productQuantity = product.quantity || 1;
    
    // Если цены не переданы - ищем в CSV
    if (purchasePrice === 0 || salePrice === 0) {
      const csvData = findPriceByBarcode(product.barcode);
      if (csvData) {
        console.log(`📋 Найдены цены из CSV для ${product.barcode}:`, csvData);
        if (purchasePrice === 0) {
          purchasePrice = csvData.purchasePrice;
        }
        if (salePrice === 0) {
          salePrice = Math.round(csvData.purchasePrice * 1.3); // 30% маржа
        }
        if (!productName && csvData.name) {
          productName = csvData.name;
        }
        if (!productCategory && csvData.category) {
          productCategory = csvData.category;
        }
        if (csvData.quantity > 0 && productQuantity === 1) {
          productQuantity = csvData.quantity;
        }
      }
    }
    
    const hasPrice = purchasePrice > 0 && salePrice > 0;
    
    console.log('📦 addScannedProduct проверка:', {
      barcode: product.barcode,
      name: productName,
      purchasePrice,
      salePrice,
      hasPrice,
      destination: hasPrice ? 'products' : 'queue'
    });
    
    if (hasPrice && productName) {
      // Если есть цены - сразу добавляем в основную базу
      console.log('✅ Товар с ценой -> сохраняем в базу products');
      const existing = await getProductByBarcode(product.barcode);
      
      await insertProduct({
        barcode: product.barcode,
        name: productName,
        category: productCategory,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        quantity: productQuantity,
        unit: 'шт',
        expiry_date: product.expiry_date,
        created_by: product.scanned_by
      });
      
      return {
        success: true,
        addedToQueue: false,
        message: existing ? 'Количество товара обновлено' : `Товар "${productName}" добавлен в базу`
      };
    } else {
      // Без цен - в очередь для дозаполнения
      console.log('📋 Товар без цены -> добавляем в очередь pending_products');
      await createPendingProduct({
        barcode: product.barcode,
        name: productName,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        quantity: productQuantity,
        category: productCategory,
        expiry_date: product.expiry_date,
        front_photo: product.front_photo_url,
        barcode_photo: product.barcode_photo_url,
        image_url: product.front_photo_url,
        added_by: product.scanned_by
      });
      
      return {
        success: true,
        addedToQueue: true,
        message: 'Товар добавлен в очередь для заполнения цен'
      };
    }
  } catch (error) {
    console.error('❌ Ошибка добавления товара:', error);
    return {
      success: false,
      addedToQueue: false,
      message: 'Ошибка сохранения товара'
    };
  }
}

// Полный процесс сканирования: загрузка фото + сохранение данных
export async function processScannedProduct(
  barcode: string,
  frontPhotoBase64: string | null,
  barcodePhotoBase64: string | null,
  productData: {
    name?: string;
    category?: string;
    purchase_price?: number;
    sale_price?: number;
    quantity?: number;
    expiry_date?: string;
  },
  scannedBy: string
): Promise<{ success: boolean; addedToQueue: boolean; message: string }> {
  try {
    let frontPhotoUrl: string | undefined;
    let barcodePhotoUrl: string | undefined;
    
    // Загружаем фото параллельно
    const uploadPromises: Promise<void>[] = [];
    
    if (frontPhotoBase64) {
      uploadPromises.push(
        uploadProductPhoto(barcode, frontPhotoBase64, 'front').then(url => {
          frontPhotoUrl = url || undefined;
        })
      );
    }
    
    if (barcodePhotoBase64) {
      uploadPromises.push(
        uploadProductPhoto(barcode, barcodePhotoBase64, 'barcode').then(url => {
          barcodePhotoUrl = url || undefined;
        })
      );
    }
    
    await Promise.all(uploadPromises);
    
    // Добавляем товар
    return await addScannedProduct({
      barcode,
      name: productData.name,
      category: productData.category,
      purchase_price: productData.purchase_price,
      sale_price: productData.sale_price,
      quantity: productData.quantity || 1,
      expiry_date: productData.expiry_date,
      front_photo_url: frontPhotoUrl,
      barcode_photo_url: barcodePhotoUrl,
      scanned_by: scannedBy
    });
  } catch (error) {
    console.error('❌ Ошибка обработки сканирования:', error);
    return {
      success: false,
      addedToQueue: false,
      message: 'Ошибка обработки'
    };
  }
}
