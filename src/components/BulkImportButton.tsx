import { useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { bulkImportAllProducts } from '@/lib/bulkImport';
import { getCurrentLoginUser } from '@/lib/loginAuth';
import { toast } from 'sonner';

export const BulkImportButton = () => {
  const [importing, setImporting] = useState(false);
  const user = getCurrentLoginUser();

  const handleBulkImport = async () => {
    if (!user) return;

    setImporting(true);
    toast.info('Начинаем массовый импорт товаров...');

    try {
      const result = await bulkImportAllProducts(user.username || 'admin');
      
      if (result.imported > 0) {
        toast.success(`✅ Успешно импортировано ${result.imported} товаров!`);
      }
      
      if (result.skipped > 0) {
        toast.info(`ℹ️ Пропущено дубликатов: ${result.skipped}`);
      }
      
      if (result.errors > 0) {
        toast.warning(`⚠️ Ошибок при импорте: ${result.errors}`);
      }

      if (result.imported === 0 && result.skipped === 0) {
        toast.error('Не удалось импортировать товары');
      }
    } catch (error) {
      toast.error('Ошибка массового импорта');
      console.error(error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Button 
      onClick={handleBulkImport} 
      disabled={importing}
      variant="default"
      className="gap-2"
    >
      {importing ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Импорт...
        </>
      ) : (
        <>
          <Database className="h-4 w-4" />
          Загрузить базу товаров
        </>
      )}
    </Button>
  );
};
