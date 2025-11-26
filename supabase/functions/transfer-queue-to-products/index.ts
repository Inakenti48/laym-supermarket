import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CSV_FILES = [
  '/data/products_part_1.csv',
  '/data/products_part_2.csv',
  '/data/products_part_3.csv',
  '/data/products_part_4.csv',
];

interface CSVProductPrice {
  barcode: string;
  purchase_price: number;
  sale_price: number;
}

let cachedProducts: CSVProductPrice[] | null = null;

const loadCSVPrices = async (): Promise<CSVProductPrice[]> => {
  if (cachedProducts) {
    return cachedProducts;
  }

  const allProducts: CSVProductPrice[] = [];
  const baseUrl = 'https://rfkfjfvlcushtejkgbmg.supabase.co';

  for (const file of CSV_FILES) {
    try {
      const response = await fetch(`${baseUrl}${file}`);
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim());

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(p => p.trim());
        if (parts.length < 7) continue;

        const barcode = parts[0];
        const purchasePrice = parseFloat(parts[4]) || 0;
        const salePrice = parseFloat(parts[5]) || 0;

        if (barcode) {
          allProducts.push({
            barcode,
            purchase_price: purchasePrice,
            sale_price: salePrice
          });
        }
      }
    } catch (error) {
      console.error(`❌ Error loading ${file}:`, error);
    }
  }

  cachedProducts = allProducts;
  console.log(`💾 Loaded ${allProducts.length} products from CSV`);
  return allProducts;
};

const findPricesByBarcode = async (barcode: string): Promise<CSVProductPrice | null> => {
  const products = await loadCSVPrices();
  return products.find(p => p.barcode === barcode) || null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🚀 Начало массового переноса товаров из очереди');

    // Загружаем CSV цены
    console.log('📊 Загрузка CSV базы данных...');
    await loadCSVPrices();

    // Получаем все товары из очереди
    const { data: queueItems, error: fetchError } = await supabase
      .from('vremenno_product_foto')
      .select('*')
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('❌ Ошибка загрузки очереди:', fetchError);
      throw fetchError;
    }

    if (!queueItems || queueItems.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Очередь пуста', 
          transferred: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📦 Найдено ${queueItems.length} товаров для переноса`);

    let transferred = 0;
    let skipped = 0;
    let pricesFound = 0;
    const skippedItems: any[] = [];

    for (const item of queueItems) {
      try {
        // Проверяем обязательные поля
        const hasBarcode = item.barcode && item.barcode.trim();
        const hasName = item.product_name && item.product_name.trim();
        
        if (!hasBarcode || !hasName) {
          const reason = 'Отсутствует штрихкод или название';
          console.log(`⚠️ Пропуск товара: ${reason}`);
          skipped++;
          skippedItems.push({ 
            barcode: item.barcode, 
            name: item.product_name, 
            reason 
          });
          continue;
        }

        // Ищем цены в CSV если их нет
        let purchasePrice = item.purchase_price;
        let retailPrice = item.retail_price;

        if (!purchasePrice || !retailPrice || purchasePrice === 0 || retailPrice === 0) {
          const csvPrices = await findPricesByBarcode(item.barcode);
          if (csvPrices && csvPrices.purchase_price > 0 && csvPrices.sale_price > 0) {
            purchasePrice = csvPrices.purchase_price;
            retailPrice = csvPrices.sale_price;
            pricesFound++;
            console.log(`💡 Цены найдены в CSV для ${item.barcode}: ${purchasePrice} / ${retailPrice}`);
          } else {
            // Если цен нет - оставляем товар в очереди
            const reason = 'Цены не найдены в CSV';
            console.log(`⚠️ Оставляем в очереди ${item.product_name}: ${reason}`);
            skipped++;
            skippedItems.push({ 
              barcode: item.barcode, 
              name: item.product_name, 
              reason 
            });
            continue;
          }
        }

        // Проверяем, существует ли товар с таким штрихкодом
        const { data: existing } = await supabase
          .from('products')
          .select('id, quantity, purchase_price, sale_price, category')
          .eq('barcode', item.barcode)
          .maybeSingle();

        if (existing) {
          // Обновляем количество существующего товара
          const newQuantity = existing.quantity + (item.quantity || 1);
          const updateData: any = {
            quantity: newQuantity,
            supplier: item.supplier,
            category: item.category || existing.category || 'Разное',
            updated_at: new Date().toISOString(),
          };

          // Обновляем цены только если они есть (не 0)
          if (purchasePrice > 0 || retailPrice > 0) {
            updateData.purchase_price = purchasePrice;
            updateData.sale_price = retailPrice;
          }

          const { error: updateError } = await supabase
            .from('products')
            .update(updateData)
            .eq('id', existing.id);

          if (updateError) {
            console.error(`❌ Ошибка обновления товара ${item.product_name}:`, updateError);
            skipped++;
            skippedItems.push({ 
              barcode: item.barcode, 
              name: item.product_name, 
              reason: updateError.message 
            });
            continue;
          }

          console.log(`✅ Товар ${item.product_name} обновлен (количество: ${newQuantity})`);
        } else {
          // Вставляем новый товар
          const { error: insertError } = await supabase
            .from('products')
            .insert({
              barcode: item.barcode,
              name: item.product_name,
              category: item.category || 'Разное',
              unit: item.unit || 'шт',
              purchase_price: purchasePrice,
              sale_price: retailPrice,
              quantity: item.quantity || 1,
              supplier: item.supplier,
              expiry_date: item.expiry_date,
              payment_type: item.payment_type || 'full',
              paid_amount: item.paid_amount || 0,
              debt_amount: item.debt_amount || 0,
              created_by: item.created_by,
            });

          if (insertError) {
            console.error(`❌ Ошибка вставки товара ${item.product_name}:`, insertError);
            skipped++;
            skippedItems.push({ 
              barcode: item.barcode, 
              name: item.product_name, 
              reason: insertError.message 
            });
            continue;
          }

          console.log(`✅ Товар ${item.product_name} добавлен`);
        }

        // Переносим фотографии
        const photos = [];
        if (item.front_photo) photos.push({ url: item.front_photo, path: item.front_photo_storage_path });
        if (item.barcode_photo) photos.push({ url: item.barcode_photo, path: item.barcode_photo_storage_path });
        if (item.image_url) photos.push({ url: item.image_url, path: item.storage_path });

        for (const photo of photos) {
          if (photo.url && photo.path) {
            await supabase
              .from('product_images')
              .insert({
                barcode: item.barcode,
                product_name: item.product_name,
                image_url: photo.url,
                storage_path: photo.path,
                created_by: item.created_by,
              });
          }
        }

        // Удаляем товар из очереди
        await supabase
          .from('vremenno_product_foto')
          .delete()
          .eq('id', item.id);

        transferred++;
      } catch (itemError: any) {
        console.error(`❌ Критическая ошибка обработки товара:`, itemError);
        skipped++;
        skippedItems.push({ 
          barcode: item.barcode, 
          name: item.product_name, 
          reason: itemError.message 
        });
      }
    }

    console.log(`🎉 Завершено: ${transferred} перенесено, ${skipped} пропущено, ${pricesFound} цен найдено в CSV`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Перенесено: ${transferred}, Пропущено: ${skipped}, Цен найдено в CSV: ${pricesFound}`,
        transferred,
        skipped,
        pricesFound,
        skippedItems: skippedItems.length > 0 ? skippedItems.slice(0, 10) : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Критическая ошибка:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
