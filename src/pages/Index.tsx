import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Building2, 
  LogOut, FileText, AlertTriangle, Activity, Upload, Users, ArrowLeft, XCircle
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
import { RoleSelector } from '@/components/RoleSelector';
import { LoginScreen } from '@/components/LoginScreen';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getCurrentUser, login, logout, UserRole } from '@/lib/auth';

type Tab = 'dashboard' | 'inventory' | 'cashier' | 'suppliers' | 'reports' | 'expiry' | 'logs' | 'import' | 'employees' | 'photo-reports' | 'employee-work' | 'cancellations';

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>('inventory');
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminClicks, setAdminClicks] = useState(0);
  
  // Создаем пользователя по умолчанию с полным доступом
  const [currentUser, setCurrentUser] = useState(() => {
    const existingUser = getCurrentUser();
    if (existingUser) return existingUser;
    
    // Создаем гостевого пользователя с доступом ко всем функциям кроме админских
    return {
      username: 'Гость',
      role: 'inventory' as UserRole,
      loginTime: new Date().toISOString()
    };
  });

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
      
      // Set initial tab based on role
      if (user.role === 'admin') {
        setActiveTab('dashboard');
      } else if (user.role === 'cashier' || user.role === 'cashier2') {
        setActiveTab('cashier');
      } else if (user.role === 'inventory') {
        setActiveTab('inventory');
      } else {
        setActiveTab('employee-work');
      }
    }
  }, []);

  // Скрытый вход для админа - тройной клик по логотипу
  const handleLogoClick = () => {
    const newClicks = adminClicks + 1;
    setAdminClicks(newClicks);
    
    if (newClicks >= 3) {
      setShowAdminLogin(true);
      setAdminClicks(0);
    }
    
    // Сброс счетчика через 2 секунды
    setTimeout(() => {
      setAdminClicks(0);
    }, 2000);
  };

  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role);
  };

  const handleLogin = async (username: string, role: UserRole, cashierName?: string) => {
    const success = await login(username, role, cashierName);
    if (success) {
      const user = getCurrentUser();
      setCurrentUser(user);
      setSelectedRole(null);
      setShowAdminLogin(false);
      
      // Set initial tab based on role after login
      if (user?.role === 'admin') {
        setActiveTab('dashboard');
      } else if (user?.role === 'cashier') {
        setActiveTab('cashier');
      } else if (user?.role === 'inventory') {
        setActiveTab('inventory');
      } else {
        setActiveTab('employee-work');
      }
      
      toast.success('Вход выполнен успешно');
    } else {
      toast.error('Неверный логин');
    }
  };

  const handleCancelLogin = () => {
    setSelectedRole(null);
    setShowAdminLogin(false);
  };

  const handleLogout = async () => {
    await logout();
    // Перезагружаем страницу для полного сброса состояния
    window.location.reload();
  };

  const handleBack = () => {
    const mainTabs = { admin: 'dashboard', cashier: 'cashier', cashier2: 'cashier', inventory: 'inventory', user: 'employee-work', employee: 'employee-work' };
    const mainTab = currentUser?.role ? mainTabs[currentUser.role as keyof typeof mainTabs] : 'dashboard';
    
    if (activeTab !== mainTab) {
      setActiveTab(mainTab as Tab);
    } else {
      handleLogout();
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
    { id: 'cancellations' as Tab, label: 'Отмены', icon: XCircle, roles: ['admin'] },
    { id: 'logs' as Tab, label: 'Логи', icon: Activity, roles: ['admin'] },
    { id: 'import' as Tab, label: 'Импорт', icon: Upload, roles: ['admin'] },
    { id: 'employee-work' as Tab, label: 'Мои задания', icon: Activity, roles: ['employee', 'user'] },
  ];

  const visibleTabs = tabs.filter(tab => 
    currentUser?.role && tab.roles.includes(currentUser.role)
  );

  // Показываем логин только для админа при тройном клике
  if (showAdminLogin && selectedRole) {
    return <LoginScreen role={selectedRole} onLogin={handleLogin} onCancel={handleCancelLogin} />;
  }

  if (showAdminLogin && !selectedRole) {
    return <RoleSelector onSelectRole={handleSelectRole} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-2 sm:px-4 h-16 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 sm:gap-3 min-w-0 cursor-pointer" 
            onClick={handleLogoClick}
            title={currentUser.role === 'admin' ? '' : 'Тройной клик для входа админа'}
          >
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
        {activeTab === 'cancellations' && <CancellationsTab />}
        {activeTab === 'employee-work' && 'employeeId' in currentUser && currentUser.employeeId && (
          <EmployeeWorkTab employeeId={currentUser.employeeId} />
        )}
        {!['dashboard', 'cashier', 'inventory', 'suppliers', 'reports', 'expiry', 'logs', 'employees', 'employee-work', 'cancellations'].includes(activeTab) && (
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
