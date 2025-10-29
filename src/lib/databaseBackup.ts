import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const exportAllDatabaseData = async () => {
  try {
    toast.info("Начинаем экспорт данных...");

    // Fetch all data from all tables
    const [productsRes, suppliersRes, employeesRes, salesRes, cancellationsRes, logsRes, profilesRes, userRolesRes] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('suppliers').select('*'),
      supabase.from('employees').select('*'),
      supabase.from('sales').select('*'),
      supabase.from('cancellation_requests').select('*'),
      supabase.from('system_logs').select('*'),
      supabase.from('profiles').select('*'),
      supabase.from('user_roles').select('*'),
    ]);

    const backupData = {
      exportDate: new Date().toISOString(),
      products: productsRes.data || [],
      suppliers: suppliersRes.data || [],
      employees: employeesRes.data || [],
      sales: salesRes.data || [],
      cancellation_requests: cancellationsRes.data || [],
      system_logs: logsRes.data || [],
      profiles: profilesRes.data || [],
      user_roles: userRolesRes.data || [],
      metadata: {
        totalProducts: (productsRes.data || []).length,
        totalSuppliers: (suppliersRes.data || []).length,
        totalEmployees: (employeesRes.data || []).length,
        totalSales: (salesRes.data || []).length,
        totalCancellations: (cancellationsRes.data || []).length,
        totalLogs: (logsRes.data || []).length,
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
    toast.info("Создаем SQL дамп...");

    const { data: products } = await supabase.from('products').select('*');
    const { data: suppliers } = await supabase.from('suppliers').select('*');
    const { data: employees } = await supabase.from('employees').select('*');

    let sqlDump = `-- Database Backup - ${new Date().toISOString()}\n\n`;

    // Products
    if (products && products.length > 0) {
      sqlDump += `-- Products (${products.length} records)\n`;
      products.forEach(p => {
        const values = [
          `'${p.id}'`,
          `'${p.barcode}'`,
          `'${p.name?.replace(/'/g, "''")}'`,
          `'${p.category}'`,
          p.purchase_price,
          p.sale_price,
          p.quantity,
          p.expiry_date ? `'${p.expiry_date}'` : 'NULL',
          `'${p.unit}'`,
          p.supplier ? `'${p.supplier.replace(/'/g, "''")}'` : 'NULL',
          p.paid_amount,
          p.debt_amount,
          `'${p.payment_type}'`,
          `'${JSON.stringify(p.price_history || []).replace(/'/g, "''")}'`,
          p.created_by ? `'${p.created_by}'` : 'NULL',
          `'${p.created_at}'`,
          `'${p.updated_at}'`
        ].join(', ');
        sqlDump += `INSERT INTO products (id, barcode, name, category, purchase_price, sale_price, quantity, expiry_date, unit, supplier, paid_amount, debt_amount, payment_type, price_history, created_by, created_at, updated_at) VALUES (${values});\n`;
      });
      sqlDump += '\n';
    }

    // Suppliers
    if (suppliers && suppliers.length > 0) {
      sqlDump += `-- Suppliers (${suppliers.length} records)\n`;
      suppliers.forEach(s => {
        const values = [
          `'${s.id}'`,
          `'${s.name?.replace(/'/g, "''")}'`,
          s.phone ? `'${s.phone}'` : 'NULL',
          s.contact_person ? `'${s.contact_person?.replace(/'/g, "''")}'` : 'NULL',
          s.address ? `'${s.address?.replace(/'/g, "''")}'` : 'NULL',
          s.debt || 0,
          `'${JSON.stringify(s.payment_history || []).replace(/'/g, "''")}'`,
          s.created_by ? `'${s.created_by}'` : 'NULL',
          `'${s.created_at}'`,
          `'${s.updated_at}'`
        ].join(', ');
        sqlDump += `INSERT INTO suppliers (id, name, phone, contact_person, address, debt, payment_history, created_by, created_at, updated_at) VALUES (${values});\n`;
      });
      sqlDump += '\n';
    }

    // Employees
    if (employees && employees.length > 0) {
      sqlDump += `-- Employees (${employees.length} records)\n`;
      employees.forEach(e => {
        const values = [
          `'${e.id}'`,
          `'${e.name?.replace(/'/g, "''")}'`,
          `'${e.position}'`,
          e.hourly_rate || 'NULL',
          e.schedule ? `'${e.schedule?.replace(/'/g, "''")}'` : 'NULL',
          e.work_conditions ? `'${e.work_conditions?.replace(/'/g, "''")}'` : 'NULL',
          e.login ? `'${e.login}'` : 'NULL',
          e.user_id ? `'${e.user_id}'` : 'NULL',
          e.created_by ? `'${e.created_by}'` : 'NULL',
          `'${e.created_at}'`,
          `'${e.updated_at}'`
        ].join(', ');
        sqlDump += `INSERT INTO employees (id, name, position, hourly_rate, schedule, work_conditions, login, user_id, created_by, created_at, updated_at) VALUES (${values});\n`;
      });
    }

    // Create and download SQL file
    const dataBlob = new Blob([sqlDump], { type: 'text/plain' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `database-backup-${new Date().toISOString().split('T')[0]}.sql`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success('SQL дамп создан успешно!');
  } catch (error) {
    console.error('Error creating SQL dump:', error);
    toast.error('Ошибка при создании SQL дампа');
    throw error;
  }
};
