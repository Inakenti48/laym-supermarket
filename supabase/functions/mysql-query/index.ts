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

  try {
    const { action, data } = await req.json();
    
    console.log('🔗 Connecting to MySQL...');
    
    const client = await new Client().connect({
      hostname: Deno.env.get('MYSQL_HOST'),
      port: parseInt(Deno.env.get('MYSQL_PORT') || '3306'),
      username: Deno.env.get('MYSQL_USER'),
      password: Deno.env.get('MYSQL_PASSWORD'),
      db: Deno.env.get('MYSQL_DATABASE'),
    });

    console.log('✅ Connected to MySQL');

    let result: any;

    switch (action) {
      case 'init_tables':
        // Создаем таблицы
        await client.execute(`
          CREATE TABLE IF NOT EXISTS products (
            id VARCHAR(36) PRIMARY KEY,
            barcode VARCHAR(255) UNIQUE,
            name VARCHAR(500) NOT NULL,
            purchase_price DECIMAL(10,2) DEFAULT 0,
            selling_price DECIMAL(10,2) DEFAULT 0,
            quantity INT DEFAULT 0,
            unit VARCHAR(50) DEFAULT 'шт',
            category VARCHAR(255),
            supplier_id VARCHAR(36),
            image_url TEXT,
            expiry_date DATE,
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
            product_id VARCHAR(36),
            product_name VARCHAR(500),
            quantity INT NOT NULL,
            total_price DECIMAL(10,2) NOT NULL,
            cashier_id VARCHAR(36),
            cashier_name VARCHAR(255),
            payment_method VARCHAR(50) DEFAULT 'cash',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_created (created_at),
            INDEX idx_product (product_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS employees (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            position VARCHAR(255),
            phone VARCHAR(50),
            salary DECIMAL(10,2),
            hire_date DATE DEFAULT (CURRENT_DATE),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS system_logs (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36),
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_created (created_at)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS cancellation_requests (
            id VARCHAR(36) PRIMARY KEY,
            product_id VARCHAR(36),
            product_name VARCHAR(500),
            quantity INT,
            reason TEXT,
            status VARCHAR(50) DEFAULT 'pending',
            cashier_id VARCHAR(36),
            cashier_name VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        await client.execute(`
          CREATE TABLE IF NOT EXISTS product_images (
            id VARCHAR(36) PRIMARY KEY,
            product_barcode VARCHAR(255),
            image_url TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_barcode (product_barcode)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        result = { success: true, message: 'All tables created successfully' };
        break;

      case 'get_products':
        const products = await client.query('SELECT * FROM products ORDER BY created_at DESC');
        result = { success: true, data: products };
        break;

      case 'get_product_by_barcode':
        const [product] = await client.query('SELECT * FROM products WHERE barcode = ?', [data.barcode]);
        result = { success: true, data: product || null };
        break;

      case 'insert_product':
        const productId = crypto.randomUUID();
        await client.execute(
          `INSERT INTO products (id, barcode, name, purchase_price, selling_price, quantity, unit, category, supplier_id, image_url, expiry_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           purchase_price = VALUES(purchase_price),
           selling_price = VALUES(selling_price),
           quantity = quantity + VALUES(quantity),
           unit = VALUES(unit),
           category = VALUES(category),
           image_url = COALESCE(VALUES(image_url), image_url),
           expiry_date = VALUES(expiry_date)`,
          [
            productId,
            data.barcode,
            data.name,
            data.purchase_price || 0,
            data.selling_price || 0,
            data.quantity || 0,
            data.unit || 'шт',
            data.category || null,
            data.supplier_id || null,
            data.image_url || null,
            data.expiry_date || null
          ]
        );
        result = { success: true, id: productId };
        break;

      case 'update_product':
        await client.execute(
          `UPDATE products SET name = ?, purchase_price = ?, selling_price = ?, quantity = ?, unit = ?, category = ?, image_url = ?, expiry_date = ? WHERE id = ?`,
          [data.name, data.purchase_price, data.selling_price, data.quantity, data.unit, data.category, data.image_url, data.expiry_date, data.id]
        );
        result = { success: true };
        break;

      case 'delete_product':
        await client.execute('DELETE FROM products WHERE id = ?', [data.id]);
        result = { success: true };
        break;

      case 'bulk_insert_products':
        let inserted = 0;
        for (const p of data.products) {
          try {
            const pId = crypto.randomUUID();
            await client.execute(
              `INSERT INTO products (id, barcode, name, purchase_price, selling_price, quantity, unit, category)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
               name = VALUES(name),
               purchase_price = VALUES(purchase_price),
               selling_price = VALUES(selling_price),
               quantity = quantity + VALUES(quantity)`,
              [pId, p.barcode, p.name, p.purchase_price || 0, p.selling_price || 0, p.quantity || 0, p.unit || 'шт', p.category || null]
            );
            inserted++;
          } catch (e) {
            console.error('Error inserting product:', p.barcode, e);
          }
        }
        result = { success: true, inserted };
        break;

      case 'get_suppliers':
        const suppliers = await client.query('SELECT * FROM suppliers ORDER BY name');
        result = { success: true, data: suppliers };
        break;

      case 'insert_supplier':
        const supplierId = crypto.randomUUID();
        await client.execute(
          'INSERT INTO suppliers (id, name, contact, phone, address) VALUES (?, ?, ?, ?, ?)',
          [supplierId, data.name, data.contact, data.phone, data.address]
        );
        result = { success: true, id: supplierId };
        break;

      case 'get_sales':
        const sales = await client.query('SELECT * FROM sales ORDER BY created_at DESC LIMIT 1000');
        result = { success: true, data: sales };
        break;

      case 'insert_sale':
        const saleId = crypto.randomUUID();
        await client.execute(
          'INSERT INTO sales (id, product_id, product_name, quantity, total_price, cashier_id, cashier_name, payment_method) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [saleId, data.product_id, data.product_name, data.quantity, data.total_price, data.cashier_id, data.cashier_name, data.payment_method || 'cash']
        );
        // Уменьшаем количество товара
        if (data.product_id) {
          await client.execute('UPDATE products SET quantity = quantity - ? WHERE id = ?', [data.quantity, data.product_id]);
        }
        result = { success: true, id: saleId };
        break;

      case 'test_connection':
        const [testResult] = await client.query('SELECT 1 as test');
        result = { success: true, message: 'Connection successful', data: testResult };
        break;

      default:
        result = { success: false, error: 'Unknown action' };
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
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
