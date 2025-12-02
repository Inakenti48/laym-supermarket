// Unified Database версия синхронизации продуктов
import { useState, useEffect, useCallback } from 'react';
import { getAllProducts, UnifiedProduct, getDatabaseMode } from '@/lib/unifiedDatabase';
import { StoredProduct } from '@/lib/storage';
import { useDatabaseMode } from './useDatabaseMode';

// Конвертация UnifiedProduct в StoredProduct
const convertToStoredProduct = (p: UnifiedProduct): StoredProduct => ({
  id: p.id,
  barcode: p.barcode,
  name: p.name,
  category: p.category || '',
  purchasePrice: Number(p.purchase_price) || 0,
  retailPrice: Number(p.sale_price) || 0,
  quantity: Number(p.quantity) || 0,
  unit: 'шт' as const,
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
  const { mode } = useDatabaseMode();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      console.log(`🔄 Загрузка товаров из ${mode.toUpperCase()}...`);
      const unifiedProducts = await getAllProducts();
      setProducts(unifiedProducts.map(convertToStoredProduct));
      console.log(`✅ Загружено ${unifiedProducts.length} товаров из ${mode.toUpperCase()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка загрузки';
      setError(message);
      console.error(`❌ Ошибка загрузки из ${mode}:`, err);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  // Перезагружаем при изменении режима БД
  useEffect(() => {
    refresh();
  }, [refresh, mode]);

  return { products, loading, error, refresh, refetch: refresh, mode };
}

// Алиасы для обратной совместимости
export const useFirebaseSync = useProductsSync;
export const useFirebaseProducts = useProductsSync;
