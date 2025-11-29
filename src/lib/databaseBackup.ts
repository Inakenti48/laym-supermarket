import { toast } from "sonner";
import { getAllProducts, getAllSuppliers, getAllSales, getAllLogs, getCancellationRequests } from "./mysqlDatabase";

export const exportAllDatabaseData = async () => {
  try {
    toast.info("Начинаем экспорт данных из MySQL...");

    const [products, suppliers, sales, cancellations, logs] = await Promise.all([
      getAllProducts(),
      getAllSuppliers(),
      getAllSales(),
      getCancellationRequests(),
      getAllLogs()
    ]);

    const backupData = {
      exportDate: new Date().toISOString(),
      dataSource: 'MySQL',
      products: products,
      suppliers: suppliers,
      sales: sales,
      cancellation_requests: cancellations,
      system_logs: logs,
      metadata: {
        totalProducts: products.length,
        totalSuppliers: suppliers.length,
        totalSales: sales.length,
        totalCancellations: cancellations.length,
        totalLogs: logs.length,
      }
    };

    // Create and download JSON file
    const dataStr = JSON.stringify(backupData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mysql-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Экспорт завершен! ${backupData.metadata.totalProducts} товаров, ${backupData.metadata.totalSuppliers} поставщиков`);
    
    return backupData;
  } catch (error) {
    console.error('Error exporting database:', error);
    toast.error('Ошибка при экспорте данных');
    throw error;
  }
};

export const exportDatabaseAsSQL = async () => {
  try {
    toast.info("Создаем дамп данных из MySQL...");

    const [products, suppliers] = await Promise.all([
      getAllProducts(),
      getAllSuppliers()
    ]);

    const jsonDump = {
      exportDate: new Date().toISOString(),
      note: 'MySQL Database Dump',
      products: products,
      suppliers: suppliers
    };

    const dataBlob = new Blob([JSON.stringify(jsonDump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mysql-dump-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('Дамп данных создан успешно!');
  } catch (error) {
    console.error('Error creating dump:', error);
    toast.error('Ошибка при создании дампа');
    throw error;
  }
};
