import { Database, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDatabaseMode } from '@/hooks/useDatabaseMode';
import { toast } from 'sonner';

export function DatabaseModeSwitch() {
  const { mode, toggleMode, isMySQL } = useDatabaseMode();

  const handleToggle = () => {
    toggleMode();
    toast.success(`Переключено на ${isMySQL ? 'PostgreSQL' : 'MySQL'}`, {
      description: 'Обновите страницу для загрузки данных'
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      className="gap-2"
    >
      <Database className="h-4 w-4" />
      <span>{isMySQL ? 'MySQL' : 'PostgreSQL'}</span>
      <RefreshCw className="h-3 w-3" />
    </Button>
  );
}
