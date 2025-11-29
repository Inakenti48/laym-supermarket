import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Фиксированные системные пользователи (fallback)
const SYSTEM_USERS = [
  { login: '8080', role: 'admin', name: 'Администратор', user_id: '00000000-0000-0000-0000-000000000001' },
  { login: '1020', role: 'cashier1', name: 'Кассир 1', user_id: '00000000-0000-0000-0000-000000000002' },
  { login: '2030', role: 'cashier2', name: 'Кассир 2', user_id: '00000000-0000-0000-0000-000000000003' },
  { login: '3040', role: 'warehouse', name: 'Склад', user_id: '00000000-0000-0000-0000-000000000004' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const { loginHash } = await req.json();

    if (!loginHash) {
      return new Response(
        JSON.stringify({ success: false, error: 'Хеш логина обязателен' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔐 Проверка входа');

    // Сначала проверяем системных пользователей
    let foundUser = null;
    for (const user of SYSTEM_USERS) {
      const userHash = await hashSHA256(user.login);
      if (userHash === loginHash) {
        foundUser = { ...user, source: 'system' };
        break;
      }
    }

    // Если не нашли в системных - ищем в MySQL
    if (!foundUser) {
      try {
        client = await new Client().connect({
          hostname: Deno.env.get('MYSQL_HOST'),
          port: parseInt(Deno.env.get('MYSQL_PORT') || '3306'),
          username: Deno.env.get('MYSQL_USER'),
          password: Deno.env.get('MYSQL_PASSWORD'),
          db: Deno.env.get('MYSQL_DATABASE'),
        });

        // Получаем всех активных сотрудников с логинами
        const employees = await client.query(
          'SELECT id, name, role, login FROM employees WHERE login IS NOT NULL AND active = true'
        );

        for (const emp of employees) {
          if (emp.login) {
            const empHash = await hashSHA256(emp.login);
            if (empHash === loginHash) {
              // Маппинг ролей сотрудников
              let role = 'warehouse';
              if (emp.role === 'admin' || emp.role === 'администратор') role = 'admin';
              else if (emp.role === 'cashier' || emp.role === 'кассир' || emp.role === 'cashier1') role = 'cashier1';
              else if (emp.role === 'cashier2' || emp.role === 'кассир 2') role = 'cashier2';
              else if (emp.role === 'warehouse' || emp.role === 'склад') role = 'warehouse';

              foundUser = {
                login: emp.login,
                role: role,
                name: emp.name,
                user_id: emp.id,
                source: 'mysql'
              };
              break;
            }
          }
        }

        await client.close();
        client = null;
      } catch (dbError) {
        console.error('⚠️ MySQL недоступен, используем только системных пользователей:', dbError);
        if (client) {
          try { await client.close(); } catch {}
        }
      }
    }

    if (!foundUser) {
      console.log('❌ Неверный логин');
      return new Response(
        JSON.stringify({ success: false, error: 'Неверный логин' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Логин верный:', foundUser.name, 'роль:', foundUser.role, 'источник:', foundUser.source);

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
    if (client) {
      try { await client.close(); } catch {}
    }
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
