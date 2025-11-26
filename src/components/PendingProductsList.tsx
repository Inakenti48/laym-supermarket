import React from 'react';
import { Package, Save, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
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
  onSupplierAdded: (supplier: Supplier) => void;
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
}

interface ExtendedPendingProduct extends PendingProduct {
  isAutoEditing?: boolean;
}

export const PendingProductsList = ({
  products,
  suppliers,
  onUpdateProduct,
  onRemoveProduct,
  onSaveProduct,
  onSaveAll,
  onClearAll,
  onSupplierAdded,
  currentPage = 1,
  totalPages = 1,
  totalCount = 0,
  onPageChange,
}: PendingProductsListProps) => {
  const [currentEditingIndex, setCurrentEditingIndex] = React.useState<number>(0);

  const hasCompleteProducts = products.length > 0 && products.some(p => 
    p.barcode && p.name && p.category && p.purchasePrice && p.retailPrice && p.quantity &&
    (p.frontPhoto || p.barcodePhoto || (p.photos && p.photos.length > 0))
  );

  const handleMoveToNext = () => {
    if (currentEditingIndex < products.length - 1) {
      setCurrentEditingIndex(currentEditingIndex + 1);
    }
  };

  return (
    <Card className="w-full bg-muted/30">
      <div className="p-6 border-b space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-base">Очередь товаров</h3>
          </div>
          <div className="flex items-center gap-2">
            {totalCount > 0 && (
              <span className="text-xs text-muted-foreground">
                Всего: {totalCount}
              </span>
            )}
            <span className="text-sm text-muted-foreground font-medium">{products.length}</span>
          </div>
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
        
        {/* Пагинация для больших очередей */}
        {totalPages > 1 && onPageChange && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <Button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              variant="outline"
              size="sm"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              Страница {currentPage} из {totalPages}
            </span>
            <Button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              variant="outline"
              size="sm"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="p-6 max-h-[600px] overflow-y-auto">
        {products.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">
            <Package className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-base font-medium">Очередь пуста</p>
            <p className="text-sm mt-2">Отсканируйте товары для добавления</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {products.map((product, index) => (
              <PendingProductItem
                key={product.id}
                product={product}
                suppliers={suppliers}
                onUpdate={onUpdateProduct}
                onRemove={onRemoveProduct}
                onSave={onSaveProduct}
                onSupplierAdded={onSupplierAdded}
                autoEdit={index === currentEditingIndex}
                onMoveToNext={handleMoveToNext}
              />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};