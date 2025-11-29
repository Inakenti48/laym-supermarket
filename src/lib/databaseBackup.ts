import { toast } from "sonner";
import { getAllProducts, getAllSuppliers, getAllSales, getAllLogs, getCancellationRequests, bulkInsertProducts, insertSupplier } from "./mysqlDatabase";

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

interface BackupData {
  products?: Array<{
    barcode: string;
    name: string;
    purchase_price?: number;
    selling_price?: number;
    quantity?: number;
    unit?: string;
    category?: string;
    supplier_id?: number;
    photo_url?: string;
    expiry_date?: string;
    created_by?: string;
  }>;
  suppliers?: Array<{
    name: string;
    phone?: string;
    address?: string;
  }>;
}

export const importDatabaseFromJSON = async (file: File) => {
  try {
    toast.info("Читаем файл резервной копии...");
    
    const text = await file.text();
    const data: BackupData = JSON.parse(text);
    
    let importedProducts = 0;
    let importedSuppliers = 0;
    let errors = 0;

    // Import suppliers first
    if (data.suppliers && data.suppliers.length > 0) {
      toast.info(`Импортируем ${data.suppliers.length} поставщиков...`);
      for (const supplier of data.suppliers) {
        try {
          await insertSupplier({
            name: supplier.name,
            phone: supplier.phone || '',
            address: supplier.address || ''
          });
          importedSuppliers++;
        } catch (err) {
          console.error('Error importing supplier:', err);
          errors++;
        }
      }
    }

    // Import products
    if (data.products && data.products.length > 0) {
      toast.info(`Импортируем ${data.products.length} товаров...`);
      
      // Batch insert products
      const productsToInsert = data.products.map(p => ({
        barcode: p.barcode,
        name: p.name,
        purchase_price: p.purchase_price || 0,
        selling_price: p.selling_price || 0,
        sale_price: p.selling_price || 0,
        quantity: p.quantity || 0,
        unit: p.unit || 'шт',
        category: p.category || '',
        supplier_id: p.supplier_id ? String(p.supplier_id) : null,
        photo_url: p.photo_url || null,
        expiry_date: p.expiry_date || null,
        created_by: p.created_by || 'import'
      }));

      try {
        const result = await bulkInsertProducts(productsToInsert);
        if (result.success) {
          importedProducts = productsToInsert.length;
        }
      } catch (err) {
        console.error('Bulk insert failed, trying one by one:', err);
        // If bulk fails, try one by one
        for (const product of productsToInsert) {
          try {
            await bulkInsertProducts([product]);
            importedProducts++;
          } catch (e) {
            errors++;
          }
        }
      }
    }

    toast.success(`Импорт завершен! Товаров: ${importedProducts}, Поставщиков: ${importedSuppliers}${errors > 0 ? `, Ошибок: ${errors}` : ''}`);
    
    // Reload page to show new data
    setTimeout(() => {
      window.location.reload();
    }, 1500);
    
  } catch (error) {
    console.error('Error importing database:', error);
    toast.error('Ошибка при импорте данных. Проверьте формат файла.');
    throw error;
  }
};
