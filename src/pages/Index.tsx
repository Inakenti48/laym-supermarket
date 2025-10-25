import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Building2, 
  LogOut, FileText, AlertTriangle, Activity, Upload, Users, ArrowLeft, XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/lib/useAuth';

type Tab = 'dashboard' | 'inventory' | 'cashier' | 'suppliers' | 'reports' | 'expiry' | 'logs' | 'import' | 'employees' | 'photo-reports' | 'employee-work' | 'cancellations';

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const { user, userRole, loading, logout: authLogout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    // Set initial tab based on role
    if (userRole) {
      if (userRole === 'admin') {
        setActiveTab('dashboard');
      } else if (userRole === 'cashier') {
        setActiveTab('cashier');
      } else if (userRole === 'inventory') {
        setActiveTab('inventory');
      } else {
        setActiveTab('employee-work');
      }
    }
  }, [userRole]);

  const handleLogout = () => {
    authLogout();
    toast.info('Вы вышли из системы');
  };

  const handleBack = () => {
    // Go back to previous tab or logout if on main screen
    const mainTabs = { admin: 'dashboard', cashier: 'cashier', inventory: 'inventory', user: 'employee-work', employee: 'employee-work' };
    const mainTab = userRole ? mainTabs[userRole as keyof typeof mainTabs] : 'dashboard';
    
    if (activeTab !== mainTab) {
      setActiveTab(mainTab as Tab);
    } else {
      handleLogout();
    }
  };

  const tabs = [
    { id: 'dashboard' as Tab, label: 'Панель', icon: LayoutDashboard, roles: ['admin'] },
    { id: 'inventory' as Tab, label: 'Товары', icon: Package, roles: ['admin', 'inventory'] },
    { id: 'cashier' as Tab, label: 'Касса', icon: ShoppingCart, roles: ['admin', 'cashier'] },
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
    userRole && tab.roles.includes(userRole)
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
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
              <p className="text-sm font-medium">{user?.email || 'Пользователь'}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {userRole === 'admin' ? 'Администратор' :
                 userRole === 'cashier' ? 'Кассир' :
                 userRole === 'inventory' ? 'Склад' :
                 'Сотрудник'}
              </p>
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
        {activeTab === 'suppliers' && <SuppliersTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'expiry' && <ExpiryTab />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'employees' && <EmployeesTab />}
        {activeTab === 'cancellations' && <CancellationsTab />}
        {activeTab === 'employee-work' && user?.id && (
          <EmployeeWorkTab employeeId={user.id} />
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
