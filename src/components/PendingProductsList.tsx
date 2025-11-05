import { Package, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { PendingProductItem, PendingProduct } from './PendingProductItem';

interface PendingProductsListProps {
  products: PendingProduct[];
  onUpdateProduct: (id: string, updates: Partial<PendingProduct>) => void;
  onRemoveProduct: (id: string) => void;
  onSaveAll: () => void;
  onClearAll: () => void;
}

export const PendingProductsList = ({
  products,
  onUpdateProduct,
  onRemoveProduct,
  onSaveAll,
  onClearAll,
}: PendingProductsListProps) => {
  const allComplete = products.length > 0 && products.every(p => 
    p.name && p.category && p.purchasePrice && p.retailPrice && p.quantity
  );

  return (
    <Card className="w-80 flex flex-col h-full bg-muted/30">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Очередь товаров</h3>
          </div>
          <span className="text-sm text-muted-foreground">{products.length}</span>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={onSaveAll}
            disabled={!allComplete}
            className="flex-1"
            size="sm"
          >
            <Save className="h-4 w-4 mr-1" />
            Занести все
          </Button>
          <Button
            onClick={onClearAll}
            variant="outline"
            size="sm"
            disabled={products.length === 0}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        {products.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Очередь пуста</p>
            <p className="text-xs mt-1">Отсканируйте товары для добавления</p>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((product) => (
              <PendingProductItem
                key={product.id}
                product={product}
                onUpdate={onUpdateProduct}
                onRemove={onRemoveProduct}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
};
