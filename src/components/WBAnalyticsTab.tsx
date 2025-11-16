import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, Package, BarChart3, Clock, CheckCircle, XCircle } from "lucide-react";

interface Task {
  id: string;
  task_type: string;
  status: string;
  parameters: any;
  result: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export const WBAnalyticsTab = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Форма для мониторинга стока
  const [stockQuery, setStockQuery] = useState("");
  const [stockLimit, setStockLimit] = useState(10);
  const [stockInterval, setStockInterval] = useState(300);

  // Форма для анализа категории
  const [categoryUrl, setCategoryUrl] = useState("");
  const [categoryLimit, setCategoryLimit] = useState(100);

  const fetchTasks = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('wb-analytics/tasks', {
        method: 'GET',
      });

      if (error) throw error;
      setTasks(data || []);
    } catch (error: any) {
      console.error('Error fetching tasks:', error);
      toast.error('Ошибка загрузки задач');
    }
  };

  useEffect(() => {
    fetchTasks();
    
    // Подписка на изменения
    const channel = supabase
      .channel('wb_tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wb_analytics_tasks',
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    // Опрос каждые 5 секунд
    const interval = setInterval(fetchTasks, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const startStockMonitoring = async () => {
    if (!stockQuery.trim()) {
      toast.error('Введите поисковый запрос');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('wb-analytics/search_stock', {
        method: 'POST',
        body: {
          query: stockQuery,
          limit: stockLimit,
          interval: stockInterval,
        },
      });

      if (error) throw error;

      toast.success(`Задача запущена! ID: ${data.taskId}`);
      toast.info(`Ожидаемое время: ${data.estimatedTime}`);
      
      setStockQuery("");
      fetchTasks();
    } catch (error: any) {
      console.error('Error starting task:', error);
      toast.error(`Ошибка: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const startCategoryAnalysis = async () => {
    if (!categoryUrl.trim()) {
      toast.error('Введите URL категории');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('wb-analytics/category_sales', {
        method: 'POST',
        body: {
          catalogUrl: categoryUrl,
          limit: categoryLimit,
        },
      });

      if (error) throw error;

      toast.success(`Задача запущена! ID: ${data.taskId}`);
      setCategoryUrl("");
      fetchTasks();
    } catch (error: any) {
      console.error('Error starting task:', error);
      toast.error(`Ошибка: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Завершено</Badge>;
      case 'processing':
        return <Badge className="bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Обработка</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Ошибка</Badge>;
      default:
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Ожидание</Badge>;
    }
  };

  const renderTaskResult = (task: Task) => {
    if (task.status !== 'completed' || !task.result) return null;

    if (task.task_type === 'search_stock') {
      const result = task.result;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Товаров</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{result.totalProducts}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Изменений</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{result.changesCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Интервал</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{result.interval}с</p>
              </CardContent>
            </Card>
          </div>

          {result.changes && result.changes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Изменения товаров</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {result.changes.map((change: any, idx: number) => (
                      <Card key={idx} className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-semibold">{change.name}</p>
                            <p className="text-sm text-muted-foreground">{change.brand}</p>
                            <div className="flex gap-2 mt-2">
                              {change.isNew && <Badge variant="secondary">Новый</Badge>}
                              {change.isRemoved && <Badge variant="destructive">Удален</Badge>}
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            {change.stockChange !== 0 && (
                              <div className="flex items-center gap-1">
                                {change.stockChange > 0 ? (
                                  <TrendingUp className="w-4 h-4 text-green-500" />
                                ) : (
                                  <TrendingDown className="w-4 h-4 text-red-500" />
                                )}
                                <span className="text-sm">{change.stockChange > 0 ? '+' : ''}{change.stockChange}</span>
                              </div>
                            )}
                            {change.priceChange !== 0 && (
                              <div className="flex items-center gap-1">
                                {change.priceChange > 0 ? (
                                  <TrendingUp className="w-4 h-4 text-red-500" />
                                ) : (
                                  <TrendingDown className="w-4 h-4 text-green-500" />
                                )}
                                <span className="text-sm">{change.priceChange > 0 ? '+' : ''}{change.priceChange}₽</span>
                              </div>
                            )}
                            <p className="text-sm text-muted-foreground">Остаток: {change.currentStock}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>
      );
    }

    if (task.task_type === 'category_sales') {
      const result = task.result;
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Товаров</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{result.totalProducts}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Средняя цена</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{result.averagePrice}₽</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Средний рейтинг</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{result.averageRating}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Всего отзывов</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{result.totalFeedbacks}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Топ бренды</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {result.topBrands?.map((brand: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-2 border rounded">
                        <span className="font-medium">{brand.brand}</span>
                        <div className="text-right">
                          <p className="text-sm">{brand.count} товаров</p>
                          <p className="text-xs text-muted-foreground">{brand.totalSales} продаж</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Топ товары</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {result.topProducts?.map((product: any, idx: number) => (
                      <div key={idx} className="p-2 border rounded">
                        <p className="font-medium text-sm">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.brand}</p>
                        <div className="flex justify-between mt-1">
                          <span className="text-sm font-bold">{product.price}₽</span>
                          <span className="text-xs">★ {product.rating} ({product.feedbacks})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Аналитика Wildberries</h2>
        <p className="text-muted-foreground">Мониторинг товаров и анализ категорий</p>
      </div>

      <Tabs defaultValue="monitor">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="monitor">
            <Package className="w-4 h-4 mr-2" />
            Мониторинг стока
          </TabsTrigger>
          <TabsTrigger value="category">
            <BarChart3 className="w-4 h-4 mr-2" />
            Анализ категории
          </TabsTrigger>
        </TabsList>

        <TabsContent value="monitor">
          <Card>
            <CardHeader>
              <CardTitle>Мониторинг изменений товаров</CardTitle>
              <CardDescription>
                Отслеживайте изменения цен и остатков товаров между двумя снимками
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="query">Поисковый запрос</Label>
                <Input
                  id="query"
                  placeholder="Например: смартфон"
                  value={stockQuery}
                  onChange={(e) => setStockQuery(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="limit">Лимит товаров</Label>
                  <Input
                    id="limit"
                    type="number"
                    value={stockLimit}
                    onChange={(e) => setStockLimit(Number(e.target.value))}
                    min={1}
                    max={100}
                  />
                </div>
                <div>
                  <Label htmlFor="interval">Интервал (секунды)</Label>
                  <Input
                    id="interval"
                    type="number"
                    value={stockInterval}
                    onChange={(e) => setStockInterval(Number(e.target.value))}
                    min={60}
                    max={3600}
                  />
                </div>
              </div>
              <Button
                onClick={startStockMonitoring}
                disabled={loading || !stockQuery.trim()}
                className="w-full"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Запустить мониторинг
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category">
          <Card>
            <CardHeader>
              <CardTitle>Анализ продаж категории</CardTitle>
              <CardDescription>
                Получите статистику по топ товарам и брендам в категории
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="url">URL категории или поисковый запрос</Label>
                <Input
                  id="url"
                  placeholder="https://www.wildberries.ru/catalog/... или просто 'ноутбуки'"
                  value={categoryUrl}
                  onChange={(e) => setCategoryUrl(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="categoryLimit">Лимит товаров</Label>
                <Input
                  id="categoryLimit"
                  type="number"
                  value={categoryLimit}
                  onChange={(e) => setCategoryLimit(Number(e.target.value))}
                  min={10}
                  max={200}
                />
              </div>
              <Button
                onClick={startCategoryAnalysis}
                disabled={loading || !categoryUrl.trim()}
                className="w-full"
              >
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Запустить анализ
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>История задач</CardTitle>
          <CardDescription>Все запущенные задачи и их результаты</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {tasks.map((task) => (
                <Card
                  key={task.id}
                  className="p-4 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold">
                        {task.task_type === 'search_stock' ? 'Мониторинг стока' : 'Анализ категории'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(task.created_at).toLocaleString('ru-RU')}
                      </p>
                    </div>
                    {getStatusBadge(task.status)}
                  </div>
                  {task.status === 'failed' && task.error_message && (
                    <p className="text-sm text-red-500 mt-2">{task.error_message}</p>
                  )}
                </Card>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {selectedTask && selectedTask.status === 'completed' && (
        <Card>
          <CardHeader>
            <CardTitle>Результаты задачи</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedTask(null)}
              className="absolute right-4 top-4"
            >
              Закрыть
            </Button>
          </CardHeader>
          <CardContent>
            {renderTaskResult(selectedTask)}
          </CardContent>
        </Card>
      )}
    </div>
  );
};