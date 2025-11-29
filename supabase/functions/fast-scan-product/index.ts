import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { frontPhoto, barcodePhoto, deviceId, userName } = await req.json();
    
    console.log('=== FAST SCAN START ===');
    console.log('Device:', deviceId);
    
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

    // ТОЛЬКО AI распознавание - никакого Supabase!
    const primaryImage = frontPhoto || barcodePhoto;
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        max_tokens: 200
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
    let name = '';
    let category = '';

    try {
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        barcode = (parsed.barcode || '').replace(/\D/g, '');
        name = parsed.name || '';
        category = parsed.category || '';
      }
    } catch (e) {
      console.error('Parse error:', e);
    }

    console.log(`📦 Распознано: ${barcode} - ${name} (${category})`);
    console.log(`=== FAST SCAN DONE in ${aiTime}ms ===`);

    // Возвращаем ТОЛЬКО результат AI - клиент сам сохранит в MySQL
    return new Response(
      JSON.stringify({
        success: true,
        barcode,
        name,
        category,
        processingTime: aiTime
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
