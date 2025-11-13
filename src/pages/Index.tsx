import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Building2, 
  LogOut, FileText, AlertTriangle, Activity, Upload, Users, ArrowLeft, XCircle, Settings
} from 'lucide-react';
import { DashboardTab } from '@/components/DashboardTab';
import { DatabaseBackupButton } from '@/components/DatabaseBackupButton';
import { CashierTab } from '@/components/CashierTab';
import { InventoryTab } from '@/components/InventoryTab';
import { SuppliersTab } from '@/components/SuppliersTab';
import { ReportsTab } from '@/components/ReportsTab';
import { LogsTab } from '@/components/LogsTab';
import { ExpiryTab } from '@/components/ExpiryTab';
import { DiagnosticsTab } from '@/components/DiagnosticsTab';
import { EmployeesTab } from '@/components/EmployeesTab';
import { EmployeeWorkTab } from '@/components/EmployeeWorkTab';
import { EmployeeLoginScreen } from '@/components/EmployeeLoginScreen';
import { CancellationsTab } from '@/components/CancellationsTab';
import { PendingProductsTab } from '@/components/PendingProductsTab';
import { RoleSelector } from '@/components/RoleSelector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@supabase/supabase-js';
import { AppRole, getUserRole } from '@/lib/supabaseAuth';
import { loginByUsername, getCurrentSession, getCurrentLoginUser, getCurrentLoginUserSync, logoutUser } from '@/lib/loginAuth';

type Tab = 'dashboard' | 'inventory' | 'cashier' | 'cashier2' | 'pending-products' | 'suppliers' | 'reports' | 'expiry' | 'diagnostics' | 'logs' | 'import' | 'employees' | 'photo-reports' | 'employee-work' | 'cancellations';

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [showEmployeeLogin, setShowEmployeeLogin] = useState(false);

  // Фильтруем табы в зависимости от роли
  const getTabsByRole = (): Array<{ id: Tab; label: string; icon: any; roles: string[] }> => {
    const allTabs = [
      { id: 'dashboard' as Tab, label: 'Панель', icon: LayoutDashboard, roles: ['admin'] },
      { id: 'inventory' as Tab, label: 'Товары', icon: Package, roles: ['admin', 'inventory'] },
      { id: 'cashier' as Tab, label: 'Касса 1', icon: ShoppingCart, roles: ['admin', 'cashier'] },
      { id: 'cashier2' as Tab, label: 'Касса 2', icon: ShoppingCart, roles: ['admin', 'cashier2'] },
      { id: 'pending-products' as Tab, label: 'Очередь товара', icon: Upload, roles: ['admin', 'inventory'] },
      { id: 'suppliers' as Tab, label: 'Поставщики', icon: Building2, roles: ['admin'] },
      { id: 'reports' as Tab, label: 'Отчёты', icon: FileText, roles: ['admin'] },
      { id: 'expiry' as Tab, label: 'Срок годности', icon: AlertTriangle, roles: ['admin'] },
      { id: 'diagnostics' as Tab, label: 'Диагностика', icon: Settings, roles: ['admin'] },
      { id: 'employees' as Tab, label: 'Сотрудники', icon: Users, roles: ['admin'] },
      { id: 'cancellations' as Tab, label: 'Отмены', icon: XCircle, roles: ['admin'] },
      { id: 'logs' as Tab, label: 'Логи', icon: Activity, roles: ['admin'] },
    ];

    if (!userRole) return [];
    return allTabs.filter(tab => tab.roles.includes(userRole));
  };

  const tabs = getTabsByRole();
  
  // Устанавливаем начальный таб - первый доступный для роли
  const getInitialTab = (): Tab => {
    if (!userRole) return 'dashboard';
    const availableTabs = getTabsByRole();
    return availableTabs.length > 0 ? availableTabs[0].id : 'dashboard';
  };

  const [activeTab, setActiveTab] = useState<Tab>(getInitialTab());

  useEffect(() => {
    // Проверка кастомной сессии (по логину)
    const checkSession = async () => {
      const session = await getCurrentSession();
      const loginUser = await getCurrentLoginUser();
      
      if (session && loginUser) {
        // Создаем фейковый User объект для совместимости
        const fakeUser = {
          id: loginUser.id,
          role: loginUser.role
        } as any;
        
        setUser(fakeUser);
        setUserRole(loginUser.role as AppRole);
      }
      
      setLoading(false);
    };
    
    checkSession();
  }, []);

  // Обновляем activeTab при изменении роли
  useEffect(() => {
    if (userRole) {
      const initialTab = getInitialTab();
      setActiveTab(initialTab);
    }
  }, [userRole]);

  // Больше не проверяем истечение сессии - сессия бессрочная до выхода

  const handleLogin = async (login: string) => {
    try {
      console.log('🔐 Начинаем вход с логином:', login);
      setLoading(true);
      
      const result = await loginByUsername(login);
      console.log('📊 Результат входа:', result);
      
      if (!result.success) {
        console.error('❌ Вход неуспешен:', result.error);
        toast.error(result.error || 'Ошибка входа');
        return;
      }

      // Используем данные напрямую из результата входа (без дополнительных запросов)
      if (result.userId && result.role) {
        console.log('✅ Вход успешен, устанавливаем пользователя:', {
          userId: result.userId,
          role: result.role
        });
        
        const fakeUser = {
          id: result.userId,
          role: result.role
        } as any;
        
        setUser(fakeUser);
        setUserRole(result.role as AppRole);
        toast.success('Вход выполнен успешно');
        console.log('🎉 Вход завершен, пользователь установлен');
      } else {
        console.error('❌ Отсутствуют userId или role в результате:', result);
        toast.error('Ошибка: данные пользователя не получены');
      }
    } catch (error: any) {
      console.error('💥 Login failed:', error);
      toast.error('Ошибка входа: ' + (error.message || 'неизвестная ошибка'));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    logoutUser();
    setUser(null);
    setUserRole(null);
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
            {activeTab === 'cashier' && <CashierTab cashierRole="cashier" />}
            {activeTab === 'cashier2' && <CashierTab cashierRole="cashier2" />}
            {activeTab === 'inventory' && <InventoryTab />}
            {activeTab === 'pending-products' && <PendingProductsTab />}
            {activeTab === 'suppliers' && <SuppliersTab />}
            {activeTab === 'reports' && <ReportsTab />}
            {activeTab === 'expiry' && <ExpiryTab />}
            {activeTab === 'diagnostics' && <DiagnosticsTab />}
            {activeTab === 'logs' && <LogsTab />}
            {activeTab === 'employees' && <EmployeesTab />}
            {activeTab === 'cancellations' && <CancellationsTab />}
            {!['dashboard', 'cashier', 'cashier2', 'inventory', 'pending-products', 'suppliers', 'reports', 'expiry', 'diagnostics', 'logs', 'employees', 'cancellations'].includes(activeTab) && (
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
