import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Database, Loader2, ArrowRightLeft, ArrowRight } from "lucide-react";
import { exportAllDatabaseData, exportDatabaseAsSQL, importDatabaseFromJSON } from "@/lib/databaseBackup";
import { migrateAllToPostgres, migrateToExternalPG, migrateCloudToExternalPG } from "@/lib/databaseMigration";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
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

  const handleMigrateToCloudPG = async () => {
    if (!confirm('Скопировать все данные из MySQL в Cloud PostgreSQL?')) return;
    
    setMigrating(true);
    try {
      await migrateAllToPostgres();
    } finally {
      setMigrating(false);
    }
  };

  const handleMigrateToExternalPG = async () => {
    if (!confirm('Скопировать все данные из MySQL в External PostgreSQL? Убедитесь что таблицы созданы.')) return;
    
    setMigrating(true);
    try {
      await migrateToExternalPG();
    } finally {
      setMigrating(false);
    }
  };

  const handleMigrateCloudToExternal = async () => {
    if (!confirm('Скопировать все данные из Cloud PG в External PostgreSQL?')) return;
    
    setMigrating(true);
    try {
      await migrateCloudToExternalPG();
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
        <DropdownMenuContent align="end" className="w-56">
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              Миграция данных
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={handleMigrateToCloudPG}>
                <ArrowRight className="h-4 w-4 mr-2" />
                MySQL → Cloud PG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleMigrateToExternalPG}>
                <ArrowRight className="h-4 w-4 mr-2" />
                MySQL → External PG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleMigrateCloudToExternal}>
                <ArrowRight className="h-4 w-4 mr-2" />
                Cloud PG → External PG
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
