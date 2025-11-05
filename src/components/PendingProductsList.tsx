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
      <div className="p-6 border-b space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-base">Очередь товаров</h3>
          </div>
          <span className="text-sm text-muted-foreground font-medium">{products.length}</span>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={onSaveAll}
            disabled={!allComplete}
            className="flex-1 h-10"
          >
            <Save className="h-4 w-4 mr-2" />
            Занести все
          </Button>
          <Button
            onClick={onClearAll}
            variant="outline"
            size="icon"
            disabled={products.length === 0}
            className="h-10 w-10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 p-6">
        {products.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-base font-medium">Очередь пуста</p>
            <p className="text-sm mt-2">Отсканируйте товары для добавления</p>
          </div>
        ) : (
          <div className="space-y-4">
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
