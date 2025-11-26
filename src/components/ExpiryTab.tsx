import { useState, useEffect } from 'react';
import { AlertTriangle, Package, Check, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getExpiringProducts, removeExpiredProduct } from '@/lib/storage';
import { logSystemAction } from '@/lib/supabaseAuth';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import type { StoredProduct } from '@/lib/storage';
import { useProductsSync } from '@/hooks/useProductsSync';
import { supabase } from '@/integrations/supabase/client';

export const ExpiryTab = () => {
  const [expiringProducts, setExpiringProducts] = useState<StoredProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [addQuantity, setAddQuantity] = useState<{[key: string]: number}>({});

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
        const logMessage = `Убран с прилавки товар со сроком годности до ${expiryDate}: "${product.name}", количество: ${product.quantity} шт`;
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

  const handleAddProduct = async (product: StoredProduct) => {
    try {
      const quantityToAdd = addQuantity[product.id || ''] || 1;
      
      const { error } = await supabase
        .from('products')
        .update({ quantity: product.quantity + quantityToAdd })
        .eq('barcode', product.barcode);
      
      if (error) throw error;
      
      const logMessage = `Пополнен товар "${product.name}" (${product.barcode}): +${quantityToAdd} шт (всего: ${product.quantity + quantityToAdd})`;
      await logSystemAction(logMessage);
      toast.success(`Добавлено ${quantityToAdd} шт товара "${product.name}"`);
      
      // Сбрасываем количество
      setAddQuantity(prev => ({ ...prev, [product.id || '']: 1 }));
      
      // Обновляем список
      await loadProducts();
    } catch (error) {
      toast.error('Не удалось добавить товар');
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
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold text-lg mb-2">{product.name}</h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Штрихкод:</span>
                          <p className="font-mono font-semibold">{product.barcode}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Категория:</span>
                          <p className="font-medium">{product.category}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">На складе:</span>
                          <p className="font-semibold">{product.quantity} шт</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Годен до:</span>
                          <p className="font-medium">{expiryDate}</p>
                        </div>
                      </div>
                    </div>
                    <Badge variant={getExpiryBadgeVariant(daysLeft)} className="text-sm">
                      {daysLeft === 0 ? 'Истекает сегодня!' : daysLeft === 1 ? 'Истекает завтра' : `Истекает через ${daysLeft} дн.`}
                    </Badge>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="number"
                        min="1"
                        value={addQuantity[product.id || ''] || 1}
                        onChange={(e) => setAddQuantity(prev => ({ 
                          ...prev, 
                          [product.id || '']: parseInt(e.target.value) || 1 
                        }))}
                        className="w-20"
                      />
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => handleAddProduct(product)}
                        className="flex-1 sm:flex-none"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Добавить товар
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleRemoveExpired(product)}
                      className="flex-1 sm:flex-none"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Убрать с прилавки
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