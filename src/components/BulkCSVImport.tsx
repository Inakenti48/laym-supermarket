import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { bulkImportFromCSV } from '@/lib/bulkImportCSV';

export const BulkCSVImport = () => {
  const [isImporting, setIsImporting] = useState(false);

  const handleBulkImport = async () => {
    if (isImporting) return;

    const confirmed = window.confirm(
      'Загрузить все товары из CSV файлов?\n\n' +
      '⚠️ Это загрузит ~3900 товаров из 4 файлов.\n' +
      'Процесс займет несколько минут.'
    );

    if (!confirmed) return;

    setIsImporting(true);
    
    try {
      const csvFiles = [
        '/data/products_part_1.csv',
        '/data/products_part_2.csv',
        '/data/products_part_3.csv',
        '/data/products_part_4.csv'
      ];

      let totalInserted = 0;
      let totalErrors = 0;

      for (let i = 0; i < csvFiles.length; i++) {
        toast.info(`Импорт файла ${i + 1} из ${csvFiles.length}...`);
        
        const result = await bulkImportFromCSV([csvFiles[i]]);
        
        totalInserted += result.inserted;
        totalErrors += result.errors;
        
        console.log(`✓ Файл ${i + 1}: загружено ${result.inserted} товаров`);
        
        // Небольшая задержка между файлами
        if (i < csvFiles.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      toast.success(
        `✅ Импорт завершен!\n` +
        `Загружено: ${totalInserted} товаров\n` +
        `Ошибок: ${totalErrors}`
      );

      // Перезагружаем страницу через 2 секунды
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error('Import error:', error);
      toast.error('Ошибка импорта товаров');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Button
      onClick={handleBulkImport}
      disabled={isImporting}
      variant="default"
      className="gap-2"
    >
      <Upload className="w-4 h-4" />
      {isImporting ? 'Загрузка...' : 'Загрузить все CSV'}
    </Button>
  );
};
