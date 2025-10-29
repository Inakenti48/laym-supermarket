import { Button } from "@/components/ui/button";
import { Download, Database } from "lucide-react";
import { exportAllDatabaseData, exportDatabaseAsSQL } from "@/lib/databaseBackup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const DatabaseBackupButton = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Database className="h-4 w-4 mr-2" />
          Экспорт БД
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportAllDatabaseData}>
          <Download className="h-4 w-4 mr-2" />
          Экспорт в JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportDatabaseAsSQL}>
          <Download className="h-4 w-4 mr-2" />
          Экспорт в SQL
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
