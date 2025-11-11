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
    const { login, password } = await req.json();

    // Валидация входных данных
    if (!login || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Логин и пароль обязательны' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Валидация формата логина (только цифры, 4 символа)
    if (!/^\d{4}$/.test(login)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Неверный формат логина' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('🔐 Проверка логина:', login);

    // Проверяем логин и пароль через RPC функцию (пароль шифруется bcrypt в БД)
    const { data: credentials, error: rpcError } = await supabase.rpc('verify_login_credentials', {
      _login: login,
      _password: password
    });

    console.log('📊 Результат проверки:', { credentials, error: rpcError });

    if (rpcError || !credentials || credentials.length === 0) {
      console.error('❌ Ошибка проверки:', rpcError);
      return new Response(
        JSON.stringify({ success: false, error: 'Неверный логин или пароль' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userData = credentials[0];
    if (!userData.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Неверный логин или пароль' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Вход успешен:', { userId: userData.user_id, role: userData.role });

    // Возвращаем успешный результат (сессия создается на клиенте через localStorage)
    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: userData.user_id,
        role: userData.role,
        login: login
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