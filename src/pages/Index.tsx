import { useState, useEffect, lazy, Suspense, useCallback, useMemo } from 'react';
import { 
  LayoutDashboard, Package, ShoppingCart, Building2, 
  LogOut, FileText, AlertTriangle, Activity, Upload, Users, ArrowLeft, XCircle, Settings, Loader2, Database
} from 'lucide-react';
import { DatabaseBackupButton } from '@/components/DatabaseBackupButton';
import { EmployeeLoginScreen } from '@/components/EmployeeLoginScreen';
import { RoleSelector } from '@/components/RoleSelector';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { loginWithFirebase, logoutFirebase, getCurrentSession, AppRole, AppSession } from '@/lib/firebase';
import { initLocalMode, initAllLocalSystems, isLocalOnlyMode } from '@/lib/localOnlyMode';
import { enableFirebaseSync, getAllFirebaseProducts, getFirebaseStatus } from '@/lib/firebaseProducts';

// Ленивая загрузка компонентов для быстрого старта
const DashboardTab = lazy(() => import('@/components/DashboardTab').then(m => ({ default: m.DashboardTab })));
const CashierTab = lazy(() => import('@/components/CashierTab').then(m => ({ default: m.CashierTab })));
const InventoryTab = lazy(() => import('@/components/InventoryTab').then(m => ({ default: m.InventoryTab })));
const SuppliersTab = lazy(() => import('@/components/SuppliersTab').then(m => ({ default: m.SuppliersTab })));
const ReportsTab = lazy(() => import('@/components/ReportsTab').then(m => ({ default: m.ReportsTab })));
const LogsTab = lazy(() => import('@/components/LogsTab').then(m => ({ default: m.LogsTab })));
const ExpiryTab = lazy(() => import('@/components/ExpiryTab').then(m => ({ default: m.ExpiryTab })));
const DiagnosticsTab = lazy(() => import('@/components/DiagnosticsTab').then(m => ({ default: m.DiagnosticsTab })));
const EmployeesTab = lazy(() => import('@/components/EmployeesTab').then(m => ({ default: m.EmployeesTab })));
const EmployeeWorkTab = lazy(() => import('@/components/EmployeeWorkTab').then(m => ({ default: m.EmployeeWorkTab })));
const CancellationsTab = lazy(() => import('@/components/CancellationsTab').then(m => ({ default: m.CancellationsTab })));
const PendingProductsTab = lazy(() => import('@/components/PendingProductsTab').then(m => ({ default: m.PendingProductsTab })));

// Компонент загрузки
const TabLoader = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

type Tab = 'dashboard' | 'inventory' | 'cashier' | 'cashier2' | 'pending-products' | 'suppliers' | 'reports' | 'expiry' | 'diagnostics' | 'logs' | 'employees' | 'employee-work' | 'cancellations';

// Данные табов вынесены за компонент для оптимизации
const ALL_TABS_DATA = [
  { id: 'dashboard' as Tab, label: 'Панель', icon: LayoutDashboard, roles: ['admin'] },
  { id: 'inventory' as Tab, label: 'Товары', icon: Package, roles: ['admin', 'inventory', 'system'] },
  { id: 'cashier' as Tab, label: 'Касса 1', icon: ShoppingCart, roles: ['admin', 'cashier'] },
  { id: 'cashier2' as Tab, label: 'Касса 2', icon: ShoppingCart, roles: ['admin', 'cashier2'] },
  { id: 'pending-products' as Tab, label: 'Очередь', icon: Upload, roles: ['admin', 'inventory'] },
  { id: 'suppliers' as Tab, label: 'Поставщики', icon: Building2, roles: ['admin'] },
  { id: 'reports' as Tab, label: 'Отчёты', icon: FileText, roles: ['admin'] },
  { id: 'expiry' as Tab, label: 'Сроки', icon: AlertTriangle, roles: ['admin'] },
  { id: 'diagnostics' as Tab, label: 'Настройки', icon: Settings, roles: ['admin'] },
  { id: 'employees' as Tab, label: 'Сотрудники', icon: Users, roles: ['admin'] },
  { id: 'cancellations' as Tab, label: 'Отмены', icon: XCircle, roles: ['admin'] },
  { id: 'logs' as Tab, label: 'Логи', icon: Activity, roles: ['admin'] },
];

