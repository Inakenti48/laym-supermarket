// Сохранение товара с автоматической генерацией и печатью штрих-кодов при дублировании

import { findProductByBarcode, saveProduct, StoredProduct } from './storage';
import { generateMultipleBarcodes } from './barcodeGenerator';
import { printBarcodesWiFi, loadWiFiPrinterConfig } from './wifiPrinter';
import { toast } from 'sonner';

export interface SaveProductWithBarcodeResult {
  success: boolean;
  generatedBarcodes?: string[];
  isDuplicate: boolean;
  productId?: string;
  error?: string;
}

/**
 * Сохраняет товар с проверкой дублирования штрих-кода.
 * При дублировании генерирует новые уникальные штрих-коды и печатает их.
 */
export const saveProductWithBarcodeGeneration = async (
  product: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'>,
  userId: string,
  printBarcodes: boolean = true
): Promise<SaveProductWithBarcodeResult> => {
  try {
    // 1. Проверяем, существует ли товар с таким штрих-кодом
    const existingProduct = await findProductByBarcode(product.barcode);
    
    if (existingProduct) {
      // 2. Товар с таким штрих-кодом уже существует - генерируем новые коды
      console.log('⚠️ Обнаружен дубликат штрих-кода:', product.barcode);
      
      const quantity = product.quantity || 1;
      const generatedBarcodes = generateMultipleBarcodes(quantity);
      
      console.log('✨ Сгенерировано новых штрих-кодов:', generatedBarcodes.length);
      
      // 3. Сохраняем товары с новыми штрих-кодами
      const savedProducts: StoredProduct[] = [];
      
      for (const newBarcode of generatedBarcodes) {
        const newProduct: Omit<StoredProduct, 'id' | 'lastUpdated' | 'priceHistory'> = {
          ...product,
          barcode: newBarcode,
          quantity: 1, // Каждый штрих-код = 1 шт
        };
        
        const savedProduct = await saveProduct(newProduct, userId);
        if (savedProduct) {
          savedProducts.push(savedProduct);
        }
      }
      
      // 4. Печатаем штрих-коды на принтере (если включено)
      if (printBarcodes && generatedBarcodes.length > 0) {
        const printerConfig = loadWiFiPrinterConfig();
        
        if (printerConfig) {
          try {
            await printBarcodesWiFi(
              generatedBarcodes,
              product.name,
              product.retailPrice
            );
            
            toast.success(
              `Сгенерировано и напечатано ${generatedBarcodes.length} новых штрих-кодов`,
              {
                description: `Оригинальный штрих-код ${product.barcode} уже существует в базе`,
              }
            );
          } catch (printError) {
            console.error('❌ Ошибка печати штрих-кодов:', printError);
            toast.warning(
              `Сгенерировано ${generatedBarcodes.length} новых штрих-кодов, но печать не удалась`,
              {
                description: 'Проверьте подключение к Wi-Fi принтеру',
              }
            );
          }
        } else {
          toast.info(
            `Сгенерировано ${generatedBarcodes.length} новых штрих-кодов`,
            {
              description: 'Wi-Fi принтер не настроен. Штрих-коды не напечатаны.',
            }
          );
        }
      }
      
      return {
        success: true,
        generatedBarcodes,
        isDuplicate: true,
        productId: savedProducts[0]?.id,
      };
    } else {
      // 5. Штрих-код уникален - сохраняем товар как обычно
      const savedProduct = await saveProduct(product, userId);
      
      if (!savedProduct) {
        return {
          success: false,
          isDuplicate: false,
          error: 'Не удалось сохранить товар',
        };
      }
      
      return {
        success: true,
        isDuplicate: false,
        productId: savedProduct.id,
      };
    }
  } catch (error) {
    console.error('❌ Ошибка сохранения товара:', error);
    return {
      success: false,
      isDuplicate: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
    };
  }
};

/**
 * Печатает дополнительные штрих-коды для существующего товара
 */
export const printAdditionalBarcodes = async (
  product: StoredProduct,
  additionalQuantity: number
): Promise<string[]> => {
  try {
    // Генерируем новые штрих-коды
    const newBarcodes = generateMultipleBarcodes(additionalQuantity);
    
    // Печатаем на принтере
    const printerConfig = loadWiFiPrinterConfig();
    if (!printerConfig) {
      throw new Error('Wi-Fi принтер не настроен');
    }
    
    await printBarcodesWiFi(newBarcodes, product.name, product.retailPrice);
    
    toast.success(`Напечатано ${additionalQuantity} дополнительных штрих-кодов`);
    
    return newBarcodes;
  } catch (error) {
    console.error('❌ Ошибка печати дополнительных штрих-кодов:', error);
    toast.error('Не удалось напечатать штрих-коды');
    throw error;
  }
};
