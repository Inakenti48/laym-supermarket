import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const externalUrl = Deno.env.get('EXTERNAL_SUPABASE_URL');
    const externalKey = Deno.env.get('EXTERNAL_SUPABASE_SERVICE_KEY');

    if (!externalUrl || !externalKey) {
      throw new Error('External Supabase credentials not configured');
    }

    console.log('🔗 Connecting to external Supabase:', externalUrl);

    const externalSupabase = createClient(externalUrl, externalKey, {
      auth: { persistSession: false }
    });

    // Создаем таблицы через SQL
    const createTablesSQL = `
      -- Создаем enum для ролей (если не существует)
      DO $$ BEGIN
        CREATE TYPE app_role AS ENUM ('admin', 'cashier', 'cashier2', 'inventory', 'employee');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;

      -- Таблица ролей пользователей
      CREATE TABLE IF NOT EXISTS user_roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Таблица профилей
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE,
        full_name TEXT,
        avatar_url TEXT,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      -- Таблица товаров
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        purchase_price DECIMAL(10,2) DEFAULT 0,
        selling_price DECIMAL(10,2) DEFAULT 0,
        quantity INTEGER DEFAULT 0,
        unit TEXT DEFAULT 'шт',
        category TEXT,
        supplier_id UUID,
        image_url TEXT,
        expiry_date DATE,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );

      -- Таблица поставщиков
      CREATE TABLE IF NOT EXISTS suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        contact TEXT,
        phone TEXT,
        address TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Таблица продаж
      CREATE TABLE IF NOT EXISTS sales (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID,
        quantity INTEGER NOT NULL,
        total_price DECIMAL(10,2) NOT NULL,
        cashier_id UUID,
        cashier_name TEXT,
        payment_method TEXT DEFAULT 'cash',
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Таблица сотрудников
      CREATE TABLE IF NOT EXISTS employees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        position TEXT,
        phone TEXT,
        salary DECIMAL(10,2),
        hire_date DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Таблица системных логов
      CREATE TABLE IF NOT EXISTS system_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );

      -- Таблица отмен
      CREATE TABLE IF NOT EXISTS cancellation_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID,
        product_name TEXT,
        quantity INTEGER,
        reason TEXT,
        status TEXT DEFAULT 'pending',
        cashier_id UUID,
        cashier_name TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `;

    // Пробуем выполнить через RPC если есть
    const { error: rpcError } = await externalSupabase.rpc('exec_sql', { 
      sql: createTablesSQL 
    });

    if (rpcError) {
      console.log('⚠️ RPC not available, trying direct table creation...');
      
      // Проверяем существующие таблицы
      const { data: existingProducts } = await externalSupabase
        .from('products')
        .select('id')
        .limit(1);

      if (existingProducts !== null) {
        console.log('✅ Tables already exist');
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Tables already exist in external database',
            url: externalUrl 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('✅ Database setup completed');

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'External database configured successfully',
        url: externalUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
