import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Building2, 
  LogOut, FileText, AlertTriangle, Activity, Upload, Users, ArrowLeft, XCircle, UserPlus, WifiOff
} from 'lucide-react';
import { DashboardTab } from '@/components/DashboardTab';
import { CashierTab } from '@/components/CashierTab';
import { InventoryTab } from '@/components/InventoryTab';
import { SuppliersTab } from '@/components/SuppliersTab';
import { ReportsTab } from '@/components/ReportsTab';
import { LogsTab } from '@/components/LogsTab';
import { ExpiryTab } from '@/components/ExpiryTab';
import { EmployeesTab } from '@/components/EmployeesTab';
import { EmployeeWorkTab } from '@/components/EmployeeWorkTab';
import { CancellationsTab } from '@/components/CancellationsTab';
import { UserManagementTab } from '@/components/UserManagementTab';
import { AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getCurrentAuthUser, signOut, getUserRole, AppRole } from '@/lib/supabaseAuth';
import { supabase } from '@/integrations/supabase/client';
import { setupAutoSync, syncOfflineSales, isOnline } from '@/lib/offlineSync';

type Tab = 'dashboard' | 'inventory' | 'cashier' | 'suppliers' | 'reports' | 'expiry' | 'logs' | 'import' | 'employees' | 'photo-reports' | 'employee-work' | 'cancellations' | 'users';

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(isOnline());
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  useEffect(() => {
    checkAuth();
    
    // Подписка на изменения авторизации
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        loadUserRole(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUserRole(null);
        setLoading(false);
      }
    });

    // Настройка автосинхронизации
    setupAutoSync((result) => {
      toast.success(`Синхронизировано продаж: ${result.synced}`);
      if (result.failed > 0) {
        toast.error(`Ошибок синхронизации: ${result.failed}`);
      }
    });

    // Отслеживание состояния интернета
    const handleOnline = () => {
      setOnline(true);
      toast.success('Соединение восстановлено');
    };
    const handleOffline = () => {
      setOnline(false);
      toast.warning('Работа в офлайн-режиме');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkAuth = async () => {
    setLoading(true);
    const authUser = await getCurrentAuthUser();
    if (authUser?.user) {
      const role = await getUserRole(authUser.user.id);
      setUserRole(role);
      
      // Устанавливаем начальную вкладку
      if (role === 'admin') {
        setActiveTab('dashboard');
      } else if (role === 'cashier' || role === 'cashier2') {
        setActiveTab('cashier');
      } else if (role === 'inventory') {
        setActiveTab('inventory');
      } else {
        setActiveTab('employee-work');
      }
    }
    setLoading(false);
  };

  const loadUserRole = async (userId: string) => {
    const role = await getUserRole(userId);
    setUserRole(role);
    
    if (role === 'admin') {
      setActiveTab('dashboard');
    } else if (role === 'cashier' || role === 'cashier2') {
      setActiveTab('cashier');
    } else if (role === 'inventory') {
      setActiveTab('inventory');
    } else {
      setActiveTab('employee-work');
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUserRole(null);
    toast.info('Вы вышли из системы');
  };

  const handleBack = () => {
    const mainTabs: Record<AppRole, Tab> = { 
      admin: 'dashboard', 
      cashier: 'cashier', 
      cashier2: 'cashier', 
      inventory: 'inventory', 
      employee: 'employee-work' 
    };
    const mainTab = userRole ? mainTabs[userRole] : 'dashboard';
    
    if (activeTab !== mainTab) {
      setActiveTab(mainTab);
    } else {
      handleLogout();
    }
  };

  const handleManualSync = async () => {
    toast.loading('Синхронизация...');
    const result = await syncOfflineSales();
    toast.dismiss();
    
    if (result.synced > 0) {
      toast.success(`Синхронизировано продаж: ${result.synced}`);
    }
    if (result.failed > 0) {
      toast.error(`Ошибок синхронизации: ${result.failed}`);
    }
    if (result.synced === 0 && result.failed === 0) {
      toast.info('Нет данных для синхронизации');
    }
  };

  const tabs = [
    { id: 'dashboard' as Tab, label: 'Панель', icon: LayoutDashboard, roles: ['admin'] },
    { id: 'inventory' as Tab, label: 'Товары', icon: Package, roles: ['admin', 'inventory'] },
    { id: 'cashier' as Tab, label: 'Касса 1', icon: ShoppingCart, roles: ['admin', 'cashier'] },
    { id: 'cashier' as Tab, label: 'Касса 2', icon: ShoppingCart, roles: ['cashier2'] },
    { id: 'suppliers' as Tab, label: 'Поставщики', icon: Building2, roles: ['admin'] },
    { id: 'reports' as Tab, label: 'Отчёты', icon: FileText, roles: ['admin'] },
    { id: 'expiry' as Tab, label: 'Срок годности', icon: AlertTriangle, roles: ['admin', 'inventory'] },
    { id: 'employees' as Tab, label: 'Сотрудники', icon: Users, roles: ['admin'] },
    { id: 'users' as Tab, label: 'Пользователи', icon: UserPlus, roles: ['admin'] },
    { id: 'cancellations' as Tab, label: 'Отмены', icon: XCircle, roles: ['admin'] },
    { id: 'logs' as Tab, label: 'Логи', icon: Activity, roles: ['admin'] },
    { id: 'import' as Tab, label: 'Импорт', icon: Upload, roles: ['admin'] },
    { id: 'employee-work' as Tab, label: 'Мои задания', icon: Activity, roles: ['employee'] },
  ];

  const visibleTabs = tabs.filter(tab => 
    userRole && tab.roles.includes(userRole)
  );

  // Главная страница для неавторизованных пользователей
  if (!userRole && !loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-secondary/10">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            {/* Логотип и заголовок */}
            <div className="space-y-4">
              <Package className="h-24 w-24 text-primary mx-auto" />
              <h1 className="text-5xl font-bold">Система Учета Товаров</h1>
              <p className="text-xl text-muted-foreground">
                Современное решение для управления складом и продажами
              </p>
            </div>

            {/* Кнопка входа */}
            <div className="flex justify-center">
              <Button 
                size="lg" 
                className="text-lg px-8 py-6"
                onClick={() => setShowAuthDialog(true)}
              >
                Войти в систему
              </Button>
            </div>

            {/* Информационные секции */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-16">
              <div className="p-6 bg-card rounded-lg shadow-sm border">
                <Package className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Управление товарами</h3>
                <p className="text-muted-foreground">Полный контроль над складскими запасами</p>
              </div>
              
              <div className="p-6 bg-card rounded-lg shadow-sm border">
                <ShoppingCart className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Кассовые операции</h3>
                <p className="text-muted-foreground">Быстрая и удобная работа с кассой</p>
              </div>
              
              <div className="p-6 bg-card rounded-lg shadow-sm border">
                <FileText className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Отчетность</h3>
                <p className="text-muted-foreground">Детальная аналитика и отчеты</p>
              </div>
            </div>
          </div>
        </div>

        {/* Диалог входа */}
        {showAuthDialog && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-xl max-w-4xl w-full p-6 relative">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4"
                onClick={() => setShowAuthDialog(false)}
              >
                <XCircle className="h-5 w-5" />
              </Button>
              <AuthScreen onSuccess={() => {
                setShowAuthDialog(false);
                checkAuth();
              }} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Загрузка
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Package className="h-16 w-16 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-2 sm:px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Package className="h-6 w-6 sm:h-8 sm:w-8 text-primary flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold truncate">
                <span className="md:hidden">1С Аналог</span>
                <span className="hidden md:inline">Система Учета Товаров</span>
              </h1>
              <p className="text-xs text-muted-foreground hidden md:block">Управление складом и продажами</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {!online && (
              <Badge variant="destructive" className="hidden sm:flex">
                <WifiOff className="h-3 w-3 mr-1" />
                Офлайн
              </Badge>
            )}
            {(userRole === 'cashier' || userRole === 'cashier2') && (
              <Button variant="outline" size="sm" onClick={handleManualSync} disabled={!online} className="hidden sm:flex">
                Синхронизация
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={handleBack} title="Назад" className="h-8 w-8 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Выход" className="h-8 w-8 sm:h-10 sm:w-10">
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="border-b bg-card">
        <div className="container mx-auto px-4">
          <div className="flex overflow-x-auto">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 border-b-2 font-medium text-sm transition-colors whitespace-nowrap',
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 space-y-4">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'cashier' && <CashierTab />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'suppliers' && <SuppliersTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'expiry' && <ExpiryTab />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'employees' && <EmployeesTab />}
        {activeTab === 'users' && <UserManagementTab />}
        {activeTab === 'cancellations' && <CancellationsTab />}
        {activeTab === 'employee-work' && <EmployeeWorkTab employeeId="" />}
        {!['dashboard', 'cashier', 'inventory', 'suppliers', 'reports', 'expiry', 'logs', 'employees', 'users', 'employee-work', 'cancellations'].includes(activeTab) && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Раздел в разработке</h2>
            <p className="text-muted-foreground">
              Функционал "{visibleTabs.find(t => t.id === activeTab)?.label}" будет добавлен в следующих обновлениях
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
