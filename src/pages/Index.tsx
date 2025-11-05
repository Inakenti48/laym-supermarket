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
import { EmployeeLoginScreen } from '@/components/EmployeeLoginScreen';
import { CancellationsTab } from '@/components/CancellationsTab';
import { RoleSelector } from '@/components/RoleSelector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { isSessionExpired } from '@/lib/auth';

type Tab = 'dashboard' | 'inventory' | 'cashier' | 'suppliers' | 'reports' | 'expiry' | 'logs' | 'import' | 'employees' | 'photo-reports' | 'employee-work' | 'cancellations';

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [showEmployeeLogin, setShowEmployeeLogin] = useState(false);
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState<string>('');

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

  // Периодическая проверка истечения сессии (каждые 60 секунд)
  useEffect(() => {
    const checkSession = () => {
      if (user && isSessionExpired()) {
        console.log('⏰ Сессия истекла через 24 часа, автоматический выход');
        toast.info('Сессия истекла. Пожалуйста, войдите снова');
        handleLogout();
      }
    };

    // Проверяем сразу
    checkSession();

    // Проверяем каждую минуту
    const interval = setInterval(checkSession, 60000);

    return () => clearInterval(interval);
  }, [user]);

  // Обновление таймера оставшегося времени сессии
  useEffect(() => {
    const updateTimer = () => {
      const loginTimeStr = localStorage.getItem('last_login_time');
      if (!loginTimeStr) {
        setSessionTimeRemaining('');
        return;
      }

      const loginTime = parseInt(loginTimeStr);
      const currentTime = Date.now();
      const elapsed = currentTime - loginTime;
      const remaining = (24 * 60 * 60 * 1000) - elapsed; // 24 часа в миллисекундах

      if (remaining <= 0) {
        setSessionTimeRemaining('Истекла');
        return;
      }

      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      
      setSessionTimeRemaining(`${hours}ч ${minutes}м`);
    };

    // Обновляем сразу
    updateTimer();

    // Обновляем каждую минуту
    const interval = setInterval(updateTimer, 60000);

    return () => clearInterval(interval);
  }, [user]);

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
    setEmployeeId(null);
    setEmployeeName(null);
    setShowEmployeeLogin(false);
    toast.info('Вы вышли из системы');
  };

  const handleEmployeeLogin = (id: string, name: string) => {
    setEmployeeId(id);
    setEmployeeName(name);
    setShowEmployeeLogin(false);
    setActiveTab('employee-work');
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

  if (!user && !employeeId) {
    if (showEmployeeLogin) {
      return <EmployeeLoginScreen onLogin={handleEmployeeLogin} />;
    }
    return <RoleSelector onSelectRole={handleLogin} onEmployeeLogin={() => setShowEmployeeLogin(true)} />;
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
            {sessionTimeRemaining && (
              <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-muted/50 border border-border">
                <span className="text-xs text-muted-foreground">Сессия:</span>
                <span className="text-xs font-mono font-semibold">{sessionTimeRemaining}</span>
              </div>
            )}
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
        {employeeId ? (
          <EmployeeWorkTab employeeId={employeeId} />
        ) : (
          <>
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
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
