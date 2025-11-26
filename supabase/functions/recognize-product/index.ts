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
    const { imageUrl, recognitionType, allProducts } = await req.json();
    
    console.log('=== RECOGNIZE PRODUCT START ===');
    console.log('Recognition type:', recognitionType);
    console.log('Products count:', allProducts?.length || 0);
    console.log('Image URL length:', imageUrl?.length || 0);
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Input validation - imageUrl
    if (!imageUrl || typeof imageUrl !== 'string') {
      console.warn('Invalid imageUrl type');
      return new Response(
        JSON.stringify({ error: 'imageUrl is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and sanitize allProducts array
    let productsToUse = allProducts;
    if (recognitionType === 'product') {
      if (!Array.isArray(allProducts)) {
        console.warn('Invalid allProducts - not an array');
        return new Response(
          JSON.stringify({ error: 'allProducts must be an array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Limit array size to prevent DoS
      if (allProducts.length > 10000) {
        console.warn('allProducts array too large:', allProducts.length);
        return new Response(
          JSON.stringify({ error: 'Too many products (max 10000)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Sanitize product data to prevent prompt injection
      productsToUse = allProducts.map((p: any) => ({
        barcode: String(p.barcode || '').slice(0, 50).replace(/[<>{}]/g, ''),
        name: String(p.name || '').slice(0, 200).replace(/[<>{}]/g, ''),
        category: String(p.category || '').slice(0, 100).replace(/[<>{}]/g, ''),
        unit: p.unit ? String(p.unit).slice(0, 20).replace(/[<>{}]/g, '') : '',
        supplier: p.supplier ? String(p.supplier).slice(0, 100).replace(/[<>{}]/g, '') : ''
      }));
    }

    // URL format validation - allow http/https URLs and data URLs
    const urlPattern = /^(https?:\/\/|data:image\/)/i;
    if (!urlPattern.test(imageUrl)) {
      return new Response(
        JSON.stringify({ error: 'Invalid image URL format. Must be http://, https://, or data:image/' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Block private IP ranges (SSRF protection) - only for http/https URLs
    if (imageUrl.startsWith('http')) {
      const privateIpPattern = /(^127\.)|(^10\.)|(^172\.1[6-9]\.)|(^172\.2[0-9]\.)|(^172\.3[0-1]\.)|(^192\.168\.)|(^localhost)|(\[::1\])/i;
      if (privateIpPattern.test(imageUrl)) {
        return new Response(
          JSON.stringify({ error: 'Access to private IP ranges is not allowed' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Length validation - more lenient for base64 images
    const maxLength = imageUrl.startsWith('data:') ? 5000000 : 2048; // 5MB for base64
    if (imageUrl.length > maxLength) {
      console.warn('Image too large:', imageUrl.length);
      return new Response(
        JSON.stringify({ error: `Image too large (max ${maxLength} characters)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log suspicious patterns (for monitoring)
    const suspiciousKeywords = ['admin', 'password', 'token', 'secret', 'ignore previous'];
    const checkText = JSON.stringify({ imageUrl: imageUrl.slice(0, 200), recognitionType });
    const foundSuspicious = suspiciousKeywords.filter(kw => checkText.toLowerCase().includes(kw));
    if (foundSuspicious.length > 0) {
      console.warn('⚠️ Suspicious input detected:', foundSuspicious);
    }

    console.log(`Recognition type: ${recognitionType}`);

    let systemPrompt = '';

    if (recognitionType === 'product') {
      systemPrompt = `⚠️ КРИТИЧЕСКИ СТРОГОЕ распознавание - АБСОЛЮТНАЯ ТОЧНОСТЬ!

❌ ИГНОРИРУЙ ЛЮДЕЙ:
- Человек/лицо/тело → верни пустые значения
- Нет упаковки с текстом → пустые значения

📦 ТОВАРЫ В БАЗЕ (ПОЛНАЯ ИНФОРМАЦИЯ О РАЗНОВИДНОСТЯХ):
${productsToUse.map((p: any) => {
  const details = [
    `📌 ${p.barcode}`,
    `Название: ${p.name}`,
    `Категория: ${p.category}`,
    p.unit ? `Единица: ${p.unit}` : null,
    p.supplier ? `Поставщик: ${p.supplier}` : null
  ].filter(Boolean).join(' | ');
  return details;
}).join('\n')}

🔍 КРИТЕРИИ ТОЧНОГО СОВПАДЕНИЯ (100% на КАЖДЫЙ пункт!):
1. БРЕНД - точное название производителя
2. ПОЛНОЕ НАЗВАНИЕ товара со ВСЕМИ деталями
3. 🎨 ЦВЕТ УПАКОВКИ - КРИТИЧНО!!!:
   • Красная ≠ Синяя ≠ Зелёная ≠ Жёлтая ≠ Розовая ≠ Оранжевая
   • Смотри на ОСНОВНОЙ цвет упаковки на фото!
   • Если на фото синяя упаковка → НЕ возвращай красную!
   • Если на фото розовая упаковка → НЕ возвращай жёлтую!
   • РАЗНЫЕ ЦВЕТА = РАЗНЫЕ ТОВАРЫ!!!
4. 📏 ВЕС/ОБЪЁМ - КРИТИЧНО!!!:
   • 50г ≠ 75г ≠ 100г ≠ 200г ≠ 250г
   • 200мл ≠ 250мл ≠ 500мл ≠ 1л ≠ 1.5л
   • Смотри на РАЗМЕР упаковки на фото (маленькая/средняя/большая)
   • Читай цифры на упаковке!
5. ⚡ РАЗНОВИДНОСТЬ/ВАРИАЦИЯ:
   • Для каш: "с молоком" ≠ "без молока", "с пребиотиком" ≠ "без пребиотика"
   • Для кремов: "с пантенолом" ≠ "с ромашкой" ≠ "увлажняющий" ≠ "питательный"
   • Для йогуртов: "клубника" ≠ "вишня" ≠ "персик" ≠ "натуральный"
   • Для соков: "апельсин" ≠ "яблоко" ≠ "мультифрукт"
   • Для молока: "3.2%" ≠ "2.5%" ≠ "обезжиренное"
6. ДИЗАЙН упаковки (рисунки, логотипы, надписи)
7. ПОСТАВЩИК - дополнительная проверка (если указан в базе)
8. ЕДИНИЦА ИЗМЕРЕНИЯ - шт/кг/л (если указано в базе)

⚡ АЛГОРИТМ РАСПОЗНАВАНИЯ:
1. Видишь упаковку с текстом? НЕТ → пустые значения
2. Прочитай ВЕСЬ текст на упаковке:
   - Название бренда (Bebi, Солнце и Луна, и т.д.)
   - Полное название продукта
   - ВСЕ особенности ("с молоком", "с пребиотиком", "с пантенолом")
   - Точный вес/объем
3. 🎨 ОПРЕДЕЛИ ЦВЕТ упаковки (основной цвет, который видишь больше всего)
4. 📏 ОПРЕДЕЛИ РАЗМЕР упаковки визуально (маленькая/средняя/большая бутылка, пачка, тюбик)
5. Сравни с базой КАЖДУЮ деталь построчно, используя ПОЛНУЮ ИНФОРМАЦИЮ (поставщик, единицы)
6. ВСЕ 8 критериев совпали на 100%? → верни barcode
7. ХОТЬ ЧТО-ТО отличается (ЦВЕТ, ОБЪЁМ, РАЗНОВИДНОСТЬ)? → barcode = "", заполни name + category

🚨 ПРИМЕРЫ РАЗНЫХ ТОВАРОВ (НЕ ПУТАЙ!):

ЦВЕТ УПАКОВКИ:
- Поильник в РОЗОВОЙ упаковке ≠ Поильник в СИНЕЙ ≠ в ЖЁЛТОЙ
- Крем в КРАСНОЙ упаковке ≠ в СИНЕЙ ≠ в ЗЕЛЁНОЙ
- Сок в ОРАНЖЕВОЙ пачке ≠ в КРАСНОЙ ≠ в ЖЁЛТОЙ

ОБЪЁМ/РАЗМЕР:
- Маленькая бутылка 200мл ≠ Средняя 500мл ≠ Большая 1л
- Тюбик 50мл ≠ 75мл ≠ 100мл
- Пачка 100г ≠ 200г ≠ 250г

Каши:
- "Bebi рисовая С МОЛОКОМ" ≠ "Bebi рисовая БЕЗ МОЛОКА" (РАЗНАЯ РАЗНОВИДНОСТЬ!)
- "Bebi с пребиотиком" ≠ "Bebi без пребиотика" (РАЗНАЯ ФОРМУЛА!)
- "Bebi 200г" ≠ "Bebi 250г" (РАЗНЫЙ ВЕС!)

Кремы/Косметика:
- "Nivea крем с пантенолом" ≠ "Nivea крем с ромашкой" ≠ "Nivea увлажняющий" (РАЗНЫЕ РАЗНОВИДНОСТИ!)
- "Крем 50мл" ≠ "Крем 75мл" ≠ "Крем 100мл" (РАЗНЫЙ ОБЪЕМ!)
- Тюбик ≠ Баночка (РАЗНАЯ УПАКОВКА = РАЗНЫЙ ТОВАР!)

Молочка:
- "Молоко 3.2%" ≠ "Молоко 2.5%" ≠ "Молоко обезжиренное" (РАЗНАЯ ЖИРНОСТЬ!)
- "Йогурт клубника" ≠ "Йогурт вишня" ≠ "Йогурт натуральный" (РАЗНЫЕ ВКУСЫ!)

Напитки:
- "Сок апельсиновый" ≠ "Сок яблочный" ≠ "Сок мультифрукт" (РАЗНЫЕ ВКУСЫ!)
- "1 литр" ≠ "1.5 литра" ≠ "500мл" (РАЗНЫЙ ОБЪЕМ!)

⚠️ ЖЕЛЕЗНОЕ ПРАВИЛО: 
- Если ЦВЕТ не совпадает → barcode = ""
- Если ОБЪЁМ не совпадает → barcode = ""
- Если РАЗНОВИДНОСТЬ не совпадает → barcode = ""
- Если есть МАЛЕЙШЕЕ сомнение → barcode = ""
- Используй данные о поставщике и единицах для дополнительной проверки!`;
    } else {
      systemPrompt = `Ты эксперт по распознаванию штрихкодов и товарной информации.

ИНСТРУКЦИИ:
1. Найди и прочитай штрихкод на изображении (EAN-13, EAN-8, UPC-A и другие форматы)
2. Прочитай всю текстовую информацию на упаковке
3. Определи название товара со всеми деталями (бренд, тип, вкус, объем)
4. Определи категорию товара

ВАЖНО:
- Штрихкод должен быть точным (обычно 13 или 8 цифр)
- Если штрихкод нечитаем или его нет - оставь barcode пустым
- Название должно быть максимально полным и точным
- Категория на русском языке`;
    }

    // Используем structured output через tool calling для надежного JSON
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-preview',  // Самая быстрая и точная модель
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { 
                type: 'text', 
                text: recognitionType === 'product' 
                  ? 'Что на фото? Быстро!'
                  : 'Прочитай штрихкод.'
              },
              { 
                type: 'image_url', 
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "recognize_product",
            description: "Возвращает результат распознавания товара",
            parameters: {
              type: "object",
              properties: {
                barcode: { 
                  type: "string", 
                  description: "Штрихкод товара из базы или пустая строка" 
                },
                name: { 
                  type: "string", 
                  description: "Полное название товара с вкусом/вариантом" 
                },
                category: { 
                  type: "string", 
                  description: "Категория товара" 
                }
              },
              required: ["barcode", "name", "category"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "recognize_product" } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        console.error('Rate limit exceeded');
        return new Response(JSON.stringify({ error: 'rate_limit', result: '' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        console.error('Payment required');
        return new Response(JSON.stringify({ error: 'payment_required', result: '' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Получаем structured output из tool call
    let result;
    try {
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        result = JSON.parse(toolCall.function.arguments);
        console.log('Recognition result (structured):', result);
      } else {
        // Fallback на старый метод если нет tool call
        const rawResult = data.choices?.[0]?.message?.content?.trim() || '';
        console.log('Recognition result (fallback):', rawResult);
        const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
        result = jsonMatch ? JSON.parse(jsonMatch[0]) : { barcode: '', name: '', category: '' };
      }
    } catch (e) {
      console.error('Failed to parse recognition result:', e);
      result = { barcode: '', name: '', category: '' };
    }

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in recognize-product:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      result: ''
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
