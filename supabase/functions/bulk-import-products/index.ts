import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { csvData } = await req.json();
    
    console.log(`📦 Starting bulk import of ${csvData.length} products`);

    // Получаем текущего пользователя
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id;
    }

    // Парсим CSV данные и готовим для вставки
    const productsToInsert = csvData.map((row: any) => {
      const barcode = String(row.barcode || row['Код'] || '').trim();
      const name = String(row.name || row['Наименование'] || '').trim();
      const category = String(row.category || row['Группа'] || '').trim();
      const unit = String(row.unit || row['Ед. изм.'] || 'шт').trim();
      const quantity = parseFloat(row.quantity || row['Количество'] || 0);
      const purchasePrice = parseFloat(row.purchase_price || row['Приходная цена'] || 0);
      const salePrice = parseFloat(row.sale_price || row['Розничная цена'] || 0);

      return {
        barcode,
        name,
        category,
        unit: unit === 'кг' ? 'кг' : 'шт',
        quantity: Math.round(quantity),
        purchase_price: purchasePrice,
        sale_price: salePrice,
        paid_amount: purchasePrice * quantity,
        debt_amount: 0,
        payment_type: 'full',
        created_by: userId,
        price_history: [{
          date: new Date().toISOString(),
          purchasePrice,
          retailPrice: salePrice,
          changedBy: 'bulk_import'
        }]
      };
    }).filter((p: any) => p.barcode && p.name); // Только товары с штрихкодом и названием

    console.log(`✅ Prepared ${productsToInsert.length} valid products`);

    // Вставляем партиями по 500 товаров
    const batchSize = 500;
    let insertedCount = 0;
    let errorCount = 0;

    for (let i = 0; i < productsToInsert.length; i += batchSize) {
      const batch = productsToInsert.slice(i, i + batchSize);
      
      const { data, error } = await supabase
        .from('products')
        .upsert(batch, { 
          onConflict: 'barcode',
          ignoreDuplicates: false 
        });

      if (error) {
        console.error(`❌ Error inserting batch ${i}-${i + batch.length}:`, error);
        errorCount += batch.length;
      } else {
        insertedCount += batch.length;
        console.log(`✓ Inserted batch ${i}-${i + batch.length}`);
      }
    }

    console.log(`🎉 Import complete: ${insertedCount} inserted, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        inserted: insertedCount,
        errors: errorCount,
        total: productsToInsert.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Bulk import error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
