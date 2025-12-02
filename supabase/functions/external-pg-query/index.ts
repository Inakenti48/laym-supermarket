import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Pool } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create connection pool
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const host = Deno.env.get('EXTERNAL_PG_HOST');
    const port = Deno.env.get('EXTERNAL_PG_PORT') || '5432';
    const database = Deno.env.get('EXTERNAL_PG_DATABASE');
    const user = Deno.env.get('EXTERNAL_PG_USER');
    const password = Deno.env.get('EXTERNAL_PG_PASSWORD');

    if (!host || !database || !user || !password) {
      throw new Error('Missing external PostgreSQL configuration');
    }

    pool = new Pool({
      hostname: host,
      port: parseInt(port),
      database: database,
      user: user,
      password: password,
    }, 3, true);
  }
  return pool;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, data } = await req.json();
    console.log(`External PG action: ${action}`, data);

    const pool = getPool();
    const connection = await pool.connect();

    try {
      let result: any;

      switch (action) {
        case 'test_connection':
          await connection.queryObject('SELECT 1');
          result = { success: true, message: 'Connected to external PostgreSQL' };
          break;

        case 'get_products':
          const products = await connection.queryObject(`
            SELECT id, barcode, name, category, purchase_price, sale_price, 
                   quantity, unit, supplier_id, expiry_date, created_by, created_at, updated_at
            FROM products ORDER BY created_at DESC
          `);
          result = { success: true, data: products.rows };
          break;

        case 'get_product_by_barcode':
          const product = await connection.queryObject(
            'SELECT * FROM products WHERE barcode = $1',
            [data.barcode]
          );
          result = { success: true, data: product.rows[0] || null };
          break;

        case 'insert_product':
          const insertProduct = await connection.queryObject(`
            INSERT INTO products (barcode, name, category, purchase_price, sale_price, quantity, unit, supplier_id, expiry_date, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id
          `, [
            data.product.barcode,
            data.product.name,
            data.product.category || '',
            data.product.purchase_price || 0,
            data.product.sale_price || 0,
            data.product.quantity || 0,
            data.product.unit || 'шт',
            data.product.supplier_id || null,
            data.product.expiry_date || null,
            data.product.created_by || 'system'
          ]);
          result = { success: true, data: { insertId: (insertProduct.rows[0] as any)?.id } };
          break;

        case 'update_product':
          const updates = data.updates;
          const setClauses: string[] = [];
          const values: any[] = [];
          let paramIndex = 1;

          if (updates.name !== undefined) { setClauses.push(`name = $${paramIndex++}`); values.push(updates.name); }
          if (updates.category !== undefined) { setClauses.push(`category = $${paramIndex++}`); values.push(updates.category); }
          if (updates.purchase_price !== undefined) { setClauses.push(`purchase_price = $${paramIndex++}`); values.push(updates.purchase_price); }
          if (updates.sale_price !== undefined) { setClauses.push(`sale_price = $${paramIndex++}`); values.push(updates.sale_price); }
          if (updates.quantity !== undefined) { setClauses.push(`quantity = $${paramIndex++}`); values.push(updates.quantity); }
          if (updates.unit !== undefined) { setClauses.push(`unit = $${paramIndex++}`); values.push(updates.unit); }
          if (updates.supplier_id !== undefined) { setClauses.push(`supplier_id = $${paramIndex++}`); values.push(updates.supplier_id); }
          if (updates.expiry_date !== undefined) { setClauses.push(`expiry_date = $${paramIndex++}`); values.push(updates.expiry_date); }

          setClauses.push(`updated_at = NOW()`);
          values.push(data.barcode);

          await connection.queryObject(
            `UPDATE products SET ${setClauses.join(', ')} WHERE barcode = $${paramIndex}`,
            values
          );
          result = { success: true };
          break;

        case 'delete_product':
          await connection.queryObject('DELETE FROM products WHERE barcode = $1', [data.barcode]);
          result = { success: true };
          break;

        case 'bulk_insert_products':
          let insertedCount = 0;
          for (const p of data.products) {
            try {
              await connection.queryObject(`
                INSERT INTO products (barcode, name, category, purchase_price, sale_price, quantity, unit, supplier_id, expiry_date, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (barcode) DO UPDATE SET
                  name = EXCLUDED.name,
                  category = EXCLUDED.category,
                  purchase_price = EXCLUDED.purchase_price,
                  sale_price = EXCLUDED.sale_price,
                  quantity = EXCLUDED.quantity,
                  unit = EXCLUDED.unit,
                  updated_at = NOW()
              `, [
                p.barcode, p.name, p.category || '', p.purchase_price || 0, p.sale_price || 0,
                p.quantity || 0, p.unit || 'шт', p.supplier_id || null, p.expiry_date || null, p.created_by || 'bulk'
              ]);
              insertedCount++;
            } catch (e) {
              console.error('Bulk insert error for product:', p.barcode, e);
            }
          }
          result = { success: true, data: { count: insertedCount } };
          break;

        case 'get_suppliers':
          const suppliers = await connection.queryObject('SELECT * FROM suppliers ORDER BY created_at DESC');
          result = { success: true, data: suppliers.rows };
          break;

        case 'insert_supplier':
          const insertSupplier = await connection.queryObject(`
            INSERT INTO suppliers (name, phone, address, contact_person)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `, [
            data.supplier.name,
            data.supplier.phone || null,
            data.supplier.address || null,
            data.supplier.contact || null
          ]);
          result = { success: true, data: { insertId: (insertSupplier.rows[0] as any)?.id } };
          break;

        case 'get_pending_products':
          const pending = await connection.queryObject(`
            SELECT * FROM pending_products WHERE status = 'pending' ORDER BY created_at DESC
          `);
          result = { success: true, data: pending.rows };
          break;

        case 'create_pending_product':
          const insertPending = await connection.queryObject(`
            INSERT INTO pending_products (barcode, name, purchase_price, sale_price, quantity, category, supplier, expiry_date, photo_url, front_photo, barcode_photo, added_by, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending')
            RETURNING id
          `, [
            data.product.barcode,
            data.product.name,
            data.product.purchase_price || 0,
            data.product.sale_price || 0,
            data.product.quantity || 1,
            data.product.category || null,
            data.product.supplier || null,
            data.product.expiry_date || null,
            data.product.photo_url || null,
            data.product.front_photo || null,
            data.product.barcode_photo || null,
            data.product.added_by || 'system'
          ]);
          result = { success: true, data: { insertId: (insertPending.rows[0] as any)?.id } };
          break;

        case 'approve_pending_product':
          await connection.queryObject(
            `UPDATE pending_products SET status = 'approved' WHERE id = $1`,
            [data.id]
          );
          result = { success: true };
          break;

        case 'reject_pending_product':
          await connection.queryObject(
            `UPDATE pending_products SET status = 'rejected' WHERE id = $1`,
            [data.id]
          );
          result = { success: true };
          break;

        case 'get_sales':
          const sales = await connection.queryObject('SELECT * FROM sales ORDER BY created_at DESC LIMIT 1000');
          result = { success: true, data: sales.rows };
          break;

        case 'insert_sale':
          const insertSale = await connection.queryObject(`
            INSERT INTO sales (items, total, cashier_name, payment_method)
            VALUES ($1, $2, $3, $4)
            RETURNING id
          `, [
            JSON.stringify(data.sale.items),
            data.sale.total,
            data.sale.cashier_name,
            data.sale.payment_method
          ]);
          result = { success: true, data: { insertId: (insertSale.rows[0] as any)?.id } };
          break;

        case 'get_employees':
          const employees = await connection.queryObject('SELECT * FROM employees ORDER BY created_at DESC');
          result = { success: true, data: employees.rows };
          break;

        case 'get_logs':
          const logs = await connection.queryObject('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 500');
          result = { success: true, data: logs.rows };
          break;

        case 'insert_log':
          await connection.queryObject(
            'INSERT INTO system_logs (action, user_name, details) VALUES ($1, $2, $3)',
            [data.action, data.user_name || null, data.details || null]
          );
          result = { success: true };
          break;

        case 'get_cancellations':
          const cancellations = await connection.queryObject('SELECT * FROM cancellation_requests ORDER BY created_at DESC');
          result = { success: true, data: cancellations.rows };
          break;

        case 'create_tables':
          console.log('Creating tables in external PostgreSQL...');
          
          // Enable UUID extension
          await connection.queryObject(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
          
          // SUPPLIERS
          await connection.queryObject(`
            CREATE TABLE IF NOT EXISTS suppliers (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              name VARCHAR(255) NOT NULL,
              phone VARCHAR(50),
              address TEXT,
              contact_person VARCHAR(255),
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
          `);
          await connection.queryObject(`CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)`);
          
          // PRODUCTS
          await connection.queryObject(`
            CREATE TABLE IF NOT EXISTS products (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              barcode VARCHAR(100) NOT NULL,
              name VARCHAR(500) NOT NULL,
              category VARCHAR(255) DEFAULT '',
              purchase_price DECIMAL(12, 2) DEFAULT 0,
              sale_price DECIMAL(12, 2) DEFAULT 0,
              quantity INTEGER DEFAULT 0,
              unit VARCHAR(50) DEFAULT 'шт',
              supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
              expiry_date DATE,
              photo_url TEXT,
              created_by VARCHAR(255) DEFAULT 'system',
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              CONSTRAINT products_barcode_unique UNIQUE (barcode)
            )
          `);
          await connection.queryObject(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`);
          await connection.queryObject(`CREATE INDEX IF NOT EXISTS idx_products_name ON products(name)`);
          
          // PENDING_PRODUCTS
          await connection.queryObject(`
            CREATE TABLE IF NOT EXISTS pending_products (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              barcode VARCHAR(100) NOT NULL,
              name VARCHAR(500) NOT NULL,
              purchase_price DECIMAL(12, 2) DEFAULT 0,
              sale_price DECIMAL(12, 2) DEFAULT 0,
              quantity INTEGER DEFAULT 1,
              category VARCHAR(255),
              supplier VARCHAR(255),
              expiry_date DATE,
              photo_url TEXT,
              front_photo TEXT,
              barcode_photo TEXT,
              added_by VARCHAR(255) DEFAULT 'system',
              status VARCHAR(20) DEFAULT 'pending',
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              CONSTRAINT pending_products_barcode_unique UNIQUE (barcode)
            )
          `);
          await connection.queryObject(`CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_products(status)`);
          
          // EMPLOYEES
          await connection.queryObject(`
            CREATE TABLE IF NOT EXISTS employees (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              name VARCHAR(255) NOT NULL,
              role VARCHAR(100) NOT NULL DEFAULT 'employee',
              phone VARCHAR(50),
              login VARCHAR(100),
              password_hash VARCHAR(255),
              active BOOLEAN DEFAULT true,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              CONSTRAINT employees_login_unique UNIQUE (login)
            )
          `);
          
          // SALES
          await connection.queryObject(`
            CREATE TABLE IF NOT EXISTS sales (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              items JSONB NOT NULL DEFAULT '[]',
              total DECIMAL(12, 2) NOT NULL DEFAULT 0,
              cashier_name VARCHAR(255) NOT NULL,
              cashier_role VARCHAR(100) DEFAULT 'cashier',
              payment_method VARCHAR(50) DEFAULT 'cash',
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
          `);
          await connection.queryObject(`CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at)`);
          
          // SYSTEM_LOGS
          await connection.queryObject(`
            CREATE TABLE IF NOT EXISTS system_logs (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              action VARCHAR(500) NOT NULL,
              user_name VARCHAR(255),
              details TEXT,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
          `);
          
          // CANCELLATION_REQUESTS
          await connection.queryObject(`
            CREATE TABLE IF NOT EXISTS cancellation_requests (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              items JSONB NOT NULL DEFAULT '[]',
              cashier VARCHAR(255) NOT NULL,
              reason TEXT,
              status VARCHAR(20) DEFAULT 'pending',
              processed_by VARCHAR(255),
              processed_at TIMESTAMP WITH TIME ZONE,
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
          `);
          
          console.log('All tables created successfully!');
          result = { success: true, message: 'All tables created successfully' };
          break;

        default:
          result = { success: false, error: `Unknown action: ${action}` };
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('External PG error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
