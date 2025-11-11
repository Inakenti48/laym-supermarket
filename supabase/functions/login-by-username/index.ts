import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { loginHash } = await req.json();

    // Валидация входных данных
    if (!loginHash) {
      return new Response(
        JSON.stringify({ success: false, error: 'Хеш логина обязателен' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔐 Проверка входа по хешу');

    // Вычисляем MD5 хеши всех логинов в БД и сравниваем
    const { data: allUsers, error: fetchError } = await supabase
      .from('user_roles')
      .select('user_id, role, login');

    if (fetchError || !allUsers) {
      console.error('❌ Ошибка получения пользователей:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Ошибка проверки' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ищем пользователя с совпадающим хешем
    let foundUser = null;
    for (const user of allUsers) {
      const userHash = await hashMD5(user.login);
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

    console.log('✅ Вход успешен:', { userId: foundUser.user_id, role: foundUser.role });

    // Возвращаем успешный результат
    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: foundUser.user_id,
        role: foundUser.role,
        login: foundUser.login
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

// SHA-256 хеширование (вместо MD5, так как более безопасно)
async function hashMD5(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  
  // Используем SHA-256 вместо MD5 (более безопасно)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Берем первые 32 символа для совместимости
  return hashHex.substring(0, 32);
}