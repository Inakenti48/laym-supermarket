import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CSV данные кэшируются в памяти
let csvPricesCache: Map<string, { name: string; category: string; purchasePrice: number; salePrice: number }> | null = null;

// Загрузка цен из CSV (через Supabase Storage или прямой fetch)
async function loadCSVPrices(supabase: any): Promise<Map<string, any>> {
  if (csvPricesCache) {
    return csvPricesCache;
  }

  csvPricesCache = new Map();
  
  try {
    // Загружаем price_reference.csv из публичной папки
    const baseUrl = Deno.env.get('SUPABASE_URL')?.replace('//', '//') || '';
    const csvUrls = [
      `${baseUrl}/storage/v1/object/public/csv-data/price_reference.csv`,
    ];

    // Также пробуем загрузить из products таблицы как fallback
    const { data: existingProducts } = await supabase
      .from('products')
      .select('barcode, name, category, purchase_price, sale_price')
      .not('barcode', 'is', null);

    if (existingProducts) {
      for (const p of existingProducts) {
        if (p.barcode && p.sale_price > 0) {
          csvPricesCache.set(p.barcode, {
            name: p.name,
            category: p.category || '',
            purchasePrice: p.purchase_price || 0,
            salePrice: p.sale_price || 0
          });
        }
      }
      console.log(`📦 Загружено ${csvPricesCache.size} товаров из базы products`);
    }

  } catch (error) {
    console.error('Error loading CSV prices:', error);
  }

  return csvPricesCache;
}

// Поиск цены по штрихкоду
function findPriceByBarcode(barcode: string, pricesMap: Map<string, any>): any | null {
  if (!barcode) return null;
  
  const normalized = barcode.trim();
  
  // Точное совпадение
  if (pricesMap.has(normalized)) {
    return pricesMap.get(normalized);
  }
  
  // Поиск по последним 4+ цифрам
  if (normalized.length >= 4) {
    const last4 = normalized.slice(-4);
    for (const [key, value] of pricesMap) {
      if (key.endsWith(last4)) {
        return value;
      }
    }
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { frontPhoto, barcodePhoto, deviceId, userName } = await req.json();
    
    console.log('=== FAST SCAN START ===');
    console.log('Device:', deviceId);
    console.log('User:', userName);
    
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Загружаем справочник цен
    const pricesMap = await loadCSVPrices(supabase);
    console.log(`📊 Справочник цен: ${pricesMap.size} записей`);

    // Используем САМУЮ БЫСТРУЮ модель для распознавания
    const primaryImage = frontPhoto || barcodePhoto;
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
            content: `Ты быстрая система распознавания товаров. Извлеки:
1. ШТРИХКОД - цифры под полосками (EAN-13, EAN-8, или внутренний код)
2. НАЗВАНИЕ товара (бренд + продукт + вес/объём)
3. КАТЕГОРИЯ (еда, напитки, бытовая химия, и т.д.)

Отвечай БЫСТРО и ТОЧНО. Если штрихкод не виден - верни пустую строку.`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Распознай товар. Извлеки штрихкод, название и категорию.' },
              { type: 'image_url', image_url: { url: primaryImage } },
              ...(barcodePhoto && barcodePhoto !== primaryImage ? [{ type: 'image_url', image_url: { url: barcodePhoto } }] : [])
            ]
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_product",
            description: "Извлекает информацию о товаре с фото",
            parameters: {
              type: "object",
              properties: {
                barcode: { type: "string", description: "Штрихкод товара (только цифры)" },
                name: { type: "string", description: "Название товара" },
                category: { type: "string", description: "Категория товара" }
              },
              required: ["barcode", "name", "category"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_product" } },
        temperature: 0.1, // Низкая температура для точности
        max_tokens: 200   // Ограничиваем для скорости
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'rate_limit' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiTime = Date.now() - startTime;
    console.log(`⚡ AI распознавание за ${aiTime}ms`);

    // Парсим результат
    let barcode = '';
    let name = 'Неизвестный товар';
    let category = '';

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        barcode = (parsed.barcode || '').replace(/\D/g, ''); // Только цифры
        name = parsed.name || 'Неизвестный товар';
        category = parsed.category || '';
      }
    } catch (e) {
      console.error('Parse error:', e);
    }

    console.log(`📦 Распознано: ${barcode} - ${name} (${category})`);

    // Проверяем цену в справочнике
    const priceInfo = barcode ? findPriceByBarcode(barcode, pricesMap) : null;
    
    let savedTo = '';
    let productId = '';

    if (priceInfo && priceInfo.salePrice > 0) {
      // ЦЕНА НАЙДЕНА → Сохраняем в products
      console.log(`✅ Цена найдена: ${priceInfo.salePrice}₽`);
      
      // Проверяем дубликат
      const { data: existing } = await supabase
        .from('products')
        .select('id')
        .eq('barcode', barcode)
        .maybeSingle();

      if (existing) {
        // Обновляем количество
        await supabase
          .from('products')
          .update({ quantity: supabase.rpc('increment_quantity', { row_id: existing.id }) })
          .eq('id', existing.id);
        
        productId = existing.id;
        savedTo = 'products_updated';
        console.log(`📝 Товар обновлен в products`);
      } else {
        // Создаем новый
        const { data: newProduct, error: insertError } = await supabase
          .from('products')
          .insert([{
            barcode,
            name: priceInfo.name || name,
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
          console.error('Insert to products error:', insertError);
        } else {
          productId = newProduct?.id || '';
          savedTo = 'products';
          console.log(`✅ Товар добавлен в products с ценой`);
        }
      }
    } else {
      // ЦЕНА НЕ НАЙДЕНА → Сохраняем в очередь
      console.log(`⏳ Цена не найдена, добавляем в очередь`);
      
      // Проверяем дубликат в очереди
      const { data: existingQueue } = await supabase
        .from('vremenno_product_foto')
        .select('id')
        .or(`barcode.eq.${barcode || 'NONE'},product_name.ilike.${name}`)
        .maybeSingle();

      if (existingQueue) {
        savedTo = 'queue_exists';
        productId = existingQueue.id;
        console.log(`⚠️ Уже в очереди`);
      } else {
        const { data: newQueue, error: queueError } = await supabase
          .from('vremenno_product_foto')
          .insert([{
            barcode: barcode || `auto-${Date.now()}`,
            product_name: name,
            category,
            front_photo: frontPhoto || '',
            barcode_photo: barcodePhoto || '',
            quantity: 1,
            created_by: userName || deviceId
          }])
          .select('id')
          .single();

        if (queueError) {
          console.error('Insert to queue error:', queueError);
        } else {
          productId = newQueue?.id || '';
          savedTo = 'queue';
          console.log(`📋 Товар добавлен в очередь`);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`=== FAST SCAN DONE in ${totalTime}ms ===`);

    return new Response(
      JSON.stringify({
        success: true,
        barcode,
        name,
        category,
        hasPrice: !!priceInfo,
        price: priceInfo?.salePrice || 0,
        purchasePrice: priceInfo?.purchasePrice || 0,
        savedTo,
        productId,
        processingTime: totalTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Fast scan error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
