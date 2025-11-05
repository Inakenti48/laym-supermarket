import { useState, useEffect } from 'react';
import { AlertTriangle, Package, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getExpiringProducts, removeExpiredProduct } from '@/lib/storage';
import { logSystemAction } from '@/lib/supabaseAuth';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { StoredProduct } from '@/lib/storage';
import { useProductsSync } from '@/hooks/useProductsSync';

export const ExpiryTab = () => {
  const [expiringProducts, setExpiringProducts] = useState<StoredProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = async () => {
    const products = await getExpiringProducts(3);
    setExpiringProducts(products);
    setLoading(false);
  };

  // Realtime синхронизация товаров
  useProductsSync(loadProducts);

  useEffect(() => {
    loadProducts();
  }, []);

  const getDaysUntilExpiry = (expiryDate: string): number => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const diff = expiry.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getExpiryBadgeVariant = (days: number): "destructive" | "default" | "secondary" => {
    if (days <= 1) return 'destructive';
    if (days <= 2) return 'default';
    return 'secondary';
  };

  const handleRemoveExpired = async (product: StoredProduct) => {
    try {
      const removed = await removeExpiredProduct(product.barcode);
      if (removed) {
        const expiryDate = new Date(product.expiryDate!).toLocaleDateString('ru-RU');
        const logMessage = `Убран с прилавки товар со сроком годности до ${expiryDate}: "${product.name}", количество: ${product.quantity} ${product.unit}`;
        await logSystemAction(logMessage);
        toast.success('Товар удален из прилавка');
        
        // Обновляем список
        await loadProducts();
      }
    } catch (error) {
      toast.error('Не удалось удалить товар');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <Card className="p-4 sm:p-6">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-warning" />
        Товары с истекающим сроком годности ({expiringProducts.length})
      </h3>

      <div className="mb-4 p-3 bg-warning/10 border border-warning rounded-lg">
        <p className="text-sm text-warning">
          <strong>Внимание!</strong> Показаны товары, срок годности которых истекает в течение 3 дней.
          Необходимо убрать их с прилавка.
        </p>
      </div>

      {expiringProducts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Нет товаров с истекающим сроком годности</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {expiringProducts.map((product) => {
            const daysLeft = getDaysUntilExpiry(product.expiryDate!);
            const expiryDate = new Date(product.expiryDate!).toLocaleDateString('ru-RU');
            
            return (
              <div key={product.id} className="p-3 sm:p-4 bg-muted/50 rounded-lg border-l-4 border-warning">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-base">{product.name}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">Категория:</span> {product.category}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Штрихкод:</span> {product.barcode}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Количество:</span> {product.quantity} {product.unit}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={getExpiryBadgeVariant(daysLeft)}>
                      {daysLeft === 0 ? 'Сегодня' : daysLeft === 1 ? 'Завтра' : `${daysLeft} дней`}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      Годен до: {expiryDate}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemoveExpired(product)}
                      className="mt-2"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Сделано
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};