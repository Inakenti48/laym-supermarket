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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log(`Recognition type: ${recognitionType}`);

    let systemPrompt = '';
    let userPrompt = '';

    if (recognitionType === 'product') {
      // Распознавание по лицевой стороне товара
      // Сначала проверяем, может ли это фото совпадать с уже существующими товарами по визуальному сравнению
      systemPrompt = `Ты - эксперт по распознаванию товаров в супермаркете. Твоя задача - определить товар по фото его лицевой стороны.

Список доступных товаров в базе (barcode|name|category):
${allProducts.map((p: any) => `${p.barcode}|${p.name}|${p.category}`).join('\n')}

ВАЖНО:
- Внимательно анализируй упаковку, этикетку, текст на товаре, логотипы, бренды
- Сравни изображение с товарами из базы по ВИЗУАЛЬНОМУ сходству упаковки
- Определи название товара (бренд + тип продукта)
- Определи категорию (Молочные продукты, Напитки, Хлеб и выпечка, Мясо, Сладости, и т.д.)
- Если визуально товар ТОЧНО СОВПАДАЕТ с товаром из списка - верни его штрихкод
- Если товара НЕТ в списке или не уверен - верни пустой штрихкод, но заполни название и категорию

Ответь СТРОГО в формате JSON:
{"barcode": "штрихкод или пусто", "name": "Название товара", "category": "Категория"}`;

      userPrompt = 'Распознай товар на фото. Сравни с товарами в базе. Верни JSON с barcode, name, category.';
    } else {
      // Распознавание штрихкода
      systemPrompt = `Ты - эксперт по распознаванию штрихкодов. Твоя задача - прочитать штрихкод с изображения.

ВАЖНО:
- Ищи на фото штрихкод (EAN-13, EAN-8, CODE-128, UPC и др.)
- Если штрихкод четкий и читаемый - верни только цифры штрихкода
- Если штрихкода нет или он нечитаемый - возвращай пустую строку
- Отвечай ТОЛЬКО цифрами штрихкода или пустой строкой, без объяснений`;

      userPrompt = 'Прочитай штрихкод с фото. Если читаем - верни цифры, иначе пусто.';
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              { 
                type: 'image_url', 
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
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
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const rawResult = data.choices?.[0]?.message?.content?.trim() || '';
    
    console.log(`Recognition result: ${rawResult}`);

    let result;
    if (recognitionType === 'product') {
      // Парсим JSON ответ для распознавания товара
      try {
        // Извлекаем JSON из ответа (может быть обернут в markdown)
        const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          result = { barcode: '', name: '', category: '' };
        }
      } catch (e) {
        console.error('Failed to parse product recognition result:', e);
        result = { barcode: '', name: '', category: '' };
      }
    } else {
      // Для штрихкода возвращаем просто строку
      result = { barcode: rawResult };
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
