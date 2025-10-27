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
      return new Response(
        JSON.stringify({ error: 'imageUrl is required and must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
      return new Response(
        JSON.stringify({ error: `Image too large (max ${maxLength} characters)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Recognition type: ${recognitionType}`);

    let systemPrompt = '';

    if (recognitionType === 'product') {
      systemPrompt = `БЫСТРОЕ распознавание товара. Отвечай МГНОВЕННО.

❌ ИГНОРИРУЙ ЛЮДЕЙ:
- Человек/лицо/тело → верни пустые значения
- Нет упаковки с текстом → пустые значения

📦 ТОВАРЫ В БАЗЕ:
${allProducts.map((p: any) => `${p.barcode}|${p.name}|${p.category}`).join('\n')}

⚡ АЛГОРИТМ (быстро):
1. Видишь упаковку? Да → дальше, Нет → пустые значения
2. Читай текст на упаковке (бренд + вкус + размер)
3. Ищи в базе по названию
4. Найден → верни barcode, Не найден → заполни name и category

ПРИМЕР: "Coca-Cola Cherry 0.5л", "Snickers с арахисом 50г"`;
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
        model: 'google/gemini-2.5-flash',
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
