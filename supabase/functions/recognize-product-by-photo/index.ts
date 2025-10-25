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
    const { imageBase64 } = await req.json();
    
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate base64 image format
    const base64Pattern = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i;
    if (!base64Pattern.test(imageBase64)) {
      return new Response(
        JSON.stringify({ error: 'Invalid image format. Must be a valid base64 image (PNG, JPEG, WEBP, GIF)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Size validation - approximately 10MB limit for base64
    const base64Data = imageBase64.split(',')[1] || imageBase64;
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

    const systemPrompt = `Ты - система распознавания товаров в магазине. 
Тебе дано изображение товара и список известных товаров с их штрихкодами.
Твоя задача - определить какой товар на изображении, сравнивая его с известными товарами.

Известные товары:
${productsInfo}

КРИТИЧЕСКИ ВАЖНО:
- Верни ТОЛЬКО штрихкод товара, который ты узнал на изображении
- Если товар не распознан или не найден в списке, верни "UNKNOWN"
- НЕ ПРИДУМЫВАЙ штрихкоды! Используй только те, что в списке выше
- Формат ответа: просто штрихкод или "UNKNOWN"`;

    // Вызываем Lovable AI для распознавания
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Какой товар на этом изображении? Верни его штрихкод.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64
                }
              }
            ]
          }
        ],
        max_tokens: 100,
        temperature: 0.1
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
    const recognizedBarcode = aiData.choices[0]?.message?.content?.trim() || 'UNKNOWN';

    console.log('AI recognized barcode:', recognizedBarcode);

    // Если распознан валидный штрихкод, ищем информацию о товаре
    if (recognizedBarcode !== 'UNKNOWN') {
      const productInfo = productImages?.find(img => img.barcode === recognizedBarcode);
      
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
