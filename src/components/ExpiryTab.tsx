import { AlertTriangle, Package } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getExpiringProducts } from '@/lib/storage';
import { Badge } from '@/components/ui/badge';

export const ExpiryTab = () => {
  const expiringProducts = getExpiringProducts(3);

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
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                  <div className="flex-1">
                    <div className="font-medium text-sm sm:text-base">{product.name}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground space-y-1 mt-1">
                      <div>Штрихкод: {product.barcode}</div>
                      <div>Категория: {product.category}</div>
                      <div>Количество: {product.quantity} {product.unit}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2">
                    <Badge variant={getExpiryBadgeVariant(daysLeft)} className="text-xs">
                      {daysLeft <= 0 ? 'Просрочен' : `${daysLeft} дн. до просрочки`}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Срок до: {expiryDate}
                    </span>
                  </div>
                </div>
                
                {product.photos.length > 0 && (
                  <div className="flex gap-2 mt-2 overflow-x-auto">
                    {product.photos.slice(0, 3).map((photo, idx) => (
                      <img
                        key={idx}
                        src={photo}
                        alt={`${product.name} ${idx + 1}`}
                        className="h-16 w-16 object-cover rounded border"
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};
