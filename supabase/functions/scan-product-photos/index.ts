import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { frontPhoto, barcodePhoto, autoSave, deviceId, userName } = await req.json();
    
    console.log('=== FAST SCAN START ===');
    console.log('Device:', deviceId || 'unknown');

    if (!frontPhoto && !barcodePhoto) {
      return new Response(
        JSON.stringify({ error: 'At least one photo is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Инициализируем Supabase для автосохранения
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Загружаем существующие товары для проверки цен
    let pricesMap = new Map<string, any>();
    try {
      console.log('📊 Загрузка справочника цен...');
      const { data: existingProducts, error: loadError } = await supabase
        .from('products')
        .select('barcode, name, category, purchase_price, sale_price')
        .not('barcode', 'is', null)
        .gt('sale_price', 0)
        .limit(10000);

      if (loadError) {
        console.error('Error loading prices:', loadError);
      } else if (existingProducts) {
        for (const p of existingProducts) {
          if (p.barcode) {
            pricesMap.set(p.barcode, {
              name: p.name,
              category: p.category || '',
              purchasePrice: p.purchase_price || 0,
              salePrice: p.sale_price || 0
            });
          }
        }
      }
      console.log(`📊 Справочник цен: ${pricesMap.size} товаров`);
    } catch (e) {
      console.error('Exception loading prices:', e);
    }

    // ИСПОЛЬЗУЕМ БЫСТРУЮ МОДЕЛЬ для распознавания
    const userContent: any[] = [
      { type: 'text', text: 'Быстро распознай: 1) Штрихкод (цифры), 2) Название товара, 3) Категорию' }
    ];

    if (frontPhoto) {
      userContent.push({ type: 'image_url', image_url: { url: frontPhoto } });
    }
    if (barcodePhoto) {
      userContent.push({ type: 'image_url', image_url: { url: barcodePhoto } });
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite', // САМАЯ БЫСТРАЯ модель!
        messages: [
          { 
            role: 'system', 
            content: `Быстрое распознавание товаров. Извлеки:
- ШТРИХКОД: цифры EAN-13/EAN-8 или внутренний код
- НАЗВАНИЕ: бренд + продукт + вес/объём
- КАТЕГОРИЯ: еда/напитки/химия/косметика/другое
Отвечай точно и быстро.`
          },
          { role: 'user', content: userContent }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_product",
            description: "Извлекает данные товара",
            parameters: {
              type: "object",
              properties: {
                barcode: { type: "string", description: "Штрихкод (только цифры)" },
                name: { type: "string", description: "Название товара" },
                category: { type: "string", description: "Категория" }
              },
              required: ["barcode", "name", "category"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_product" } },
        temperature: 0.1,
        max_tokens: 200
      }),
    });

    let barcode = '';
    let productName = '';
    let category = '';

    if (response.ok) {
      const data = await response.json();
      try {
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          const parsed = JSON.parse(toolCall.function.arguments);
          barcode = (parsed.barcode || '').replace(/\D/g, ''); // Только цифры
          productName = (parsed.name || '').trim();
          category = (parsed.category || '').trim();
        }
      } catch (e) {
        console.error('Parse error:', e);
      }
    } else {
      const status = response.status;
      console.error('AI API error:', status);
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: 'rate_limit', barcode: '', name: '', category: '' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const aiTime = Date.now() - startTime;
    console.log(`⚡ AI за ${aiTime}ms: ${barcode} - ${productName}`);

    // Проверяем цену в справочнике
    let priceInfo = barcode ? pricesMap.get(barcode) : null;
    
    // Поиск по частичному совпадению если точного нет
    if (!priceInfo && barcode && barcode.length >= 4) {
      const last4 = barcode.slice(-4);
      for (const [key, value] of pricesMap) {
        if (key.endsWith(last4)) {
          priceInfo = value;
          console.log(`✅ Найдено по последним 4 цифрам: ${key}`);
          break;
        }
      }
    }

    let savedTo = '';
    let productId = '';
    let saveError = '';

    // Автосохранение если включено
    if (autoSave !== false) {
      try {
        if (priceInfo && priceInfo.salePrice > 0) {
          // ЦЕНА НАЙДЕНА → Сохраняем в products
          console.log(`✅ Цена найдена: ${priceInfo.salePrice}₽`);
          
          const { data: existing, error: existingError } = await supabase
            .from('products')
            .select('id, quantity')
            .eq('barcode', barcode)
            .maybeSingle();

          if (existingError) {
            console.error('Error checking existing product:', existingError);
            saveError = existingError.message;
          } else if (existing) {
            // Увеличиваем количество
            const { error: updateError } = await supabase
              .from('products')
              .update({ quantity: (existing.quantity || 0) + 1 })
              .eq('id', existing.id);
            
            if (updateError) {
              console.error('Error updating product:', updateError);
              saveError = updateError.message;
            } else {
              productId = existing.id;
              savedTo = 'products_updated';
              console.log(`📝 Товар обновлен: ${productId}`);
            }
          } else {
            const { data: newProduct, error: insertError } = await supabase
              .from('products')
              .insert([{
                barcode,
                name: priceInfo.name || productName,
                category: priceInfo.category || category,
                purchase_price: priceInfo.purchasePrice,
                sale_price: priceInfo.salePrice,
                quantity: 1,
                unit: 'шт',
                created_by: userName || deviceId
              }])
              .select('id')
              .single();

            if (insertError) {
              console.error('Error inserting product:', insertError);
              saveError = insertError.message;
            } else {
              productId = newProduct?.id || '';
              savedTo = 'products';
              console.log(`✅ Новый товар создан: ${productId}`);
            }
          }
        } else {
          // ЦЕНА НЕ НАЙДЕНА → В очередь
          console.log(`⏳ Цена не найдена, добавляем в очередь`);
          
          const effectiveBarcode = barcode || `auto-${Date.now()}`;
          const effectiveName = productName || 'Неизвестный товар';
          
          // Проверяем существование в очереди
          const { data: existingQueue, error: queueCheckError } = await supabase
            .from('vremenno_product_foto')
            .select('id')
            .eq('barcode', effectiveBarcode)
            .maybeSingle();

          if (queueCheckError) {
            console.error('Error checking queue:', queueCheckError);
            saveError = queueCheckError.message;
          } else if (existingQueue) {
            savedTo = 'queue_exists';
            productId = existingQueue.id;
            console.log(`⚠️ Уже в очереди: ${productId}`);
          } else {
            const { data: newQueue, error: queueInsertError } = await supabase
              .from('vremenno_product_foto')
              .insert([{
                barcode: effectiveBarcode,
                product_name: effectiveName,
                category,
                front_photo: frontPhoto || '',
                barcode_photo: barcodePhoto || '',
                quantity: 1,
                created_by: userName || deviceId
              }])
              .select('id')
              .single();

            if (queueInsertError) {
              console.error('Error inserting to queue:', queueInsertError);
              saveError = queueInsertError.message;
            } else {
              productId = newQueue?.id || '';
              savedTo = 'queue';
              console.log(`📋 Добавлено в очередь: ${productId}`);
            }
          }
        }
      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        saveError = dbError instanceof Error ? dbError.message : 'Database error';
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`=== DONE in ${totalTime}ms, saved to: ${savedTo}, error: ${saveError || 'none'} ===`);

    return new Response(
      JSON.stringify({
        success: !saveError,
        barcode,
        name: productName,
        category,
        hasPrice: !!priceInfo,
        price: priceInfo?.salePrice || 0,
        savedTo,
        productId,
        processingTime: totalTime,
        error: saveError || undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        barcode: '',
        name: '',
        category: ''
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
