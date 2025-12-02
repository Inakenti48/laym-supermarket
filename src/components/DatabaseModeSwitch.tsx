import { Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDatabaseMode } from '@/hooks/useDatabaseMode';
import { toast } from 'sonner';
import { getDatabaseLabel, DatabaseMode } from '@/lib/databaseMode';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function DatabaseModeSwitch() {
  const { mode, switchTo } = useDatabaseMode();

  const handleSwitch = (newMode: DatabaseMode) => {
    switchTo(newMode);
    toast.success(`Переключено на ${getDatabaseLabel(newMode)}`, {
      description: 'Обновите страницу для загрузки данных'
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Database className="h-4 w-4" />
          {getDatabaseLabel(mode)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem 
          onClick={() => handleSwitch('mysql')}
          className={mode === 'mysql' ? 'bg-accent' : ''}
        >
          MySQL
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleSwitch('postgresql')}
          className={mode === 'postgresql' ? 'bg-accent' : ''}
        >
          Cloud PostgreSQL
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={() => handleSwitch('external_pg')}
          className={mode === 'external_pg' ? 'bg-accent' : ''}
        >
          External PostgreSQL
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
