import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Declare EdgeRuntime for background tasks
declare const EdgeRuntime: {
  waitUntil(promise: Promise<any>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Интерфейсы для типов данных
interface ProductData {
  id: number;
  name: string;
  brand: string;
  price: number;
  rating: number;
  feedbacks: number;
  supplier: string;
  availability: number;
}

interface SearchParams {
  query: string;
  limit?: number;
  interval?: number;
}

interface CategoryParams {
  catalogUrl: string;
  limit?: number;
}

// Функция для поиска товаров по запросу
async function searchProducts(query: string, limit: number = 100): Promise<ProductData[]> {
  console.log(`Searching for: ${query}, limit: ${limit}`);
  
  try {
    const response = await fetch(
      `https://search.wb.ru/exactmatch/ru/common/v4/search?appType=1&curr=rub&dest=-1257786&query=${encodeURIComponent(query)}&resultset=catalog&sort=popular&spp=24&suppressSpellcheck=false&limit=${limit}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      throw new Error(`WB API error: ${response.status}`);
    }

    const data = await response.json();
    const products = data?.data?.products || [];
    
    return products.map((p: any) => ({
      id: p.id,
      name: p.name || '',
      brand: p.brand || '',
      price: Math.round((p.salePriceU || 0) / 100),
      rating: p.rating || 0,
      feedbacks: p.feedbacks || 0,
      supplier: p.supplier || '',
      availability: p.quantity || 0,
    }));
  } catch (error) {
    console.error('Error searching products:', error);
    throw error;
  }
}

// Фоновая задача для мониторинга стока
async function monitorStock(
  supabaseClient: any,
  taskId: string,
  params: SearchParams
) {
  try {
    console.log(`Starting stock monitoring task ${taskId}`);
    
    // Обновляем статус на processing
    await supabaseClient
      .from('wb_analytics_tasks')
      .update({ status: 'processing' })
      .eq('id', taskId);

    const { query, limit = 10, interval = 300 } = params;
    
    // Первый снимок
    const snapshot1 = await searchProducts(query, limit);
    console.log(`First snapshot: ${snapshot1.length} products`);
    
    // Ждем интервал (в секундах)
    await new Promise(resolve => setTimeout(resolve, interval * 1000));
    
    // Второй снимок
    const snapshot2 = await searchProducts(query, limit);
    console.log(`Second snapshot: ${snapshot2.length} products`);
    
    // Сравниваем снимки
    const changes: any[] = [];
    const map1 = new Map(snapshot1.map(p => [p.id, p]));
    const map2 = new Map(snapshot2.map(p => [p.id, p]));
    
    for (const [id, product2] of map2) {
      const product1 = map1.get(id);
      if (product1) {
        const stockChange = product2.availability - product1.availability;
        const priceChange = product2.price - product1.price;
        
        if (stockChange !== 0 || priceChange !== 0) {
          changes.push({
            id,
            name: product2.name,
            brand: product2.brand,
            stockChange,
            priceChange,
            currentStock: product2.availability,
            currentPrice: product2.price,
            rating: product2.rating,
            feedbacks: product2.feedbacks,
          });
        }
      } else {
        // Новый товар
        changes.push({
          id,
          name: product2.name,
          brand: product2.brand,
          stockChange: product2.availability,
          priceChange: 0,
          currentStock: product2.availability,
          currentPrice: product2.price,
          rating: product2.rating,
          feedbacks: product2.feedbacks,
          isNew: true,
        });
      }
    }
    
    // Удаленные товары
    for (const [id, product1] of map1) {
      if (!map2.has(id)) {
        changes.push({
          id,
          name: product1.name,
          brand: product1.brand,
          stockChange: -product1.availability,
          priceChange: 0,
          currentStock: 0,
          currentPrice: product1.price,
          rating: product1.rating,
          feedbacks: product1.feedbacks,
          isRemoved: true,
        });
      }
    }
    
    const result = {
      query,
      interval,
      totalProducts: snapshot2.length,
      changesCount: changes.length,
      changes,
      snapshot1: snapshot1.slice(0, 5), // Первые 5 для примера
      snapshot2: snapshot2.slice(0, 5),
    };
    
    // Сохраняем результат
    await supabaseClient
      .from('wb_analytics_tasks')
      .update({ 
        status: 'completed',
        result,
      })
      .eq('id', taskId);
    
    console.log(`Task ${taskId} completed successfully`);
  } catch (error: any) {
    console.error(`Task ${taskId} failed:`, error);
    
    await supabaseClient
      .from('wb_analytics_tasks')
      .update({ 
        status: 'failed',
        error_message: error.message,
      })
      .eq('id', taskId);
  }
}

// Фоновая задача для анализа продаж категории
async function analyzeCategorySales(
  supabaseClient: any,
  taskId: string,
  params: CategoryParams
) {
  try {
    console.log(`Starting category sales analysis task ${taskId}`);
    
    await supabaseClient
      .from('wb_analytics_tasks')
      .update({ status: 'processing' })
      .eq('id', taskId);

    const { catalogUrl, limit = 100 } = params;
    
    // Извлекаем поисковый запрос из URL (упрощенная версия)
    const urlObj = new URL(catalogUrl);
    const query = urlObj.searchParams.get('search') || urlObj.pathname.split('/').pop() || '';
    
    const products = await searchProducts(query, limit);
    
    // Анализ
    const totalProducts = products.length;
    const averagePrice = products.reduce((sum, p) => sum + p.price, 0) / totalProducts;
    const averageRating = products.reduce((sum, p) => sum + p.rating, 0) / totalProducts;
    const totalFeedbacks = products.reduce((sum, p) => sum + p.feedbacks, 0);
    
    // Топ бренды
    const brandStats = new Map<string, { count: number; totalSales: number }>();
    products.forEach(p => {
      const current = brandStats.get(p.brand) || { count: 0, totalSales: 0 };
      brandStats.set(p.brand, {
        count: current.count + 1,
        totalSales: current.totalSales + p.feedbacks,
      });
    });
    
    const topBrands = Array.from(brandStats.entries())
      .map(([brand, stats]) => ({ brand, ...stats }))
      .sort((a, b) => b.totalSales - a.totalSales)
      .slice(0, 10);
    
    // Топ товары
    const topProducts = products
      .sort((a, b) => b.feedbacks - a.feedbacks)
      .slice(0, 20)
      .map(p => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        price: p.price,
        rating: p.rating,
        feedbacks: p.feedbacks,
        availability: p.availability,
      }));
    
    const result = {
      catalogUrl,
      totalProducts,
      averagePrice: Math.round(averagePrice),
      averageRating: averageRating.toFixed(2),
      totalFeedbacks,
      topBrands,
      topProducts,
    };
    
    await supabaseClient
      .from('wb_analytics_tasks')
      .update({ 
        status: 'completed',
        result,
      })
      .eq('id', taskId);
    
    console.log(`Task ${taskId} completed successfully`);
  } catch (error: any) {
    console.error(`Task ${taskId} failed:`, error);
    
    await supabaseClient
      .from('wb_analytics_tasks')
      .update({ 
        status: 'failed',
        error_message: error.message,
      })
      .eq('id', taskId);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // GET /task/{id} - получить статус задачи
    if (req.method === 'GET' && path.includes('/task/')) {
      const taskId = path.split('/').pop();
      
      const { data: task, error } = await supabaseClient
        .from('wb_analytics_tasks')
        .select('*')
        .eq('id', taskId)
        .single();

      if (error) throw error;

      return new Response(
        JSON.stringify(task),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /search_stock - создать задачу мониторинга стока
    if (req.method === 'POST' && path.includes('/search_stock')) {
      const params: SearchParams = await req.json();
      
      if (!params.query) {
        throw new Error('Query parameter is required');
      }

      // Создаем задачу
      const { data: task, error: insertError } = await supabaseClient
        .from('wb_analytics_tasks')
        .insert({
          task_type: 'search_stock',
          parameters: params,
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Запускаем фоновую задачу
      const serviceRoleClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      EdgeRuntime.waitUntil(
        monitorStock(serviceRoleClient, task.id, params)
      );

      return new Response(
        JSON.stringify({ 
          taskId: task.id,
          message: 'Task started',
          estimatedTime: `${params.interval || 300} seconds`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /category_sales - создать задачу анализа категории
    if (req.method === 'POST' && path.includes('/category_sales')) {
      const params: CategoryParams = await req.json();
      
      if (!params.catalogUrl) {
        throw new Error('catalogUrl parameter is required');
      }

      const { data: task, error: insertError } = await supabaseClient
        .from('wb_analytics_tasks')
        .insert({
          task_type: 'category_sales',
          parameters: params,
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const serviceRoleClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      EdgeRuntime.waitUntil(
        analyzeCategorySales(serviceRoleClient, task.id, params)
      );

      return new Response(
        JSON.stringify({ 
          taskId: task.id,
          message: 'Task started',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /tasks - получить все задачи пользователя
    if (req.method === 'GET' && path.includes('/tasks')) {
      const { data: tasks, error } = await supabaseClient
        .from('wb_analytics_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return new Response(
        JSON.stringify(tasks),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});