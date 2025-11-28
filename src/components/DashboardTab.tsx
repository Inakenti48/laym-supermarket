import { useState, useEffect } from 'react';
import { TrendingUp, Package, ShoppingCart, Users, AlertTriangle, DollarSign, Download, ArrowLeft, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAllProducts, getExpiringProducts, exportAllData } from '@/lib/storage';
import { getEmployees, getLogs } from '@/lib/auth';
import { toast } from 'sonner';
import { useProductsSync } from '@/hooks/useProductsSync';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useFirebaseProducts } from '@/hooks/useFirebaseProducts';

export const DashboardTab = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [recentReturns, setRecentReturns] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  
  // Firebase realtime синхронизация товаров
  const { products: firebaseProducts, loading: firebaseLoading } = useFirebaseProducts();
  
  // Realtime синхронизация товаров
  useProductsSync(() => {
    // При изменении товаров перезагружаем статистику
    setRefreshTrigger(prev => prev + 1);
  });

  // Перезагрузка при изменении Firebase товаров
  useEffect(() => {
    if (!firebaseLoading) {
      setRefreshTrigger(prev => prev + 1);
    }
  }, [firebaseProducts.length, firebaseLoading]);

  // Realtime подписка на изменения в возвратах (оставляем Supabase)
  useEffect(() => {
    console.log('🔔 Setting up realtime subscriptions...');

    const returnsChannel = supabase
      .channel('dashboard-returns-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_returns'
        },
        (payload) => {
          console.log('↩️ Returns change detected:', payload);
          setRefreshTrigger(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      console.log('🔕 Cleaning up realtime subscriptions...');
      supabase.removeChannel(returnsChannel);
    };
  }, []);

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalProducts: 0,
    totalPurchaseCost: 0,
    salesToday: 0,
    activeEmployees: 0,
    lowStockCount: 0,
    expiringCount: 0,
  });

  useEffect(() => {
    const calculateStats = async (retryCount = 0) => {
      try {
        setIsLoading(true);
        setConnectionError(false);

        // Используем Firebase товары из хука
        const products = firebaseProducts;
        
        if (firebaseLoading) {
          return; // Ждём загрузки
        }
      
      const totalProducts = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const totalPurchaseCost = products.reduce((sum, p) => sum + ((p.purchasePrice || 0) * (p.quantity || 0)), 0);

      // Подсчет товаров с низким остатком (менее 10 шт)
      const lowStockCount = products.filter(p => (p.quantity || 0) < 10).length;

      // Истекающие товары (в течение 3 дней)
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      const expiringCount = products.filter(p => {
        if (!p.expiryDate) return false;
        const expiryDate = new Date(p.expiryDate);
        return expiryDate <= threeDaysFromNow;
      }).length;

      // Активные сотрудники
      const employees = getEmployees();
      const activeEmployees = employees.length;

      // Продажи сегодня из логов
      const today = new Date().toLocaleDateString('ru-RU');
      const logs = getLogs();
      const salesToday = logs.filter(log => 
        log.timestamp.includes(today) && 
        (log.message.includes('Продажа:') || log.message.includes('Чек'))
      ).length;

      // Подсчет выручки из проданных товаров
      const totalRevenue = products.reduce((sum, p) => {
        const paidAmount = p.paidAmount || 0;
        const purchasePrice = p.purchasePrice || 1;
        const retailPrice = p.retailPrice || 0;
        return sum + (retailPrice * (paidAmount / purchasePrice));
      }, 0);

        setStats({
          totalRevenue,
          totalProducts,
          totalPurchaseCost,
          salesToday,
          activeEmployees,
          lowStockCount,
          expiringCount,
        });

        setLastUpdate(new Date());
        setConnectionError(false);
      } catch (error: any) {
        console.error('❌ Error loading stats:', error);
        
        // Retry logic - попробуем до 3 раз с задержкой
        if (retryCount < 3) {
          console.log(`🔄 Retry ${retryCount + 1}/3 after 2 seconds...`);
          setTimeout(() => {
            calculateStats(retryCount + 1);
          }, 2000);
          return;
        }

        setConnectionError(true);
        
        if (retryCount === 0) {
          toast.error('Нет связи с сервером. Повторная попытка...', {
            duration: 3000,
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    const loadRecentReturns = async (retryCount = 0) => {
      try {
        const { data, error } = await supabase
          .from('product_returns')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        setRecentReturns(data || []);
      } catch (error: any) {
        console.error('Error loading returns:', error);
        
        // Retry для возвратов
        if (retryCount < 3) {
          setTimeout(() => {
            loadRecentReturns(retryCount + 1);
          }, 2000);
        }
      }
    };

    calculateStats();
    loadRecentReturns();
    
    // Обновление каждые 30 секунд для онлайн-статистики
    const interval = setInterval(() => {
      calculateStats();
      loadRecentReturns();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [refreshTrigger]);

  const handleManualRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
    toast.info('Обновление данных...');
  };

  const statCards = [
    {
      title: 'Сумма закупа',
      value: `₽${stats.totalPurchaseCost.toLocaleString('ru-RU', { maximumFractionDigits: 0 })}`,
      description: 'Общая стоимость товаров на складе',
      icon: DollarSign,
      color: 'text-primary'
    },
    {
      title: 'Товаров в наличии',
      value: stats.totalProducts.toString(),
      description: `${stats.lowStockCount} товаров с низким остатком`,
      icon: Package,
      color: 'text-secondary'
    },
    {
      title: 'Продажи сегодня',
      value: stats.salesToday.toString(),
      description: 'Количество чеков за сегодня',
      icon: ShoppingCart,
      color: 'text-success'
    },
    {
      title: 'Активных сотрудников',
      value: stats.activeEmployees.toString(),
      description: 'Зарегистрировано в системе',
      icon: Users,
      color: 'text-muted-foreground'
    }
  ];

  const handleExport = () => {
    exportAllData();
    toast.success('Резервная копия успешно скачана');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Панель управления</h2>
          <p className="text-muted-foreground mt-2">
            Обзор ключевых показателей вашего бизнеса
          </p>
          {lastUpdate && !connectionError && (
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <Wifi className="h-3 w-3 text-green-500" />
              Обновлено: {lastUpdate.toLocaleTimeString('ru-RU')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleManualRefresh} 
            variant="outline" 
            className="gap-2"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
          <Button onClick={handleExport} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Резервная копия
          </Button>
        </div>
      </div>

      {/* Сообщение об ошибке подключения */}
      {connectionError && (
        <Alert variant="destructive">
          <WifiOff className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>Нет связи с сервером. Данные могут быть неактуальны.</span>
            <Button 
              onClick={handleManualRefresh} 
              variant="outline" 
              size="sm"
              disabled={isLoading}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Повторить
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs mt-1 text-muted-foreground">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Последние действия
            </CardTitle>
            <CardDescription>Недавние события в системе</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {getLogs().slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start justify-between border-b pb-3 last:border-0">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{log.message}</p>
                    <p className="text-xs text-muted-foreground">{log.user || 'Система'}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                    {new Date(log.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Предупреждения
            </CardTitle>
            <CardDescription>Требуют вашего внимания</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.lowStockCount > 0 && (
                <div className="flex gap-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
                  <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Низкий остаток товаров</p>
                    <p className="text-sm text-muted-foreground">
                      {stats.lowStockCount} {stats.lowStockCount === 1 ? 'товар требует' : 'товаров требуют'} пополнения
                    </p>
                  </div>
                </div>
              )}
              {stats.expiringCount > 0 && (
                <div className="flex gap-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Истекающий срок годности</p>
                    <p className="text-sm text-muted-foreground">
                      {stats.expiringCount} {stats.expiringCount === 1 ? 'товар истекает' : 'товаров истекают'} в ближайшие 3 дня
                    </p>
                  </div>
                </div>
              )}
              {stats.lowStockCount === 0 && stats.expiringCount === 0 && (
                <div className="flex gap-3 p-3 bg-success/10 rounded-lg border border-success/20">
                  <Package className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Всё в порядке</p>
                    <p className="text-sm text-muted-foreground">Нет критических предупреждений</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Firebase Products Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Товары из Firebase ({firebaseProducts.length})
          </CardTitle>
          <CardDescription>Все товары из базы данных Firebase</CardDescription>
        </CardHeader>
        <CardContent>
          {firebaseLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              Загрузка товаров...
            </div>
          ) : firebaseProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              Нет товаров в Firebase
            </div>
          ) : (
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Штрихкод</TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead className="text-right">Закуп</TableHead>
                    <TableHead className="text-right">Продажа</TableHead>
                    <TableHead className="text-right">Кол-во</TableHead>
                    <TableHead>Обновлено</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {firebaseProducts.slice(0, 50).map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-mono text-xs">{product.barcode}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{product.name}</TableCell>
                      <TableCell className="text-muted-foreground">{product.category || '-'}</TableCell>
                      <TableCell className="text-right">₽{product.purchasePrice?.toFixed(2) || '0'}</TableCell>
                      <TableCell className="text-right">₽{product.retailPrice?.toFixed(2) || '0'}</TableCell>
                      <TableCell className="text-right font-medium">{product.quantity || 0}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {product.lastUpdated ? new Date(product.lastUpdated).toLocaleDateString('ru-RU') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {firebaseProducts.length > 50 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Показано 50 из {firebaseProducts.length} товаров
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Returns Section */}
      {recentReturns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeft className="h-5 w-5 text-primary" />
              Последние возвраты
            </CardTitle>
            <CardDescription>История возвратов товара</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Товар</TableHead>
                  <TableHead>Количество</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Поставщик</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReturns.map((returnItem) => (
                  <TableRow key={returnItem.id}>
                    <TableCell>
                      {new Date(returnItem.created_at).toLocaleDateString('ru-RU')}
                    </TableCell>
                    <TableCell>{returnItem.product_name}</TableCell>
                    <TableCell>{returnItem.quantity}</TableCell>
                    <TableCell>
                      ₽{(returnItem.purchase_price * returnItem.quantity).toFixed(2)}
                    </TableCell>
                    <TableCell>{returnItem.supplier || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
