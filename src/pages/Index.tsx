import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Building2, 
  LogOut, FileText, AlertTriangle, Activity, Upload, Users, ArrowLeft, XCircle
} from 'lucide-react';
import { DashboardTab } from '@/components/DashboardTab';
import { DatabaseBackupButton } from '@/components/DatabaseBackupButton';
import { CashierTab } from '@/components/CashierTab';
import { InventoryTab } from '@/components/InventoryTab';
import { SuppliersTab } from '@/components/SuppliersTab';
import { ReportsTab } from '@/components/ReportsTab';
import { LogsTab } from '@/components/LogsTab';
import { ExpiryTab } from '@/components/ExpiryTab';
import { EmployeesTab } from '@/components/EmployeesTab';
import { EmployeeWorkTab } from '@/components/EmployeeWorkTab';
import { CancellationsTab } from '@/components/CancellationsTab';
import { RoleSelector } from '@/components/RoleSelector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';

type Tab = 'dashboard' | 'inventory' | 'cashier' | 'suppliers' | 'reports' | 'expiry' | 'logs' | 'import' | 'employees' | 'photo-reports' | 'employee-work' | 'cancellations';

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Проверка текущей сессии
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Подписка на изменения авторизации
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      
      toast.success('Вход выполнен успешно');
    } catch (error: any) {
      toast.error('Ошибка входа: ' + error.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    toast.info('Вы вышли из системы');
  };

  const handleBack = () => {
    if (activeTab !== 'dashboard') {
      setActiveTab('dashboard');
    } else {
      handleLogout();
    }
  };

  const tabs = [
    { id: 'dashboard' as Tab, label: 'Панель', icon: LayoutDashboard },
    { id: 'inventory' as Tab, label: 'Товары', icon: Package },
    { id: 'cashier' as Tab, label: 'Касса', icon: ShoppingCart },
    { id: 'suppliers' as Tab, label: 'Поставщики', icon: Building2 },
    { id: 'reports' as Tab, label: 'Отчёты', icon: FileText },
    { id: 'expiry' as Tab, label: 'Срок годности', icon: AlertTriangle },
    { id: 'employees' as Tab, label: 'Сотрудники', icon: Users },
    { id: 'cancellations' as Tab, label: 'Отмены', icon: XCircle },
    { id: 'logs' as Tab, label: 'Логи', icon: Activity },
  ];

  // Показываем экран входа если не авторизован
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  if (!user) {
    return <RoleSelector onSelectRole={handleLogin} />;
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
            <DatabaseBackupButton />
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
            {tabs.map((tab) => {
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
        {activeTab === 'cancellations' && <CancellationsTab />}
        {!['dashboard', 'cashier', 'inventory', 'suppliers', 'reports', 'expiry', 'logs', 'employees', 'cancellations'].includes(activeTab) && (
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-2">Раздел в разработке</h2>
            <p className="text-muted-foreground">
              Функционал "{tabs.find(t => t.id === activeTab)?.label}" будет добавлен в следующих обновлениях
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
