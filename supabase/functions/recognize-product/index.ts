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
    const { imageBase64, recognitionType, allProducts } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log(`Recognition type: ${recognitionType}`);

    let systemPrompt = '';
    let userPrompt = '';

    if (recognitionType === 'product') {
      // Распознавание по лицевой стороне товара
      systemPrompt = `Ты - эксперт по распознаванию товаров в супермаркете. Твоя задача - определить товар по фото его лицевой стороны.

Список доступных товаров в базе (barcode|name|price):
${allProducts.map((p: any) => `${p.barcode}|${p.name}|${p.retailPrice}₽`).join('\n')}

ВАЖНО:
- Внимательно анализируй упаковку, этикетку, логотипы
- Если видишь точное совпадение с товаром из списка - возвращай его штрихкод
- Если товара НЕТ в списке или не уверен на 90% - возвращай пустую строку
- Отвечай ТОЛЬКО штрихкодом или пустой строкой, без объяснений`;

      userPrompt = 'Определи товар по фото. Если уверен на 90%+ - верни штрихкод, иначе пусто.';
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
                image_url: { url: imageBase64 }
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
    const result = data.choices?.[0]?.message?.content?.trim() || '';
    
    console.log(`Recognition result: ${result}`);

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
