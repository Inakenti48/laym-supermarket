import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload, Database, Loader2, ArrowRightLeft, ArrowRight, TableProperties } from "lucide-react";
import { exportAllDatabaseData, exportDatabaseAsSQL, importDatabaseFromJSON } from "@/lib/databaseBackup";
import { migrateAllToPostgres, migrateToExternalPG, migrateCloudToExternalPG } from "@/lib/databaseMigration";
import { createTables, testConnection } from "@/lib/externalPgDatabase";
import { toast } from "sonner";
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
  const [creating, setCreating] = useState(false);
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

  const handleCreateTablesAndMigrate = async () => {
    if (!confirm('Создать таблицы в External PG и перенести все данные из MySQL?')) return;
    
    setCreating(true);
    try {
      // Test connection first
      toast.info("Проверяем подключение к External PG...");
      const connected = await testConnection();
      
      if (!connected) {
        toast.error("Не удалось подключиться к External PostgreSQL. Проверьте настройки.");
        return;
      }
      
      toast.success("Подключение успешно!");
      
      // Create tables
      toast.info("Создаем таблицы...");
      const createResult = await createTables();
      
      if (!createResult.success) {
        toast.error(`Ошибка создания таблиц: ${createResult.error}`);
        return;
      }
      
      toast.success("Таблицы созданы!");
      
      // Now migrate data
      setMigrating(true);
      await migrateToExternalPG();
      
    } catch (error) {
      console.error('Error:', error);
      toast.error("Произошла ошибка");
    } finally {
      setCreating(false);
      setMigrating(false);
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
    if (!confirm('Скопировать все данные из MySQL в External PostgreSQL?')) return;
    
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

  const handleTestConnection = async () => {
    toast.info("Проверяем подключение...");
    const ok = await testConnection();
    if (ok) {
      toast.success("Подключение к External PG успешно!");
    } else {
      toast.error("Не удалось подключиться к External PG");
    }
  };

  const handleCreateTablesOnly = async () => {
    if (!confirm('Создать таблицы в External PostgreSQL?')) return;
    
    setCreating(true);
    try {
      toast.info("Создаем таблицы...");
      const result = await createTables();
      
      if (result.success) {
        toast.success("Таблицы созданы успешно!");
      } else {
        toast.error(`Ошибка: ${result.error}`);
      }
    } finally {
      setCreating(false);
    }
  };

  const isLoading = importing || migrating || creating;

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
            {creating ? "Создание..." : migrating ? "Миграция..." : importing ? "Импорт..." : "База данных"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
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
              <TableProperties className="h-4 w-4 mr-2" />
              External PG
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={handleTestConnection}>
                Проверить подключение
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateTablesOnly}>
                Создать таблицы
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleCreateTablesAndMigrate} className="text-primary font-medium">
                🚀 Создать + Миграция MySQL
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          
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
