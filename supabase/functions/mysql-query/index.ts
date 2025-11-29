import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let client: Client | null = null;

  try {
    const { action, data } = await req.json();
    
    console.log('🔗 Connecting to MySQL... Action:', action);
    
    client = await new Client().connect({
      hostname: Deno.env.get('MYSQL_HOST'),
      port: parseInt(Deno.env.get('MYSQL_PORT') || '3306'),
      username: Deno.env.get('MYSQL_USER'),
      password: Deno.env.get('MYSQL_PASSWORD'),
      db: Deno.env.get('MYSQL_DATABASE'),
    });

    console.log('✅ Connected to MySQL');

    let result: any;

    switch (action) {
      // ==================== INIT TABLES ====================
      case 'init_tables':
        await client.execute(`
          CREATE TABLE IF NOT EXISTS products (
            id VARCHAR(36) PRIMARY KEY,
            barcode VARCHAR(255) UNIQUE,
            name VARCHAR(500) NOT NULL,
            purchase_price DECIMAL(10,2) DEFAULT 0,
            sale_price DECIMAL(10,2) DEFAULT 0,
            quantity INT DEFAULT 0,
            unit VARCHAR(50) DEFAULT 'шт',
            category VARCHAR(255),
            supplier_id VARCHAR(36),
            image_url TEXT,
            expiry_date DATE,
            created_by VARCHAR(36),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_barcode (barcode),
            INDEX idx_name (name(100))
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS suppliers (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            contact VARCHAR(255),
            phone VARCHAR(50),
            address TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS sales (
            id VARCHAR(36) PRIMARY KEY,
            barcode VARCHAR(255),
            product_name VARCHAR(500),
            quantity INT NOT NULL,
            unit_price DECIMAL(10,2) DEFAULT 0,
            total_price DECIMAL(10,2) NOT NULL,
            cashier VARCHAR(255),
            payment_method VARCHAR(50) DEFAULT 'cash',
            sold_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_created (sold_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS employees (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(100),
            phone VARCHAR(50),
            login VARCHAR(100),
            password_hash VARCHAR(255),
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS system_logs (
            id VARCHAR(36) PRIMARY KEY,
            action VARCHAR(500) NOT NULL,
            user_name VARCHAR(255),
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_created (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS cancellation_requests (
            id VARCHAR(36) PRIMARY KEY,
            items JSON NOT NULL,
            cashier VARCHAR(255),
            status VARCHAR(50) DEFAULT 'pending',
            processed_by VARCHAR(255),
            processed_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_status (status)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS pending_products (
            id VARCHAR(36) PRIMARY KEY,
            barcode VARCHAR(255),
            name VARCHAR(500),
            purchase_price DECIMAL(10,2) DEFAULT 0,
            sale_price DECIMAL(10,2) DEFAULT 0,
            quantity INT DEFAULT 1,
            category VARCHAR(255),
            supplier VARCHAR(255),
            expiry_date DATE,
            photo_url TEXT,
            front_photo TEXT,
            barcode_photo TEXT,
            image_url TEXT,
            added_by VARCHAR(255),
            status VARCHAR(50) DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_status (status)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS devices (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36),
            user_name VARCHAR(255),
            device_name VARCHAR(255),
            can_save_single BOOLEAN DEFAULT TRUE,
            can_save_queue BOOLEAN DEFAULT TRUE,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_device (user_id, device_name)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS product_returns (
            id VARCHAR(36) PRIMARY KEY,
            barcode VARCHAR(255),
            product_name VARCHAR(500),
            quantity INT DEFAULT 1,
            reason TEXT,
            created_by VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS tasks (
            id VARCHAR(36) PRIMARY KEY,
            employee_id VARCHAR(36),
            employee_name VARCHAR(255),
            title VARCHAR(500),
            description TEXT,
            date DATE,
            completed BOOLEAN DEFAULT FALSE,
            photos JSON,
            needs_more_photos BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS task_reports (
            id VARCHAR(36) PRIMARY KEY,
            task_id VARCHAR(36),
            employee_id VARCHAR(36),
            employee_name VARCHAR(255),
            title VARCHAR(500),
            photos JSON,
            completed_at TIMESTAMP,
            status VARCHAR(50) DEFAULT 'pending',
            admin_note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        result = { success: true, message: 'All tables created successfully' };
        break;

      // ==================== PRODUCTS ====================
      case 'get_products':
        const products = await client.query('SELECT * FROM products ORDER BY created_at DESC');
        result = { success: true, data: products };
        break;

      case 'get_product_by_barcode':
        const [product] = await client.query('SELECT * FROM products WHERE barcode = ?', [data.barcode]);
        result = { success: true, data: product || null };
        break;

      case 'insert_product':
        const productId = data.product?.id || crypto.randomUUID();
        const p = data.product || data;
        await client.execute(
          `INSERT INTO products (id, barcode, name, purchase_price, sale_price, quantity, unit, category, supplier_id, image_url, expiry_date, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           purchase_price = VALUES(purchase_price),
           sale_price = VALUES(sale_price),
           quantity = quantity + VALUES(quantity),
           unit = VALUES(unit),
           category = VALUES(category),
           image_url = COALESCE(VALUES(image_url), image_url),
           expiry_date = VALUES(expiry_date)`,
          [
            productId,
            p.barcode,
            p.name,
            p.purchase_price || 0,
            p.sale_price || 0,
            p.quantity || 0,
            p.unit || 'шт',
            p.category || null,
            p.supplier_id || null,
            p.image_url || null,
            p.expiry_date || null,
            p.created_by || null
          ]
        );
        result = { success: true, data: { insertId: productId } };
        break;

      case 'update_product':
        const updates = data.updates || data;
        const updateFields: string[] = [];
        const updateValues: any[] = [];
        
        if (updates.name !== undefined) { updateFields.push('name = ?'); updateValues.push(updates.name); }
        if (updates.purchase_price !== undefined) { updateFields.push('purchase_price = ?'); updateValues.push(updates.purchase_price); }
        if (updates.sale_price !== undefined) { updateFields.push('sale_price = ?'); updateValues.push(updates.sale_price); }
        if (updates.quantity !== undefined) { updateFields.push('quantity = ?'); updateValues.push(updates.quantity); }
        if (updates.unit !== undefined) { updateFields.push('unit = ?'); updateValues.push(updates.unit); }
        if (updates.category !== undefined) { updateFields.push('category = ?'); updateValues.push(updates.category); }
        if (updates.image_url !== undefined) { updateFields.push('image_url = ?'); updateValues.push(updates.image_url); }
        if (updates.expiry_date !== undefined) { updateFields.push('expiry_date = ?'); updateValues.push(updates.expiry_date); }
        
        if (updateFields.length > 0) {
          updateValues.push(data.barcode);
          await client.execute(`UPDATE products SET ${updateFields.join(', ')} WHERE barcode = ?`, updateValues);
        }
        result = { success: true };
        break;

      case 'delete_product':
        await client.execute('DELETE FROM products WHERE barcode = ?', [data.barcode]);
        result = { success: true };
        break;

      case 'bulk_insert_products':
        let inserted = 0;
        for (const prod of data.products) {
          try {
            const pId = crypto.randomUUID();
            await client.execute(
              `INSERT INTO products (id, barcode, name, purchase_price, sale_price, quantity, unit, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               purchase_price = VALUES(purchase_price),
               sale_price = VALUES(sale_price),
               quantity = quantity + VALUES(quantity)`,
              [pId, prod.barcode, prod.name, prod.purchase_price || 0, prod.sale_price || 0, prod.quantity || 0, prod.unit || 'шт', prod.category || null]
            );
            inserted++;
          } catch (e) {
            console.error('Error inserting product:', prod.barcode, e);
          }
        }
        result = { success: true, data: { count: inserted } };
        break;

      // ==================== SUPPLIERS ====================
      case 'get_suppliers':
        const suppliers = await client.query('SELECT * FROM suppliers ORDER BY name');
        result = { success: true, data: suppliers };
        break;

      case 'insert_supplier':
        const supplierId = crypto.randomUUID();
        const sup = data.supplier || data;
        await client.execute(
          'INSERT INTO suppliers (id, name, contact, phone, address) VALUES (?, ?, ?, ?, ?)',
          [supplierId, sup.name, sup.contact || null, sup.phone || null, sup.address || null]
        );
        result = { success: true, data: { insertId: supplierId } };
        break;

      case 'update_supplier':
        const supUpdates: string[] = [];
        const supValues: any[] = [];
        if (data.name) { supUpdates.push('name = ?'); supValues.push(data.name); }
        if (data.phone) { supUpdates.push('phone = ?'); supValues.push(data.phone); }
        if (data.address) { supUpdates.push('address = ?'); supValues.push(data.address); }
        if (supUpdates.length > 0) {
          supValues.push(data.id);
          await client.execute(`UPDATE suppliers SET ${supUpdates.join(', ')} WHERE id = ?`, supValues);
        }
        result = { success: true };
        break;

      // ==================== SALES ====================
      case 'get_sales':
        const sales = await client.query('SELECT * FROM sales ORDER BY sold_at DESC LIMIT 1000');
        result = { success: true, data: sales };
        break;

      case 'insert_sale':
        const saleId = crypto.randomUUID();
        const sale = data.sale || data;
        await client.execute(
          'INSERT INTO sales (id, barcode, product_name, quantity, unit_price, total_price, cashier, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [saleId, sale.barcode, sale.product_name, sale.quantity, sale.unit_price || 0, sale.total_price, sale.cashier, sale.payment_method || 'cash']
        );
        // Уменьшаем количество товара
        if (sale.barcode) {
          await client.execute('UPDATE products SET quantity = quantity - ? WHERE barcode = ?', [sale.quantity, sale.barcode]);
        }
        result = { success: true, data: { insertId: saleId } };
        break;

      // ==================== EMPLOYEES ====================
      case 'get_employees':
        const employees = await client.query('SELECT * FROM employees ORDER BY name');
        result = { success: true, data: employees };
        break;

      case 'insert_employee':
        const empId = crypto.randomUUID();
        const emp = data.employee || data;
        await client.execute(
          'INSERT INTO employees (id, name, role, phone, login, password_hash, active) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [empId, emp.name, emp.role || null, emp.phone || null, emp.login || null, emp.password_hash || null, emp.active !== false]
        );
        result = { success: true, data: { insertId: empId } };
        break;

      case 'update_employee':
        const empUpdates: string[] = [];
        const empValues: any[] = [];
        const empData = data.updates || data;
        if (empData.name !== undefined) { empUpdates.push('name = ?'); empValues.push(empData.name); }
        if (empData.role !== undefined) { empUpdates.push('role = ?'); empValues.push(empData.role); }
        if (empData.phone !== undefined) { empUpdates.push('phone = ?'); empValues.push(empData.phone); }
        if (empData.login !== undefined) { empUpdates.push('login = ?'); empValues.push(empData.login); }
        if (empData.active !== undefined) { empUpdates.push('active = ?'); empValues.push(empData.active); }
        if (empUpdates.length > 0) {
          empValues.push(data.id);
          await client.execute(`UPDATE employees SET ${empUpdates.join(', ')} WHERE id = ?`, empValues);
        }
        result = { success: true };
        break;

      // ==================== SYSTEM LOGS ====================
      case 'get_logs':
        const logs = await client.query('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 500');
        result = { success: true, data: logs };
        break;

      case 'insert_log':
        const logId = crypto.randomUUID();
        await client.execute(
          'INSERT INTO system_logs (id, action, user_name, details) VALUES (?, ?, ?, ?)',
          [logId, data.action, data.user_name || null, data.details || null]
        );
        result = { success: true };
        break;

      // ==================== CANCELLATIONS ====================
      case 'get_cancellations':
        const cancellations = await client.query('SELECT * FROM cancellation_requests ORDER BY created_at DESC');
        result = { success: true, data: cancellations.map((c: any) => ({
          ...c,
          items: typeof c.items === 'string' ? JSON.parse(c.items) : c.items
        })) };
        break;

      case 'create_cancellation':
        const cancelId = crypto.randomUUID();
        await client.execute(
          'INSERT INTO cancellation_requests (id, items, cashier, status) VALUES (?, ?, ?, ?)',
          [cancelId, JSON.stringify(data.items), data.cashier, 'pending']
        );
        result = { success: true, data: { insertId: cancelId } };
        break;

      case 'update_cancellation':
        await client.execute(
          'UPDATE cancellation_requests SET status = ?, processed_by = ?, processed_at = NOW() WHERE id = ?',
          [data.status, data.processed_by, data.id]
        );
        result = { success: true };
        break;

      // ==================== PENDING PRODUCTS ====================
      case 'get_pending_products':
        const pending = await client.query("SELECT * FROM pending_products WHERE status = 'pending' ORDER BY created_at DESC");
        result = { success: true, data: pending };
        break;

      case 'create_pending_product':
        const pendingId = crypto.randomUUID();
        const pp = data.product || data;
        await client.execute(
          `INSERT INTO pending_products (id, barcode, name, purchase_price, sale_price, quantity, category, supplier, expiry_date, photo_url, front_photo, barcode_photo, image_url, added_by, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [pendingId, pp.barcode, pp.name, pp.purchase_price || 0, pp.sale_price || 0, pp.quantity || 1, pp.category || null, pp.supplier || null, pp.expiry_date || null, pp.photo_url || null, pp.front_photo || null, pp.barcode_photo || null, pp.image_url || null, pp.added_by]
        );
        result = { success: true, data: { insertId: pendingId } };
        break;

      case 'approve_pending_product':
        // Получаем данные pending товара
        const [pendingProduct] = await client.query('SELECT * FROM pending_products WHERE id = ?', [data.id]);
        if (pendingProduct) {
          // Добавляем в products
          const newProdId = crypto.randomUUID();
          await client.execute(
            `INSERT INTO products (id, barcode, name, purchase_price, sale_price, quantity, category, image_url, expiry_date, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             quantity = quantity + VALUES(quantity),
             name = VALUES(name),
             purchase_price = VALUES(purchase_price),
             sale_price = VALUES(sale_price)`,
            [newProdId, pendingProduct.barcode, pendingProduct.name, pendingProduct.purchase_price, pendingProduct.sale_price, pendingProduct.quantity, pendingProduct.category, pendingProduct.image_url || pendingProduct.front_photo, pendingProduct.expiry_date, pendingProduct.added_by]
          );
          // Обновляем статус
          await client.execute("UPDATE pending_products SET status = 'approved' WHERE id = ?", [data.id]);
        }
        result = { success: true };
        break;

      case 'reject_pending_product':
        await client.execute("UPDATE pending_products SET status = 'rejected' WHERE id = ?", [data.id]);
        result = { success: true };
        break;

      // ==================== DEVICES ====================
      case 'get_devices':
        const devices = await client.query('SELECT * FROM devices ORDER BY last_active DESC');
        result = { success: true, data: devices };
        break;

      case 'save_device':
        const devId = data.id || crypto.randomUUID();
        await client.execute(
          `INSERT INTO devices (id, user_id, user_name, device_name, can_save_single, can_save_queue, last_active)
           VALUES (?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
           user_name = VALUES(user_name),
           device_name = VALUES(device_name),
           can_save_single = VALUES(can_save_single),
           can_save_queue = VALUES(can_save_queue),
           last_active = NOW()`,
          [devId, data.user_id, data.user_name, data.device_name, data.can_save_single !== false, data.can_save_queue !== false]
        );
        result = { success: true };
        break;

      // ==================== PRODUCT RETURNS ====================
      case 'get_product_returns':
        const returns = await client.query('SELECT * FROM product_returns ORDER BY created_at DESC');
        result = { success: true, data: returns };
        break;

      case 'add_product_return':
        const returnId = crypto.randomUUID();
        await client.execute(
          'INSERT INTO product_returns (id, barcode, product_name, quantity, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)',
          [returnId, data.barcode, data.product_name, data.quantity || 1, data.reason, data.created_by]
        );
        // Возвращаем товар на склад
        if (data.barcode) {
          await client.execute('UPDATE products SET quantity = quantity + ? WHERE barcode = ?', [data.quantity || 1, data.barcode]);
        }
        result = { success: true };
        break;

      // ==================== QUEUE (alias for pending_products) ====================
      case 'get_queue':
        const queue = await client.query("SELECT * FROM pending_products WHERE status = 'pending' ORDER BY created_at DESC");
        result = { success: true, data: queue };
        break;

      case 'add_to_queue':
        const queueId = crypto.randomUUID();
        await client.execute(
          `INSERT INTO pending_products (id, barcode, name, category, quantity, front_photo, barcode_photo, image_url, added_by, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
          [queueId, data.barcode || null, data.product_name || null, data.category || null, data.quantity || 1, data.front_photo || null, data.barcode_photo || null, data.image_url || null, data.created_by || 'system']
        );
        result = { success: true, data: { insertId: queueId } };
        break;

      case 'update_queue_item':
        const queueUpdates: string[] = [];
        const queueValues: any[] = [];
        if (data.barcode !== undefined) { queueUpdates.push('barcode = ?'); queueValues.push(data.barcode); }
        if (data.product_name !== undefined) { queueUpdates.push('name = ?'); queueValues.push(data.product_name); }
        if (data.category !== undefined) { queueUpdates.push('category = ?'); queueValues.push(data.category); }
        if (data.quantity !== undefined) { queueUpdates.push('quantity = ?'); queueValues.push(data.quantity); }
        if (data.status !== undefined) { queueUpdates.push('status = ?'); queueValues.push(data.status); }
        if (queueUpdates.length > 0) {
          queueValues.push(data.id);
          await client.execute(`UPDATE pending_products SET ${queueUpdates.join(', ')} WHERE id = ?`, queueValues);
        }
        result = { success: true };
        break;

      case 'delete_queue_item':
        await client.execute("UPDATE pending_products SET status = 'rejected' WHERE id = ?", [data.id]);
        result = { success: true };
        break;

      // ==================== TASKS ====================
      case 'get_tasks':
        const tasksQuery = data.employee_id 
          ? 'SELECT * FROM tasks WHERE employee_id = ? ORDER BY created_at DESC'
          : 'SELECT * FROM tasks ORDER BY created_at DESC';
        const tasksParams = data.employee_id ? [data.employee_id] : [];
        const tasksData = await client.query(tasksQuery, tasksParams);
        result = { success: true, data: tasksData.map((t: any) => ({
          id: t.id,
          employeeId: t.employee_id,
          employeeName: t.employee_name,
          title: t.title,
          description: t.description,
          date: t.date,
          completed: t.completed,
          photos: t.photos ? JSON.parse(t.photos) : [],
          needsMorePhotos: t.needs_more_photos,
          createdAt: t.created_at
        })) };
        break;

      case 'save_task':
        const task = data.task;
        await client.execute(
          `INSERT INTO tasks (id, employee_id, employee_name, title, description, date, completed, photos, needs_more_photos, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [task.id, task.employeeId, task.employeeName, task.title, task.description, task.date, task.completed, JSON.stringify(task.photos || []), task.needsMorePhotos || false, task.createdAt]
        );
        result = { success: true };
        break;

      case 'update_task':
        const taskUpdates: string[] = [];
        const taskValues: any[] = [];
        const tu = data.updates;
        if (tu.completed !== undefined) { taskUpdates.push('completed = ?'); taskValues.push(tu.completed); }
        if (tu.photos !== undefined) { taskUpdates.push('photos = ?'); taskValues.push(JSON.stringify(tu.photos)); }
        if (tu.needsMorePhotos !== undefined) { taskUpdates.push('needs_more_photos = ?'); taskValues.push(tu.needsMorePhotos); }
        if (taskUpdates.length > 0) {
          taskValues.push(data.id);
          await client.execute(`UPDATE tasks SET ${taskUpdates.join(', ')} WHERE id = ?`, taskValues);
        }
        result = { success: true };
        break;

      // ==================== TASK REPORTS ====================
      case 'get_task_reports':
        const reportsData = await client.query('SELECT * FROM task_reports ORDER BY completed_at DESC');
        result = { success: true, data: reportsData.map((r: any) => ({
          id: r.id,
          taskId: r.task_id,
          employeeId: r.employee_id,
          employeeName: r.employee_name,
          title: r.title,
          photos: r.photos ? JSON.parse(r.photos) : [],
          completedAt: r.completed_at,
          status: r.status,
          adminNote: r.admin_note
        })) };
        break;

      case 'save_task_report':
        const report = data.report;
        await client.execute(
          `INSERT INTO task_reports (id, task_id, employee_id, employee_name, title, photos, completed_at, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [report.id, report.taskId, report.employeeId, report.employeeName, report.title, JSON.stringify(report.photos || []), report.completedAt, report.status]
        );
        result = { success: true };
        break;

      case 'update_task_report':
        await client.execute(
          'UPDATE task_reports SET status = ?, admin_note = ? WHERE id = ?',
          [data.status, data.admin_note || null, data.id]
        );
        result = { success: true };
        break;

      // ==================== TEST ====================
      case 'test_connection':
        const [testResult] = await client.query('SELECT 1 as test');
        result = { success: true, message: 'Connection successful', data: testResult };
        break;

      default:
        result = { success: false, error: `Unknown action: ${action}` };
    }

    await client.close();
    console.log('🔌 MySQL connection closed');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ MySQL Error:', errorMessage);
    
    if (client) {
      try { await client.close(); } catch {}
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
