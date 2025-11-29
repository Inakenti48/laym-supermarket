import { toast } from "sonner";
import { getAllFirebaseProducts } from "./firebaseProducts";
import { getSystemLogs, getSales, getCancellationRequests, getDevices } from "./firebaseCollections";
import { getSuppliers } from "./suppliersDb";

export const exportAllDatabaseData = async () => {
  try {
    toast.info("Начинаем экспорт данных...");

    // Получаем все данные из Firebase
    const [firebaseProducts, suppliers, sales, cancellations, logs, devices] = await Promise.all([
      getAllFirebaseProducts(),
      getSuppliers(),
      getSales(1000),
      getCancellationRequests(),
      getSystemLogs(1000),
      getDevices()
    ]);

    const backupData = {
      exportDate: new Date().toISOString(),
      dataSource: 'Firebase',
      products: firebaseProducts,
      suppliers: suppliers,
      sales: sales,
      cancellation_requests: cancellations,
      system_logs: logs,
      devices: devices,
      metadata: {
        totalProducts: firebaseProducts.length,
        totalSuppliers: suppliers.length,
        totalSales: sales.length,
        totalCancellations: cancellations.length,
        totalLogs: logs.length,
        totalDevices: devices.length,
      }
    };

    // Create and download JSON file
    const dataStr = JSON.stringify(backupData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `database-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`Экспорт завершен! Всего записей: ${backupData.metadata.totalProducts} товаров, ${backupData.metadata.totalSuppliers} поставщиков`);
    
    return backupData;
  } catch (error) {
    console.error('Error exporting database:', error);
    toast.error('Ошибка при экспорте данных');
    throw error;
  }
};

export const exportDatabaseAsSQL = async () => {
  try {
    toast.info("Создаем JSON дамп данных...");

    // Товары и все данные теперь в Firebase
    const [products, suppliers] = await Promise.all([
      getAllFirebaseProducts(),
      getSuppliers()
    ]);

    let jsonDump = {
      exportDate: new Date().toISOString(),
      note: 'All data is stored in Firebase',
      products: products,
      suppliers: suppliers
    };

    // Create and download JSON file
    const dataBlob = new Blob([JSON.stringify(jsonDump, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `database-backup-${new Date().toISOString().split('T')[0]}.json`;
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
