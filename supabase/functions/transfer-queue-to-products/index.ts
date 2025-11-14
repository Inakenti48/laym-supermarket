import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    let failed = 0;
    const errors: any[] = [];

    for (const item of queueItems) {
      try {
        // Проверяем обязательные поля
        if (!item.barcode || !item.product_name || !item.category || 
            !item.purchase_price || !item.retail_price || !item.quantity) {
          console.log(`⚠️ Пропуск товара ${item.product_name}: не все обязательные поля заполнены`);
          failed++;
          errors.push({ 
            barcode: item.barcode, 
            name: item.product_name, 
            reason: 'Не заполнены обязательные поля' 
          });
          continue;
        }

        // Проверяем, существует ли товар с таким штрихкодом
        const { data: existing } = await supabase
          .from('products')
          .select('id, quantity')
          .eq('barcode', item.barcode)
          .maybeSingle();

        if (existing) {
          // Обновляем количество существующего товара
          const newQuantity = existing.quantity + item.quantity;
          const { error: updateError } = await supabase
            .from('products')
            .update({
              quantity: newQuantity,
              purchase_price: item.purchase_price,
              sale_price: item.retail_price,
              supplier: item.supplier,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updateError) {
            console.error(`❌ Ошибка обновления товара ${item.product_name}:`, updateError);
            failed++;
            errors.push({ 
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
              purchase_price: item.purchase_price,
              sale_price: item.retail_price,
              quantity: item.quantity,
              supplier: item.supplier,
              expiry_date: item.expiry_date,
              payment_type: item.payment_type || 'full',
              paid_amount: item.paid_amount || 0,
              debt_amount: item.debt_amount || 0,
              created_by: item.created_by,
            });

          if (insertError) {
            console.error(`❌ Ошибка вставки товара ${item.product_name}:`, insertError);
            failed++;
            errors.push({ 
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
            const { error: photoError } = await supabase
              .from('product_images')
              .insert({
                barcode: item.barcode,
                product_name: item.product_name,
                image_url: photo.url,
                storage_path: photo.path,
                created_by: item.created_by,
              });

            if (photoError) {
              console.error(`⚠️ Ошибка сохранения фото для ${item.product_name}:`, photoError);
            }
          }
        }

        // Удаляем товар из очереди
        const { error: deleteError } = await supabase
          .from('vremenno_product_foto')
          .delete()
          .eq('id', item.id);

        if (deleteError) {
          console.error(`⚠️ Ошибка удаления из очереди ${item.product_name}:`, deleteError);
        }

        // Логируем действие
        await supabase
          .from('system_logs')
          .insert({
            message: `Товар ${item.product_name} (${item.barcode}) перенесен из очереди`,
            user_id: item.created_by,
          });

        transferred++;
      } catch (itemError: any) {
        console.error(`❌ Критическая ошибка обработки товара:`, itemError);
        failed++;
        errors.push({ 
          barcode: item.barcode, 
          name: item.product_name, 
          reason: itemError.message 
        });
      }
    }

    console.log(`🎉 Завершено: ${transferred} успешно, ${failed} ошибок`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Перенесено: ${transferred}, Ошибки: ${failed}`,
        transferred,
        failed,
        errors: errors.length > 0 ? errors : undefined,
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
