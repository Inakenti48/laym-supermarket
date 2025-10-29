import { Shield, ShoppingCart, Package, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserRole } from '@/lib/auth';

interface RoleSelectorProps {
  onSelectRole: (role: UserRole) => void;
}

const roles = [
  {
    role: 'admin' as UserRole,
    title: 'Администратор',
    description: 'Полный доступ к системе',
    icon: Shield,
    color: 'text-primary'
  },
  {
    role: 'cashier' as UserRole,
    title: 'Кассир',
    description: 'Работа с кассой',
    icon: ShoppingCart,
    color: 'text-secondary'
  },
  {
    role: 'inventory' as UserRole,
    title: 'Складской',
    description: 'Управление товарами',
    icon: Package,
    color: 'text-accent-foreground'
  },
  {
    role: 'employee' as UserRole,
    title: 'Сотрудник',
    description: 'Выполнение заданий',
    icon: User,
    color: 'text-muted-foreground'
  }
];

export const RoleSelector = ({ onSelectRole }: RoleSelectorProps) => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">Система Учета Товаров</h1>
          <p className="text-muted-foreground">Выберите роль для входа</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {roles.map((roleInfo) => {
            const Icon = roleInfo.icon;
            return (
              <Card
                key={roleInfo.role}
                className="cursor-pointer hover:shadow-lg transition-all hover:scale-105"
                onClick={() => onSelectRole(roleInfo.role)}
              >
                <CardHeader className="text-center">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <Icon className={`w-8 h-8 ${roleInfo.color}`} />
                  </div>
                  <CardTitle>{roleInfo.title}</CardTitle>
                  <CardDescription>{roleInfo.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
