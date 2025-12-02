import { useState, useEffect } from 'react';
import { TrendingUp, Package, ShoppingCart, Users, AlertTriangle, DollarSign, Download, ArrowLeft, RefreshCw, Wifi, WifiOff, Bell, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAllProducts, getExpiringProducts } from '@/lib/storage';
import { getEmployees, getLogs } from '@/lib/auth';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useProductsSync } from '@/hooks/useProductsSync';
import { useAdminNotifications } from '@/hooks/useAdminNotifications';
import { Badge } from '@/components/ui/badge';
import { mysqlRequest, PendingProduct as MySQLPendingProduct } from '@/lib/mysqlDatabase';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const DashboardTab = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [pendingProducts, setPendingProducts] = useState<MySQLPendingProduct[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  
  // MySQL realtime синхронизация товаров
  const { products: firebaseProducts, loading: firebaseLoading, refetch } = useProductsSync();
  
  // Уведомления о новых товарах в очереди (для админа)
  const { queueCount, newItems } = useAdminNotifications();

  // Загрузка товаров из очереди
  const loadPendingProducts = async () => {
    setPendingLoading(true);
    try {
      const result = await mysqlRequest<MySQLPendingProduct[]>('get_pending_products');
      if (result.success && result.data) {
        setPendingProducts(result.data);
        console.log(`📋 Товаров в очереди: ${result.data.length}`);
      }
    } catch (error) {
      console.error('Ошибка загрузки очереди:', error);
    } finally {
      setPendingLoading(false);
    }
  };

  // Загружаем pending при монтировании и при обновлении
  useEffect(() => {
    loadPendingProducts();
  }, [refreshTrigger]);

  // Логирование количества товаров для дебага
  useEffect(() => {
    if (!firebaseLoading) {
      console.log(`📦 MySQL товаров загружено: ${firebaseProducts.length}`);
    }
  }, [firebaseProducts.length, firebaseLoading]);

  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalProductsCount: 0, // Количество уникальных товаров
    totalQuantity: 0, // Общее количество штук
    totalPurchaseCost: 0,
    salesToday: 0,
    activeEmployees: 0,
    lowStockCount: 0,
    expiringCount: 0,
  });

  // Расчёт статистики из загруженных товаров
  useEffect(() => {
    // Не считаем пока идёт загрузка
    if (firebaseLoading) {
      setIsLoading(true);
      return;
    }

    setIsLoading(true);
    setConnectionError(false);

    try {
      const products = firebaseProducts || [];
      
      console.log(`📊 Расчёт статистики: ${products.length} товаров из MySQL`);
      
      const totalProductsCount = products.length; // Уникальных товаров в базе
      const totalQuantity = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const totalPurchaseCost = products.reduce((sum, p) => sum + ((p.purchasePrice || 0) * (p.quantity || 0)), 0);

      // Подсчет товаров с низким остатком (менее 10 шт)
      const lowStockCount = products.filter(p => (p.quantity || 0) < 10 && (p.quantity || 0) > 0).length;

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

      // Потенциальная выручка
      const totalRevenue = products.reduce((sum, p) => {
        return sum + ((p.retailPrice || 0) * (p.quantity || 0));
      }, 0);

      setStats({
        totalRevenue,
        totalProductsCount,
        totalQuantity,
        totalPurchaseCost,
        salesToday,
        activeEmployees,
        lowStockCount,
        expiringCount,
      });

      setLastUpdate(new Date());
      setConnectionError(false);
    } catch (error: any) {
      console.error('❌ Error calculating stats:', error);
      setConnectionError(true);
    } finally {
      setIsLoading(false);
    }
  }, [firebaseProducts, firebaseLoading, refreshTrigger]);

  // Автообновление каждые 15 секунд
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🔄 Автообновление данных дашборда...');
      refetch();
    }, 15000);
    
    return () => clearInterval(interval);
  }, [refetch]);

  const handleManualRefresh = () => {
    refetch();
    loadPendingProducts();
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
      title: 'Товаров в базе',
      value: stats.totalProductsCount.toString(),
      description: `Всего ${stats.totalQuantity} шт. на складе`,
      icon: Package,
      color: 'text-secondary'
    },
    {
      title: 'В очереди',
      value: pendingProducts.length.toString(),
      description: 'Товаров ожидают проверки',
      icon: Bell,
      color: pendingProducts.length > 0 ? 'text-warning' : 'text-muted-foreground',
      highlight: pendingProducts.length > 0
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
    // Export all data to JSON
    const data = {
      products: firebaseProducts,
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
            <span>Ошибка загрузки данных. Попробуйте обновить.</span>
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

      {/* Товары - табы для базы и очереди */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Все товары ({firebaseProducts.length + pendingProducts.length})
          </CardTitle>
          <CardDescription>Товары в базе и в очереди на проверку</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="products" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="products" className="gap-2">
                <Package className="h-4 w-4" />
                В базе ({firebaseProducts.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="gap-2">
                <Clock className="h-4 w-4" />
                В очереди ({pendingProducts.length})
                {pendingProducts.length > 0 && (
                  <Badge variant="destructive" className="ml-1 text-xs">
                    {pendingProducts.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="products">
              {firebaseLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Загрузка товаров...
                </div>
              ) : firebaseProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Нет товаров в базе
                  {pendingProducts.length > 0 && (
                    <p className="text-sm mt-2">
                      Товары находятся в очереди ({pendingProducts.length} шт.)
                    </p>
                  )}
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
                          <TableCell className="text-right">₽{Number(product.purchasePrice || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">₽{Number(product.retailPrice || 0).toFixed(2)}</TableCell>
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
            </TabsContent>

            <TabsContent value="pending">
              {pendingLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Загрузка очереди...
                </div>
              ) : pendingProducts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Очередь пуста
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
                        <TableHead>Добавил</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingProducts.slice(0, 50).map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-mono text-xs">{product.barcode}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{product.name}</TableCell>
                          <TableCell className="text-muted-foreground">{product.category || '-'}</TableCell>
                          <TableCell className="text-right">
                            {product.purchase_price ? `₽${product.purchase_price}` : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {product.sale_price ? `₽${product.sale_price}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-medium">{product.quantity || 1}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {product.added_by || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {pendingProducts.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Показано 50 из {pendingProducts.length} товаров
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
