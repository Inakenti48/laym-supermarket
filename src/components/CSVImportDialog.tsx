import { useState } from 'react';
import { Upload, X, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { importCSVProducts } from '@/lib/csvImport';
import { getCurrentLoginUser } from '@/lib/loginAuth';
import { toast } from 'sonner';

interface CSVImportDialogProps {
  onClose: () => void;
  onImportComplete: () => void;
}

export const CSVImportDialog = ({ onClose, onImportComplete }: CSVImportDialogProps) => {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const user = getCurrentLoginUser();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const importResult = await importCSVProducts(text, user.cashierName || 'admin');
      setResult(importResult);
      
      if (importResult.imported > 0) {
        toast.success(`Импортировано ${importResult.imported} товаров`);
        onImportComplete();
      }
      
      if (importResult.skipped > 0) {
        toast.info(`Пропущено дубликатов: ${importResult.skipped}`);
      }
      
      if (importResult.errors > 0) {
        toast.error(`Ошибок при импорте: ${importResult.errors}`);
      }
    } catch (error) {
      toast.error('Ошибка при чтении файла');
      console.error(error);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Импорт товаров из CSV</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="border-2 border-dashed border-primary/30 rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-primary" />
            <p className="text-sm text-muted-foreground mb-4">
              Выберите CSV файл с товарами
            </p>
            <label htmlFor="csv-upload">
              <Button variant="outline" disabled={importing} asChild>
                <span>
                  {importing ? 'Импорт...' : 'Выбрать файл'}
                </span>
              </Button>
            </label>
            <input
              id="csv-upload"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileUpload}
              disabled={importing}
            />
          </div>

          {result && (
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold mb-2">Результаты импорта:</h3>
              
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Импортировано: {result.imported}</span>
              </div>
              
              {result.skipped > 0 && (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">Пропущено дубликатов: {result.skipped}</span>
                </div>
              )}
              
              {result.errors > 0 && (
                <div className="flex items-center gap-2 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm">Ошибок: {result.errors}</span>
                </div>
              )}
            </Card>
          )}

          <div className="bg-primary/5 p-3 rounded-lg text-xs text-muted-foreground">
            <p className="font-semibold mb-1">Формат CSV:</p>
            <p>Код, Группа, Наименование, Ед. изм., Количество, Приходная цена, Розничная цена</p>
            <p className="mt-2">Товары с существующими штрихкодами будут пропущены.</p>
          </div>
        </div>
      </Card>
    </div>
  );
};
