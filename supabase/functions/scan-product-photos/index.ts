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

    // Распознаем штрихкод из фотографии штрихкода
    if (barcodePhoto) {
      console.log('📷 Распознавание штрихкода...');
      const barcodeResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { 
              role: 'system', 
              content: `Ты эксперт по распознаванию штрихкодов.

ИНСТРУКЦИИ:
1. Найди и прочитай штрихкод на изображении (EAN-13, EAN-8, UPC-A и другие форматы)
2. Штрихкод - это последовательность цифр (обычно 8 или 13 цифр)
3. Верни ТОЛЬКО цифры штрихкода, без пробелов и других символов

ВАЖНО:
- Если штрихкод нечитаем - верни пустую строку
- Не добавляй никаких пояснений, только цифры` 
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Какой штрихкод на изображении? Верни только цифры.' },
                { type: 'image_url', image_url: { url: barcodePhoto } }
              ]
            }
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_barcode",
              description: "Извлекает штрихкод из изображения",
              parameters: {
                type: "object",
                properties: {
                  barcode: { 
                    type: "string", 
                    description: "Штрихкод (только цифры) или пустая строка" 
                  }
                },
                required: ["barcode"],
                additionalProperties: false
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "extract_barcode" } }
        }),
      });

      if (barcodeResponse.ok) {
        const barcodeData = await barcodeResponse.json();
        try {
          const toolCall = barcodeData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            console.log('🔍 Raw arguments:', toolCall.function.arguments);
            
            // Пробуем парсить как JSON
            let parsed;
            try {
              parsed = JSON.parse(toolCall.function.arguments);
            } catch (jsonError) {
              // Если JSON невалидный, пробуем извлечь данные из строки
              console.log('⚠️ Invalid JSON, trying string extraction');
              const argStr = String(toolCall.function.arguments);
              const barcodeMatch = argStr.match(/barcode["']?\s*:\s*["']?(\d+)/);
              if (barcodeMatch) {
                parsed = { barcode: barcodeMatch[1] };
              }
            }
            
            if (parsed) {
              barcode = (parsed.barcode || '').trim();
              console.log('✅ Штрихкод распознан:', barcode);
            }
          }
          
          // Fallback: пробуем получить из текста ответа
          if (!barcode) {
            const content = barcodeData.choices?.[0]?.message?.content;
            if (content) {
              console.log('🔄 Fallback: извлекаем из текста');
              const digits = content.match(/\d{8,13}/);
              if (digits) {
                barcode = digits[0];
                console.log('✅ Штрихкод из текста:', barcode);
              }
            }
          }
        } catch (e) {
          console.error('Ошибка парсинга штрихкода:', e);
        }
      } else {
        console.error('Ошибка API при распознавании штрихкода:', barcodeResponse.status);
      }
    }

    // Распознаем название товара из лицевой фотографии
    if (frontPhoto) {
      console.log('📷 Распознавание названия товара...');
      const nameResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-lite',
          messages: [
            { 
              role: 'system', 
              content: `Ты эксперт по распознаванию товаров.

ИНСТРУКЦИИ:
1. Прочитай ВЕСЬ текст на упаковке товара
2. Определи ПОЛНОЕ название товара включая:
   - Бренд/производитель
   - Название продукта
   - Вариант/вкус (если есть)
   - Объем/вес (если виден)
3. Название должно быть максимально подробным и точным

ВАЖНО:
- Если упаковка нечитаема или текста нет - верни пустую строку
- Не сокращай название, пиши полностью
- Включай все важные детали с упаковки` 
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Какое название товара на упаковке? Верни полное название.' },
                { type: 'image_url', image_url: { url: frontPhoto } }
              ]
            }
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_product_name",
              description: "Извлекает название товара из упаковки",
              parameters: {
                type: "object",
                properties: {
                  name: { 
                    type: "string", 
                    description: "Полное название товара или пустая строка" 
                  }
                },
                required: ["name"],
                additionalProperties: false
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "extract_product_name" } }
        }),
      });

      if (nameResponse.ok) {
        const nameData = await nameResponse.json();
        try {
          const toolCall = nameData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            console.log('🔍 Raw arguments:', toolCall.function.arguments);
            
            // Пробуем парсить как JSON
            let parsed;
            try {
              parsed = JSON.parse(toolCall.function.arguments);
            } catch (jsonError) {
              // Если JSON невалидный, пробуем извлечь данные из строки
              console.log('⚠️ Invalid JSON, trying string extraction');
              const argStr = String(toolCall.function.arguments);
              // Ищем значение после "name"
              const nameMatch = argStr.match(/name["']?\s*:\s*["']([^"']+)["']/);
              if (nameMatch) {
                parsed = { name: nameMatch[1] };
              }
            }
            
            if (parsed) {
              productName = (parsed.name || '').trim();
              console.log('✅ Название распознано:', productName);
            }
          }
          
          // Fallback: пробуем получить из текста ответа
          if (!productName) {
            const content = nameData.choices?.[0]?.message?.content;
            if (content && content.length > 0 && content.length < 500) {
              console.log('🔄 Fallback: используем текст ответа');
              productName = content.trim();
              console.log('✅ Название из текста:', productName);
            }
          }
        } catch (e) {
          console.error('Ошибка парсинга названия:', e);
        }
      } else {
        console.error('Ошибка API при распознавании названия:', nameResponse.status);
      }
    }

    console.log('=== РЕЗУЛЬТАТ СКАНИРОВАНИЯ ===');
    console.log('Штрихкод:', barcode || 'не распознан');
    console.log('Название:', productName || 'не распознано');

    return new Response(
      JSON.stringify({
        success: true,
        barcode,
        name: productName
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
