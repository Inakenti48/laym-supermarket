import { Package, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { PendingProductItem, PendingProduct } from './PendingProductItem';

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  contactPerson?: string;
  address?: string;
}

interface PendingProductsListProps {
  products: PendingProduct[];
  suppliers: Supplier[];
  onUpdateProduct: (id: string, updates: Partial<PendingProduct>) => void;
  onRemoveProduct: (id: string) => void;
  onSaveProduct: (id: string) => void;
  onSaveAll: () => void;
  onClearAll: () => void;
}

export const PendingProductsList = ({
  products,
  suppliers,
  onUpdateProduct,
  onRemoveProduct,
  onSaveProduct,
  onSaveAll,
  onClearAll,
}: PendingProductsListProps) => {
  const hasCompleteProducts = products.length > 0 && products.some(p => 
    p.barcode && p.name && p.category && p.purchasePrice && p.retailPrice && p.quantity &&
    (p.frontPhoto || p.barcodePhoto || (p.photos && p.photos.length > 0))
  );

  return (
    <Card className="w-full bg-muted/30">
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
            disabled={!hasCompleteProducts}
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

      <div className="p-6 max-h-96 overflow-y-auto">
        {products.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-base font-medium">Очередь пуста</p>
            <p className="text-sm mt-2">Отсканируйте товары для добавления</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => (
              <PendingProductItem
                key={product.id}
                product={product}
                suppliers={suppliers}
                onUpdate={onUpdateProduct}
                onRemove={onRemoveProduct}
                onSave={onSaveProduct}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
