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
    const { message, history } = await req.json();
    
    console.log('=== AI ASSISTANT REQUEST ===');
    console.log('Message:', message);
    console.log('History length:', history?.length || 0);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Системный промт для AI-ассистента
    const systemPrompt = `Ты опытный AI-ассистент системы управления складом и розничной торговли.

ТВОЯ РОЛЬ:
- Помогать пользователям с вопросами о товарах, продажах и складской логистике
- Анализировать данные и давать рекомендации
- Отвечать на вопросы о работе системы
- Быть полезным, точным и профессиональным

ВОЗМОЖНОСТИ СИСТЕМЫ:
- Управление товарами (добавление, учет, списание)
- Учет продаж и отчеты
- Контроль сроков годности
- Возвраты товаров поставщикам
- Управление поставщиками
- Учет рабочего времени сотрудников
- AI-распознавание товаров по фото

КАК ОТВЕЧАТЬ:
- Давай краткие, понятные ответы
- Используй эмодзи для наглядности
- При анализе предлагай конкретные действия
- Если нужны данные из базы - скажи пользователю где посмотреть

ПРИМЕРЫ ВОПРОСОВ, НА КОТОРЫЕ ТЫ ОТВЕЧАЕШЬ:
- "Какие товары заканчиваются?"
- "Как добавить новый товар?"
- "Что делать с истекающими товарами?"
- "Как работает AI-распознавание?"
- "Покажи статистику продаж"

Отвечай на русском языке, будь дружелюбным и помогай решать задачи быстро!`;

    // Формируем историю сообщений для AI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    // Вызываем Lovable AI
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'Извините, не могу ответить.';

    console.log('✅ AI response:', aiResponse.substring(0, 100) + '...');

    return new Response(
      JSON.stringify({ 
        success: true,
        response: aiResponse
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in ai-assistant:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        response: 'Произошла ошибка. Попробуйте позже.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
