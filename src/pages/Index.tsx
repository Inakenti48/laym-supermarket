import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Building2, 
  LogOut, FileText, AlertTriangle, Activity, Upload, Users, ArrowLeft, XCircle
} from 'lucide-react';
import { LoginScreen } from '@/components/LoginScreen';
import { DashboardTab } from '@/components/DashboardTab';
import { CashierTab } from '@/components/CashierTab';
import { InventoryTab } from '@/components/InventoryTab';
import { LogsTab } from '@/components/LogsTab';
import { ExpiryTab } from '@/components/ExpiryTab';
import { EmployeesTab } from '@/components/EmployeesTab';
import { EmployeeWorkTab } from '@/components/EmployeeWorkTab';
import { PhotoReportsTab } from '@/components/PhotoReportsTab';
import { CancellationsTab } from '@/components/CancellationsTab';
import { login, logout, getCurrentUser, UserRole } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Tab = 'dashboard' | 'inventory' | 'cashier' | 'suppliers' | 'reports' | 'expiry' | 'logs' | 'import' | 'employees' | 'photo-reports' | 'employee-work' | 'cancellations';

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [showLogin, setShowLogin] = useState(false);
  const [loginRole, setLoginRole] = useState<UserRole>('admin');
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  const handleLoginClick = (role: UserRole) => {
    setLoginRole(role);
    setShowLogin(true);
  };

  const handleLogin = async (username: string, role: UserRole, cashierName?: string) => {
    const success = await login(username, role, cashierName);
    if (success) {
      setCurrentUser(getCurrentUser());
      setShowLogin(false);
      setLoginRole(undefined);
      toast.success('Вход выполнен успешно');
      
      // Set active tab based on role
      if (role === 'admin') {
        setActiveTab('dashboard');
      } else if (role === 'cashier') {
        setActiveTab('cashier');
      } else if (role === 'inventory') {
        setActiveTab('inventory');
      } else if (role === 'employee') {
        setActiveTab('employee-work');
      }
    } else {
      toast.error('Неверные учетные данные');
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setActiveTab('dashboard');
    setShowLogin(false);
    setLoginRole(undefined);
    toast.info('Вы вышли из системы');
  };

  const handleBack = () => {
    // Go back to previous tab or logout if on main screen
    if (activeTab !== 'dashboard' && activeTab !== 'cashier' && activeTab !== 'inventory' && activeTab !== 'employee-work') {
      setActiveTab(currentUser?.role === 'admin' ? 'dashboard' : 
                   currentUser?.role === 'cashier' ? 'cashier' : 
                   currentUser?.role === 'inventory' ? 'inventory' : 'employee-work');
    } else {
      handleLogout();
    }
  };

  const tabs = [
    { id: 'dashboard' as Tab, label: 'Панель', icon: LayoutDashboard, roles: ['admin', 'cashier', 'inventory'] },
    { id: 'inventory' as Tab, label: 'Товары', icon: Package, roles: ['admin', 'inventory'] },
    { id: 'cashier' as Tab, label: 'Касса', icon: ShoppingCart, roles: ['admin', 'cashier'] },
    { id: 'suppliers' as Tab, label: 'Поставщики', icon: Building2, roles: ['admin'] },
    { id: 'reports' as Tab, label: 'Отчеты', icon: FileText, roles: ['admin'] },
    { id: 'expiry' as Tab, label: 'Срок годности', icon: AlertTriangle, roles: ['admin', 'inventory'] },
    { id: 'employees' as Tab, label: 'Сотрудники', icon: Users, roles: ['admin'] },
    { id: 'photo-reports' as Tab, label: 'Фотоотчёты', icon: FileText, roles: ['admin'] },
    { id: 'cancellations' as Tab, label: 'Отмены', icon: XCircle, roles: ['admin'] },
    { id: 'logs' as Tab, label: 'Логи', icon: Activity, roles: ['admin'] },
    { id: 'import' as Tab, label: 'Импорт', icon: Upload, roles: ['admin'] },
    { id: 'employee-work' as Tab, label: 'Мои задания', icon: Activity, roles: ['employee'] },
  ];

  const visibleTabs = tabs.filter(tab => 
    !currentUser || tab.roles.includes(currentUser.role)
  );

  // Требуем авторизацию для всего приложения
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-background">
        {showLogin ? (
          <LoginScreen
            role={loginRole}
            onLogin={handleLogin}
            onCancel={() => setShowLogin(false)}
          />
        ) : (
          <div className="flex items-center justify-center min-h-screen">
            <Card className="p-8 max-w-md w-full mx-4">
              <div className="text-center mb-6">
                <Package className="h-16 w-16 text-primary mx-auto mb-4" />
                <h1 className="text-2xl font-bold mb-2">Система Учета Товаров</h1>
                <p className="text-muted-foreground">Выберите роль для входа</p>
              </div>
              <div className="space-y-3">
                <Button 
                  variant="outline" 
                  className="w-full h-12 text-base" 
                  onClick={() => handleLoginClick('admin')}
                >
                  <LayoutDashboard className="h-5 w-5 mr-2" />
                  Войти как Админ
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full h-12 text-base" 
                  onClick={() => handleLoginClick('cashier')}
                >
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  Войти как Кассир
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full h-12 text-base" 
                  onClick={() => handleLoginClick('inventory')}
                >
                  <Package className="h-5 w-5 mr-2" />
                  Войти как Склад
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full h-12 text-base" 
                  onClick={() => handleLoginClick('employee')}
                >
                  <Users className="h-5 w-5 mr-2" />
                  Работа
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {showLogin && (
        <LoginScreen
          role={loginRole}
          onLogin={handleLogin}
          onCancel={() => setShowLogin(false)}
        />
      )}

      {/* Header */}
      <header className="border-b bg-card shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Система Учета Товаров</h1>
              <p className="text-xs text-muted-foreground">Управление складом и продажами</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleBack} title="Назад">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="text-right mr-2">
              <p className="text-sm font-medium">{currentUser.cashierName || currentUser.username}</p>
              <p className="text-xs text-muted-foreground capitalize">{currentUser.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Выход">
              <LogOut className="h-5 w-5" />
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
      <main className="container mx-auto px-4 py-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'cashier' && <CashierTab />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'expiry' && <ExpiryTab />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'employees' && <EmployeesTab />}
        {activeTab === 'photo-reports' && <PhotoReportsTab />}
        {activeTab === 'cancellations' && <CancellationsTab />}
        {activeTab === 'employee-work' && currentUser.employeeId && (
          <EmployeeWorkTab employeeId={currentUser.employeeId} />
        )}
        {!['dashboard', 'cashier', 'inventory', 'expiry', 'logs', 'employees', 'photo-reports', 'employee-work', 'cancellations'].includes(activeTab) && (
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
