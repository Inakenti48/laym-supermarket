const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    console.log('📅 Начало распознавания срока годности');

    if (!imageBase64) {
      throw new Error('Изображение не предоставлено');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY не настроен');
    }

    // Используем AI для распознавания дат на изображении
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
            content: `Ты - эксперт по распознаванию дат на упаковках продуктов. 
Твоя задача - найти на изображении:
1. Дату изготовления (производства)
2. Срок годности (годен до)

Даты могут быть в форматах:
- ДД.ММ.ГГГГ
- ММ/ДД/ГГГГ
- ГГГГ-ММ-ДД
- ДД МЕС ГГГГ (где МЕС - месяц словом)

Верни JSON в ТОЧНОМ формате:
{
  "manufacturingDate": "ГГГГ-ММ-ДД или null",
  "expiryDate": "ГГГГ-ММ-ДД или null",
  "confidence": число от 0 до 1
}

Если дата не найдена, верни null для соответствующего поля.
Всегда преобразуй даты в формат ГГГГ-ММ-ДД.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Найди дату изготовления и срок годности на этом изображении упаковки.'
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
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('❌ Ошибка AI API:', aiResponse.status, errorText);
      throw new Error(`AI API ошибка: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    console.log('🤖 AI ответ получен');

    const content = aiData.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI не вернул результат');
    }

    // Парсим JSON из ответа
    let result;
    try {
      // Извлекаем JSON из markdown блока, если есть
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                       content.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, content];
      result = JSON.parse(jsonMatch[1] || content);
    } catch (parseError) {
      console.error('❌ Ошибка парсинга JSON:', parseError);
      throw new Error('Не удалось распознать даты на изображении');
    }

    console.log('✅ Распознанные даты:', result);

    return new Response(
      JSON.stringify({
        success: true,
        manufacturingDate: result.manufacturingDate || null,
        expiryDate: result.expiryDate || null,
        confidence: result.confidence || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('❌ Ошибка распознавания срока годности:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Неизвестная ошибка',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
