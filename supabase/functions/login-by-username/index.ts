import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Фиксированные пользователи
const USERS = [
  { login: '8080', role: 'admin', name: 'Администратор', user_id: '00000000-0000-0000-0000-000000000001' },
  { login: '1020', role: 'cashier', name: 'Кассир 1', user_id: '00000000-0000-0000-0000-000000000002' },
  { login: '2030', role: 'cashier', name: 'Кассир 2', user_id: '00000000-0000-0000-0000-000000000003' },
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

    console.log('🔐 Проверка входа по хешу');

    // Ищем пользователя с совпадающим хешем
    let foundUser = null;
    for (const user of USERS) {
      const userHash = await hashSHA256(user.login);
      if (userHash === loginHash) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'Неверный логин' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Логин верный:', foundUser.name);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Удаляем старые сессии пользователя
    await supabase
      .from('user_sessions')
      .delete()
      .eq('user_id', foundUser.user_id);

    // Создаем новую сессию
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { data: sessionData, error: sessionError } = await supabase
      .from('user_sessions')
      .insert({
        user_id: foundUser.user_id,
        login: foundUser.login,
        role: foundUser.role,
        expires_at: expiresAt.toISOString()
      })
      .select('id')
      .single();

    if (sessionError) {
      console.error('❌ Ошибка создания сессии:', sessionError);
      return new Response(
        JSON.stringify({ success: false, error: 'Ошибка создания сессии' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Сессия создана:', sessionData.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: foundUser.user_id,
        role: foundUser.role,
        login: foundUser.login,
        name: foundUser.name,
        sessionId: sessionData.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('💥 Критическая ошибка:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// SHA-256 хеширование
async function hashSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 32);
}