const ROLE_TO_TAB: Record<string, Tab> = {
  'admin': 'dashboard',
  'cashier': 'cashier',
  'cashier2': 'cashier2',
  'inventory': 'inventory',
  'system': 'inventory'
};

const Index = () => {
  const [session, setSession] = useState<AppSession | null>(() => getCurrentSession());
  const [userRole, setUserRole] = useState<AppRole | null>(() => getCurrentSession()?.role || null);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [showEmployeeLogin, setShowEmployeeLogin] = useState(false);
  const [localMode, setLocalMode] = useState(() => initLocalMode());
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const s = getCurrentSession();
    return s ? (ROLE_TO_TAB[s.role] || 'dashboard') : 'dashboard';
  });

  // Инициализация Firebase синхронизации
  useEffect(() => {
    const initFirebase = async () => {
      // Включаем Firebase синхронизацию
      enableFirebaseSync();
      
      try {
        // Пробуем загрузить товары для проверки подключения
        const products = await getAllFirebaseProducts();
        const status = getFirebaseStatus();
        console.log(`🔥 Firebase ${status.mode}: загружено ${products.length} товаров`);
        toast.success(`🔥 ${status.message} (${products.length} товаров)`, { duration: 2000 });
      } catch (error) {
        console.warn('⚠️ Firebase недоступен:', error);
        toast.warning('📦 Работаем в локальном режиме', { duration: 2000 });
      }
    };

    initFirebase();
    
    if (localMode) {
      initAllLocalSystems().catch(console.error);
    }
  }, []);

  // Мемоизация табов
  const tabs = useMemo(() => {
    if (!userRole) return [];
    return ALL_TABS_DATA.filter(tab => tab.roles.includes(userRole));
  }, [userRole]);

  // Быстрый вход
  const handleLogin = useCallback(async (login: string) => {
    setLoading(true);
    
    const result = await loginWithFirebase(login);
    
    if (result.success && result.session) {
      setSession(result.session);
      setUserRole(result.session.role);
      setActiveTab(ROLE_TO_TAB[result.session.role] || 'dashboard');
      toast.success(`${result.userName || 'Добро пожаловать!'}`);
    } else {
      toast.error(result.error || 'Неверный логин');
    }
    
    setLoading(false);
  }, []);

  // Быстрый выход
  const handleLogout = useCallback(async () => {
    setSession(null);
    setUserRole(null);
    setEmployeeId(null);
    setShowEmployeeLogin(false);
    logoutFirebase(); // Фоновое выполнение
    toast.info('Выход');
  }, []);

  const handleEmployeeLogin = useCallback((id: string, name: string) => {
    setEmployeeId(id);
    setShowEmployeeLogin(false);
    setActiveTab('employee-work');
  }, []);

  const handleBack = useCallback(() => {
    if (activeTab !== 'dashboard' && userRole === 'admin') {
      setActiveTab('dashboard');
    } else {
      handleLogout();
    }
  }, [activeTab, userRole, handleLogout]);

  // Экран загрузки
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Экран входа
  if (!session && !employeeId) {
    if (showEmployeeLogin) {
      return <EmployeeLoginScreen onLogin={handleEmployeeLogin} />;
    }
    return <RoleSelector onSelectRole={handleLogin} onEmployeeLogin={() => setShowEmployeeLogin(true)} />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card shadow-sm sticky top-0 z-40">
        <div className="container mx-auto px-2 sm:px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Package className="h-6 w-6 text-primary flex-shrink-0" />
            <h1 className="text-base font-bold truncate">Учет товаров</h1>
            {localMode && (
              <span className="flex items-center gap-1 text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded-full">
                <Database className="h-3 w-3" />
                Firebase
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1 flex-shrink-0">
            <DatabaseBackupButton />
            <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="h-8 w-8">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b bg-card overflow-x-auto">
        <div className="container mx-auto px-2 flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2.5 border-b-2 text-sm transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4">
        <Suspense fallback={<TabLoader />}>
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
            </>
          )}
        </Suspense>
      </main>
    </div>
  );
};

export default Index;
