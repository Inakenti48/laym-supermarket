import { Shield, ShoppingCart, Package, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppRole } from '@/lib/supabaseAuth';

interface RoleSelectorProps {
  onSelectRole: (login: string, password: string) => void;
  onEmployeeLogin: () => void;
}

const roles = [
  {
    login: '8080',
    password: '123456',
    title: 'Администратор',
    description: 'Полный доступ к системе',
    icon: Shield,
    color: 'text-primary'
  },
  {
    login: '1020',
    password: '123456',
    title: 'Касса 1',
    description: 'Работа с кассой',
    icon: ShoppingCart,
    color: 'text-secondary'
  },
  {
    login: '2030',
    password: '123456',
    title: 'Касса 2',
    description: 'Вторая касса',
    icon: ShoppingCart,
    color: 'text-green-500'
  },
  {
    login: '3040',
    password: '123456',
    title: 'Склад',
    description: 'Управление товарами',
    icon: Package,
    color: 'text-accent-foreground'
  }
];

export const RoleSelector = ({ onSelectRole, onEmployeeLogin }: RoleSelectorProps) => {
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
                key={roleInfo.login}
                className="cursor-pointer hover:shadow-lg transition-all hover:scale-105"
                onClick={() => onSelectRole(roleInfo.login, roleInfo.password)}
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

        <div className="mt-8 flex justify-center">
          <Button 
            onClick={onEmployeeLogin} 
            variant="outline"
            size="lg"
            className="w-full max-w-md h-14 text-base sm:text-lg font-semibold"
          >
            <Users className="h-5 w-5 sm:h-6 sm:w-6 mr-2" />
            Вход для сотрудников
          </Button>
        </div>
      </div>
    </div>
  );
};
