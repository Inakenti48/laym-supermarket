import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Database, Loader2, ArrowRightLeft } from "lucide-react";
import { exportAllDatabaseData, exportDatabaseAsSQL, importDatabaseFromJSON } from "@/lib/databaseBackup";
import { migrateAllToPostgres } from "@/lib/databaseMigration";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export const DatabaseBackupButton = () => {
  const [importing, setImporting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      await importDatabaseFromJSON(file);
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleMigrateToPostgres = async () => {
    if (!confirm('Скопировать все данные из MySQL в PostgreSQL? Существующие данные в PostgreSQL будут обновлены.')) {
      return;
    }
    
    setMigrating(true);
    try {
      await migrateAllToPostgres();
    } finally {
      setMigrating(false);
    }
  };

  const isLoading = importing || migrating;

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        style={{ display: 'none' }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            {migrating ? "Миграция..." : importing ? "Импорт..." : "База данных"}
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleImportClick}>
            <Upload className="h-4 w-4 mr-2" />
            Импорт из JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleMigrateToPostgres}>
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            MySQL → PostgreSQL
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
