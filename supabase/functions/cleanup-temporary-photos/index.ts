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
    
    if (!body.scheduled) {
      console.warn('Cleanup called without scheduled flag - rejecting');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - this endpoint is for scheduled tasks only' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Удаляем записи старше 24 часов
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    console.log('Очистка временных фото старше:', twentyFourHoursAgo.toISOString());

    // Находим старые записи
    const { data: oldPhotos, error: fetchError } = await supabase
      .from('vremenno_product_foto')
      .select('*')
      .lt('created_at', twentyFourHoursAgo.toISOString());

    if (fetchError) {
      console.error('Ошибка получения старых записей:', fetchError);
      throw fetchError;
    }

    console.log(`Найдено ${oldPhotos?.length || 0} старых записей`);

    if (!oldPhotos || oldPhotos.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'Нет записей для удаления',
          deletedCount: 0 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    let deletedFilesCount = 0;
    let deletedRecordsCount = 0;

    // Удаляем файлы из storage и записи из базы
    for (const photo of oldPhotos) {
      try {
        // Удаляем файл из storage
        const { error: storageError } = await supabase.storage
          .from('product-photos')
          .remove([photo.storage_path]);

        if (storageError) {
          console.error(`Ошибка удаления файла ${photo.storage_path}:`, storageError);
        } else {
          deletedFilesCount++;
        }

        // Удаляем запись из базы
        const { error: deleteError } = await supabase
          .from('vremenno_product_foto')
          .delete()
          .eq('id', photo.id);

        if (deleteError) {
          console.error(`Ошибка удаления записи ${photo.id}:`, deleteError);
        } else {
          deletedRecordsCount++;
        }
      } catch (error) {
        console.error('Ошибка обработки записи:', error);
      }
    }

    console.log(`Удалено файлов: ${deletedFilesCount}, записей: ${deletedRecordsCount}`);

    return new Response(
      JSON.stringify({ 
        message: 'Очистка завершена',
        deletedFiles: deletedFilesCount,
        deletedRecords: deletedRecordsCount
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
