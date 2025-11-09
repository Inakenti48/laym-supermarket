import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate this is a scheduled call (from cron)
    const body = await req.json().catch(() => ({}));
    
    // Enhanced validation: check for scheduled flag AND optional secret
    const CLEANUP_SECRET = Deno.env.get('CLEANUP_SECRET');
    
    if (!body.scheduled) {
      console.warn('⚠️ Cleanup called without scheduled flag - rejecting');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - this endpoint is for scheduled tasks only' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If secret is configured, validate it
    if (CLEANUP_SECRET && body.secret !== CLEANUP_SECRET) {
      console.warn('⚠️ Cleanup called with invalid secret - rejecting');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid secret' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Cleanup validation passed');
    
    // АВТОМАТИЧЕСКАЯ ОЧИСТКА ОТКЛЮЧЕНА
    // Товары в очереди теперь хранятся неограниченное время
    // Удаление происходит только вручную или при сохранении товара
    
    console.log('Автоматическая очистка отключена - товары хранятся бессрочно');

    return new Response(
      JSON.stringify({ 
        message: 'Автоматическая очистка отключена',
        note: 'Товары в очереди хранятся неограниченное время',
        deletedFiles: 0,
        deletedRecords: 0
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Ошибка очистки:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Неизвестная ошибка' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
