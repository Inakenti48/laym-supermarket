import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Building2, 
  LogOut, FileText, AlertTriangle, Activity, Upload, Users 
} from 'lucide-react';
import { LoginScreen } from '@/components/LoginScreen';
import { DashboardTab } from '@/components/DashboardTab';
import { login, logout, getCurrentUser, UserRole } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Tab = 'dashboard' | 'inventory' | 'cashier' | 'suppliers' | 'reports' | 'expiry' | 'logs' | 'import' | 'employees';

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

  const handleLogin = (username: string, password: string) => {
    const success = login(username, password, loginRole);
    if (success) {
      setCurrentUser(getCurrentUser());
      setShowLogin(false);
      toast.success(`Добро пожаловать, ${username}!`);
    } else {
      toast.error('Неверные учетные данные');
    }
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setActiveTab('dashboard');
    toast.info('Вы вышли из системы');
  };

  const tabs = [
    { id: 'dashboard' as Tab, label: 'Панель', icon: LayoutDashboard, roles: ['admin', 'cashier', 'inventory'] },
    { id: 'inventory' as Tab, label: 'Товары', icon: Package, roles: ['admin', 'inventory'] },
    { id: 'cashier' as Tab, label: 'Касса', icon: ShoppingCart, roles: ['admin', 'cashier'] },
    { id: 'suppliers' as Tab, label: 'Поставщики', icon: Building2, roles: ['admin'] },
    { id: 'reports' as Tab, label: 'Отчеты', icon: FileText, roles: ['admin'] },
    { id: 'expiry' as Tab, label: 'Срок годности', icon: AlertTriangle, roles: ['admin', 'inventory'] },
    { id: 'logs' as Tab, label: 'Логи', icon: Activity, roles: ['admin'] },
    { id: 'import' as Tab, label: 'Импорт', icon: Upload, roles: ['admin'] },
    { id: 'employees' as Tab, label: 'Сотрудники', icon: Users, roles: ['admin'] },
  ];

  const visibleTabs = tabs.filter(tab => 
    !currentUser || tab.roles.includes(currentUser.role)
  );

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
          
          <div className="flex items-center gap-3">
            {!currentUser ? (
              <>
                <Button variant="outline" size="sm" onClick={() => handleLoginClick('admin')}>
                  Админ
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleLoginClick('cashier')}>
                  Кассир
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleLoginClick('inventory')}>
                  Склад
                </Button>
              </>
            ) : (
              <>
                <div className="text-right mr-2">
                  <p className="text-sm font-medium">{currentUser.username}</p>
                  <p className="text-xs text-muted-foreground capitalize">{currentUser.role}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={handleLogout} title="Выход">
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            )}
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
        {activeTab !== 'dashboard' && (
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
