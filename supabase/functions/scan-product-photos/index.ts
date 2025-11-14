import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { frontPhoto, barcodePhoto } = await req.json();
    
    console.log('=== SCAN PRODUCT PHOTOS START ===');
    console.log('Front photo:', frontPhoto ? 'Yes' : 'No');
    console.log('Barcode photo:', barcodePhoto ? 'Yes' : 'No');

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

    let barcode = '';
    let productName = '';
    let category = '';

    // Объединенное распознавание штрихкода и названия за один запрос
    console.log('📷 Распознавание товара...');
    
    const messages: any[] = [
      { 
        role: 'system', 
        content: `Ты эксперт по распознаванию товаров и штрихкодов.

ЗАДАЧА: Извлечь штрихкод, полное название товара и категорию с упаковки.

ШТРИХКОД:
- Найди и прочитай штрихкод (EAN-13, EAN-8, UPC-A, Code-128)
- Верни только цифры, без пробелов
- Если штрихкод нечитаем - верни пустую строку

НАЗВАНИЕ:
- Прочитай ВСЕ надписи на упаковке
- Включи: бренд, название продукта, вариант/вкус, объем/вес
- Название должно быть максимально подробным
- Если текст нечитаем - верни пустую строку

КАТЕГОРИЯ:
- Определи категорию товара на основе его названия и внешнего вида
- Используй одну из категорий: Продукты питания, Напитки, Бытовая химия, Косметика, Детские товары, Одежда, Электроника, Другое
- Выбирай наиболее подходящую категорию

ВАЖНО: Будь точным, не выдумывай данные.` 
      }
    ];

    const userContent: any[] = [
      { type: 'text', text: 'Распознай штрихкод и название товара. Верни точные данные.' }
    ];

    if (frontPhoto) {
      userContent.push({ type: 'image_url', image_url: { url: frontPhoto } });
    }
    if (barcodePhoto) {
      userContent.push({ type: 'image_url', image_url: { url: barcodePhoto } });
    }

    messages.push({ role: 'user', content: userContent });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro', // Более мощная модель для точности
        messages,
        tools: [{
          type: "function",
          function: {
            name: "extract_product_data",
            description: "Извлекает штрихкод, название товара и категорию",
            parameters: {
              type: "object",
              properties: {
                barcode: { 
                  type: "string", 
                  description: "Штрихкод (только цифры) или пустая строка" 
                },
                name: { 
                  type: "string", 
                  description: "Полное название товара или пустая строка" 
                },
                category: {
                  type: "string",
                  description: "Категория товара: Продукты питания, Напитки, Бытовая химия, Косметика, Детские товары, Одежда, Электроника, Другое"
                }
              },
              required: ["barcode", "name", "category"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_product_data" } }
      }),
    });

    if (response.ok) {
      const data = await response.json();
      try {
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        if (toolCall?.function?.arguments) {
          console.log('🔍 Raw arguments:', toolCall.function.arguments);
          
          let parsed;
          try {
            parsed = JSON.parse(toolCall.function.arguments);
          } catch (jsonError) {
            console.log('⚠️ Invalid JSON, trying string extraction');
            const argStr = String(toolCall.function.arguments);
            
            // Извлекаем штрихкод
            const barcodeMatch = argStr.match(/barcode["']?\s*:\s*["']?(\d+)/);
            // Извлекаем название
            const nameMatch = argStr.match(/name["']?\s*:\s*["']([^"']+)["']/);
            // Извлекаем категорию
            const categoryMatch = argStr.match(/category["']?\s*:\s*["']([^"']+)["']/);
            
            parsed = {
              barcode: barcodeMatch ? barcodeMatch[1] : '',
              name: nameMatch ? nameMatch[1] : '',
              category: categoryMatch ? categoryMatch[1] : ''
            };
          }
          
          if (parsed) {
            barcode = (parsed.barcode || '').trim();
            productName = (parsed.name || '').trim();
            category = (parsed.category || '').trim();
            console.log('✅ Распознано:', { barcode, productName, category });
          }
        }
        
        // Fallback: пробуем получить из текста ответа
        if (!barcode || !productName) {
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            console.log('🔄 Fallback: извлекаем из текста');
            if (!barcode) {
              const digits = content.match(/\d{8,13}/);
              if (digits) {
                barcode = digits[0];
                console.log('✅ Штрихкод из текста:', barcode);
              }
            }
          }
        }
      } catch (e) {
        console.error('Ошибка парсинга:', e);
      }
    } else {
      console.error('Ошибка API:', response.status);
    }

    console.log('=== РЕЗУЛЬТАТ СКАНИРОВАНИЯ ===');
    console.log('Штрихкод:', barcode || 'не распознан');
    console.log('Название:', productName || 'не распознано');
    console.log('Категория:', category || 'не определена');

    return new Response(
      JSON.stringify({
        success: true,
        barcode,
        name: productName,
        category
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scan-product-photos:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        barcode: '',
        name: ''
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
