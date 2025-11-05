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

  try {
    const { imageBase64, frontPhoto, barcodePhoto } = await req.json();
    
    console.log('=== RECOGNIZE BY PHOTO START ===');
    console.log('Image size:', imageBase64?.length || 0);
    console.log('Front photo:', frontPhoto ? 'Yes' : 'No');
    console.log('Barcode photo:', barcodePhoto ? 'Yes' : 'No');
    
    // Используем приоритет: frontPhoto > barcodePhoto > imageBase64
    const primaryImage = frontPhoto || imageBase64;
    const secondaryImage = barcodePhoto;
    
    if (!primaryImage) {
      console.error('Missing image');
      return new Response(
        JSON.stringify({ error: 'At least one image is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate base64 image format
    const base64Pattern = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;
    if (!base64Pattern.test(primaryImage)) {
      return new Response(
        JSON.stringify({ error: 'Invalid image format. Must be a valid base64 image (PNG, JPEG, WEBP, GIF)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Size validation - approximately 10MB limit for base64
    const base64Data = primaryImage.split(',')[1] || primaryImage;
    const sizeInBytes = (base64Data.length * 3) / 4;
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (sizeInBytes > maxSize) {
      return new Response(
        JSON.stringify({ error: `Image size exceeds 10MB limit (current: ${(sizeInBytes / 1024 / 1024).toFixed(2)}MB)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Инициализируем Supabase клиент
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Получаем все сохраненные фото товаров
    const { data: productImages, error: dbError } = await supabase
      .from('product_images')
      .select('*')
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Database error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch product images' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${productImages?.length || 0} product images in database`);

    // Создаем промпт для AI с информацией о всех товарах
    const productsInfo = productImages && productImages.length > 0
      ? productImages.map((img, idx) => 
          `${idx + 1}. Штрихкод: ${img.barcode}, Название: ${img.product_name}`
        ).join('\n')
      : 'Нет сохраненных товаров';

    const systemPrompt = `Ты - СТРОГАЯ система проверки товаров. Твоя задача - НЕ ОШИБИТЬСЯ.

БАЗА ТОВАРОВ:
${productsInfo}

КРИТЕРИИ ТОЧНОГО СОВПАДЕНИЯ (ВСЕ должны совпадать на 100%):
✓ БРЕНД товара (название производителя)
✓ НАЗВАНИЕ продукта (полное наименование)
✓ УПАКОВКА (цвет, дизайн, форма)
✓ РАЗМЕР/ВЕС (граммы, миллилитры, количество)
✓ ЛОГОТИП и текст на упаковке
✓ ОБЩИЙ ВИД упаковки

АЛГОРИТМ ПРОВЕРКИ:
1. Внимательно изучи ВСЕ детали товара на фото
2. Прочитай текст на упаковке (бренд, название, вес)
3. Сравни КАЖДУЮ характеристику с товарами из базы
4. Верни штрихкод ТОЛЬКО если уверен на 98%+ по ВСЕМ критериям
5. Если хотя бы ОДНА деталь не совпадает - верни "UNKNOWN"

⚠️ ВАЖНО:
- Похожие товары разных размеров/вкусов - это РАЗНЫЕ товары
- Разные продукты одного бренда - это РАЗНЫЕ товары
- При малейшем сомнении - верни "UNKNOWN"
- Используй ТОЛЬКО штрихкоды из списка. НЕ придумывай.`;

    // Вызываем Lovable AI для быстрого распознавания
    // Если есть оба фото, используем их для более точного распознавания
    const userContent: any[] = [
      {
        type: 'text',
        text: secondaryImage 
          ? 'На первом изображении - лицевая сторона товара, на втором - штрих-код. Какой товар? Верни штрихкод из базы или UNKNOWN.'
          : 'Какой товар на изображении? Верни штрихкод из базы или UNKNOWN.'
      },
      {
        type: 'image_url',
        image_url: { url: primaryImage }
      }
    ];

    if (secondaryImage) {
      userContent.push({
        type: 'image_url',
        image_url: { url: secondaryImage }
      });
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',  // Используем более быструю модель
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: userContent
          }
        ],
        tools: [{
          type: "function",
          function: {
            name: "identify_product",
            description: "Идентифицирует товар и возвращает его штрихкод",
            parameters: {
              type: "object",
              properties: {
                barcode: { 
                  type: "string", 
                  description: "Штрихкод товара из базы или UNKNOWN" 
                }
              },
              required: ["barcode"],
              additionalProperties: false
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "identify_product" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'rate_limit', message: 'Too many requests' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'payment_required', message: 'Payment required' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    
    // Получаем structured output из tool call
    let recognizedBarcode = 'UNKNOWN';
    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        recognizedBarcode = parsed.barcode || 'UNKNOWN';
      } else {
        // Fallback
        recognizedBarcode = aiData.choices[0]?.message?.content?.trim() || 'UNKNOWN';
      }
    } catch (e) {
      console.error('Failed to parse barcode:', e);
    }

    console.log('AI recognized barcode:', recognizedBarcode);

    // Если распознан валидный штрихкод, ищем информацию о товаре
    if (recognizedBarcode !== 'UNKNOWN' && recognizedBarcode.trim() !== '') {
      const productInfo = productImages?.find(img => img.barcode === recognizedBarcode);
      
      console.log('Looking for barcode:', recognizedBarcode);
      console.log('Found product:', productInfo ? `YES (${productInfo.product_name})` : 'NO');
      
      if (productInfo) {
        return new Response(
          JSON.stringify({
            success: true,
            result: {
              barcode: productInfo.barcode,
              name: productInfo.product_name,
              recognized: true
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Product not recognized or not found in database');

    // Товар не распознан
    return new Response(
      JSON.stringify({
        success: true,
        result: {
          barcode: '',
          name: '',
          recognized: false
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in recognize-product-by-photo:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
