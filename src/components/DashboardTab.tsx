import { TrendingUp, Package, ShoppingCart, Users, AlertTriangle, DollarSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const DashboardTab = () => {
  const stats = [
    {
      title: 'Общая выручка',
      value: '₽1,245,890',
      change: '+12.5%',
      icon: DollarSign,
      trend: 'up',
      color: 'text-primary'
    },
    {
      title: 'Товаров в наличии',
      value: '1,234',
      change: '-3.2%',
      icon: Package,
      trend: 'down',
      color: 'text-secondary'
    },
    {
      title: 'Продажи сегодня',
      value: '89',
      change: '+8.1%',
      icon: ShoppingCart,
      trend: 'up',
      color: 'text-success'
    },
    {
      title: 'Активных сотрудников',
      value: '12',
      change: '0%',
      icon: Users,
      trend: 'neutral',
      color: 'text-muted-foreground'
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Панель управления</h2>
        <p className="text-muted-foreground mt-2">
          Обзор ключевых показателей вашего бизнеса
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
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
                <p className={`text-xs mt-1 ${
                  stat.trend === 'up' ? 'text-success' : 
                  stat.trend === 'down' ? 'text-destructive' : 
                  'text-muted-foreground'
                }`}>
                  {stat.change} от прошлого месяца
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
              Последние продажи
            </CardTitle>
            <CardDescription>Недавние транзакции в системе</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="font-medium">Товар #{i}</p>
                    <p className="text-sm text-muted-foreground">5 мин назад</p>
                  </div>
                  <span className="font-semibold">₽{(Math.random() * 1000 + 100).toFixed(2)}</span>
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
              <div className="flex gap-3 p-3 bg-warning/10 rounded-lg border border-warning/20">
                <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Низкий остаток товаров</p>
                  <p className="text-sm text-muted-foreground">8 товаров требуют пополнения</p>
                </div>
              </div>
              <div className="flex gap-3 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Истекающий срок годности</p>
                  <p className="text-sm text-muted-foreground">3 товара истекают в этом месяце</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
