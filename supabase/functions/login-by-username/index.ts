import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Фиксированные пользователи
const USERS = [
  { login: '8080', role: 'admin', name: 'Администратор', user_id: '00000000-0000-0000-0000-000000000001' },
  { login: '1020', role: 'cashier1', name: 'Кассир 1', user_id: '00000000-0000-0000-0000-000000000002' },
  { login: '2030', role: 'cashier2', name: 'Кассир 2', user_id: '00000000-0000-0000-0000-000000000003' },
  { login: '3040', role: 'warehouse', name: 'Склад', user_id: '00000000-0000-0000-0000-000000000004' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { loginHash } = await req.json();

    if (!loginHash) {
      return new Response(
        JSON.stringify({ success: false, error: 'Хеш логина обязателен' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔐 Проверка входа');

    // Ищем пользователя
    let foundUser = null;
    for (const user of USERS) {
      const userHash = await hashSHA256(user.login);
      if (userHash === loginHash) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      console.log('❌ Неверный логин');
      return new Response(
        JSON.stringify({ success: false, error: 'Неверный логин' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Логин верный:', foundUser.name);

    // Генерируем ID сессии без обращения к БД
    const sessionId = crypto.randomUUID();

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: foundUser.user_id,
        role: foundUser.role,
        login: foundUser.login,
        name: foundUser.name,
        sessionId: sessionId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Ошибка:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function hashSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}
