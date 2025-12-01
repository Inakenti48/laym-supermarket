// MySQL версия синхронизации продуктов
import { useState, useEffect, useCallback } from 'react';
import { getAllProducts, Product } from '@/lib/mysqlDatabase';
import { StoredProduct } from '@/lib/storage';

// Конвертация MySQL Product в StoredProduct
const convertToStoredProduct = (p: Product): StoredProduct => ({
  id: p.id,
  barcode: p.barcode,
  name: p.name,
  category: p.category || '',
  purchasePrice: Number(p.purchase_price) || 0,
  retailPrice: Number(p.sale_price) || 0,
  quantity: Number(p.quantity) || 0,
  unit: 'шт',
  expiryDate: p.expiry_date,
  photos: [],
  paymentType: 'full',
  paidAmount: Number(p.purchase_price || 0) * Number(p.quantity || 0),
  debtAmount: 0,
  addedBy: p.created_by || '',
  supplier: p.supplier_id,
  lastUpdated: p.updated_at || p.created_at || new Date().toISOString(),
  priceHistory: []
});

export function useProductsSync() {
  const [products, setProducts] = useState<StoredProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mysqlProducts = await getAllProducts();
      setProducts(mysqlProducts.map(convertToStoredProduct));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { products, loading, error, refresh, refetch: refresh };
}

// Алиасы для обратной совместимости
export const useFirebaseSync = useProductsSync;
export const useFirebaseProducts = useProductsSync;
