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
      systemPrompt = `Ты - эксперт по распознаванию товаров в супермаркете. Твоя задача - точно определить товар по фото его лицевой стороны.

Список доступных товаров в базе (barcode|name|category):
${allProducts.map((p: any) => `${p.barcode}|${p.name}|${p.category}`).join('\n')}

КРИТИЧЕСКИ ВАЖНО ПРИ РАСПОЗНАВАНИИ:
1. РАЗЛИЧАЙ ВКУСЫ И ВАРИАНТЫ: "Молоко шоколадное" ≠ "Молоко обычное", "Йогурт клубника" ≠ "Йогурт черника"
2. ОБРАЩАЙ ВНИМАНИЕ НА:
   - Вкус/аромат (шоколад, ваниль, клубника, и т.д.)
   - Тип (обычное, лёгкое, премиум)
   - Объём/размер упаковки
   - Бренд и подбренд
3. ВИЗУАЛЬНОЕ СРАВНЕНИЕ:
   - Цвет упаковки (важно для вкусов)
   - Логотипы и их расположение
   - Шрифты и дизайн этикетки
4. НЕ ПУТАЙ похожие товары одного бренда!

Процесс распознавания:
- Прочитай весь текст на упаковке
- Определи точное название с вкусом/вариантом
- Определи категорию товара
- Проверь, ТОЧНО ЛИ такой товар (с таким же вкусом/вариантом) есть в базе
- Если ДА и уверен на 95%+ - верни штрихкод
- Если НЕТ или есть сомнения - верни пустой штрихкод, но заполни точное название и категорию

Ответь СТРОГО в формате JSON:
{"barcode": "штрихкод если точное совпадение или пусто", "name": "Точное название с вкусом/вариантом", "category": "Категория"}`;

      userPrompt = 'Распознай товар ТОЧНО, учитывая вкус и вариант. Не путай похожие товары. Верни JSON.';
    } else {
      // Распознавание штрихкода - также извлекаем название товара с упаковки
      systemPrompt = `Ты - эксперт по распознаванию штрихкодов и товаров. Твоя задача:
1. ПРОЧИТАТЬ штрихкод (EAN-13, EAN-8, CODE-128, UPC и др.)
2. ДОПОЛНИТЕЛЬНО прочитать название товара и категорию с упаковки (если видно)

ВАЖНО:
- Основная задача - прочитать штрихкод
- Дополнительно: если на фото видна упаковка с текстом - распознай название и категорию
- Если штрихкода нет или нечитаем - возвращай пустой штрихкод
- Название и категория могут быть пустыми, если текст не виден

Ответь СТРОГО в формате JSON:
{"barcode": "цифры штрихкода или пусто", "name": "Название товара если видно", "category": "Категория если видно"}`;

      userPrompt = 'Прочитай штрихкод и дополнительно название товара с упаковки. Верни JSON.';
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
    if (recognitionType === 'product' || recognitionType === 'barcode') {
      // Парсим JSON ответ для обоих типов распознавания
      try {
        // Извлекаем JSON из ответа (может быть обернут в markdown)
        const jsonMatch = rawResult.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        } else {
          result = { barcode: '', name: '', category: '' };
        }
      } catch (e) {
        console.error('Failed to parse recognition result:', e);
        result = { barcode: '', name: '', category: '' };
      }
    } else {
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
