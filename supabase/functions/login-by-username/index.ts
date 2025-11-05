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

    if (!login || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Логин и пароль обязательны' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Проверяем логин и пароль через RPC функцию
    const { data: credentials, error: rpcError } = await supabase.rpc('verify_login_credentials', {
      _login: login,
      _password: password
    });

    console.log('Credentials check:', { credentials, error: rpcError });

    if (rpcError || !credentials || credentials.length === 0) {
      console.error('Login failed:', rpcError);
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

    // Получаем email пользователя из auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userData.user_id);
    
    console.log('Auth user:', { authUser, error: authError });

    if (authError || !authUser) {
      console.error('Failed to get user:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Ошибка получения данных пользователя' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Создаем сессию для пользователя через signInWithPassword
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    // Получаем все данные пользователя включая email
    const email = authUser.user.email;
    
    if (!email) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email пользователя не найден' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: userData.user_id,
        role: userData.role,
        email: email
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Внутренняя ошибка сервера' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});