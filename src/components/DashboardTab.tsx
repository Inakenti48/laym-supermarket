import { useState, useEffect } from 'react';
import { TrendingUp, Package, ShoppingCart, Users, AlertTriangle, DollarSign, Download, ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getAllProducts, getExpiringProducts, exportAllData } from '@/lib/storage';
import { getEmployees, getLogs } from '@/lib/auth';
import { toast } from 'sonner';
import { useProductsSync } from '@/hooks/useProductsSync';
import { supabase } from '@/integrations/supabase/client';

export const DashboardTab = () => {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [recentReturns, setRecentReturns] = useState<any[]>([]);
  
  // Realtime синхронизация товаров
  useProductsSync(() => {
    // При изменении товаров перезагружаем статистику
    setRefreshTrigger(prev => prev + 1);
  });

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
    const calculateStats = async () => {
      // ОПТИМИЗАЦИЯ: Получаем данные напрямую из Supabase с агрегацией
      const { data: products } = await supabase
        .from('products')
        .select('quantity, purchase_price, sale_price, expiry_date, paid_amount')
        .limit(1000);
      
      if (!products) return;
      
      const totalProducts = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
      const totalPurchaseCost = products.reduce((sum, p) => sum + ((p.purchase_price || 0) * (p.quantity || 0)), 0);

      // Подсчет товаров с низким остатком (менее 10 единиц)
      const lowStockCount = products.filter(p => (p.quantity || 0) < 10).length;

      // Истекающие товары (в течение 3 дней)
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      const expiringCount = products.filter(p => {
        if (!p.expiry_date) return false;
        const expiryDate = new Date(p.expiry_date);
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
        const paidAmount = p.paid_amount || 0;
        const purchasePrice = p.purchase_price || 1;
        const retailPrice = p.sale_price || 0;
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
    };

    const loadRecentReturns = async () => {
      try {
        const { data, error } = await supabase
          .from('product_returns')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        setRecentReturns(data || []);
      } catch (error) {
        console.error('Error loading returns:', error);
      }
    };

    calculateStats();
    loadRecentReturns();
    
    // Обновление каждые 30 секунд
    const interval = setInterval(() => {
      calculateStats();
      loadRecentReturns();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [refreshTrigger]); // Добавляем refreshTrigger как зависимость

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
        </div>
        <Button onClick={handleExport} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Скачать резервную копию
        </Button>
      </div>

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
