import { X, Edit2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

export interface PendingProduct {
  id: string;
  barcode: string;
  name: string;
  category: string;
  purchasePrice: string;
  retailPrice: string;
  quantity: string;
  unit: 'шт' | 'кг';
  expiryDate?: string;
  supplier?: string;
  photos: string[];
  frontPhoto?: string;
  barcodePhoto?: string;
}

interface PendingProductItemProps {
  product: PendingProduct;
  onUpdate: (id: string, updates: Partial<PendingProduct>) => void;
  onRemove: (id: string) => void;
}

export const PendingProductItem = ({ product, onUpdate, onRemove }: PendingProductItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProduct, setEditedProduct] = useState(product);

  const handleSave = () => {
    onUpdate(product.id, editedProduct);
    setIsEditing(false);
  };

  const isComplete = product.name && product.category && product.purchasePrice && product.retailPrice && product.quantity;

  return (
    <Card className="p-3 space-y-2 bg-background/50">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <Input
                value={editedProduct.name}
                onChange={(e) => setEditedProduct({ ...editedProduct, name: e.target.value })}
                placeholder="Название"
                className="h-8 text-sm"
              />
              <Input
                value={editedProduct.category}
                onChange={(e) => setEditedProduct({ ...editedProduct, category: e.target.value })}
                placeholder="Категория"
                className="h-8 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={editedProduct.purchasePrice}
                  onChange={(e) => setEditedProduct({ ...editedProduct, purchasePrice: e.target.value })}
                  placeholder="Закуп"
                  className="h-8 text-sm"
                />
                <Input
                  type="number"
                  value={editedProduct.retailPrice}
                  onChange={(e) => setEditedProduct({ ...editedProduct, retailPrice: e.target.value })}
                  placeholder="Розница"
                  className="h-8 text-sm"
                />
              </div>
              <Input
                type="number"
                value={editedProduct.quantity}
                onChange={(e) => setEditedProduct({ ...editedProduct, quantity: e.target.value })}
                placeholder="Количество"
                className="h-8 text-sm"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-sm truncate">{product.name || 'Без названия'}</h4>
                {isComplete ? (
                  <Badge variant="default" className="text-xs">Готов</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">Не заполнен</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground space-y-1">
                {product.barcode && <p>Штрихкод: {product.barcode}</p>}
                {product.category && <p>Категория: {product.category}</p>}
                {product.purchasePrice && <p>Закуп: {product.purchasePrice}₽</p>}
                {product.retailPrice && <p>Розница: {product.retailPrice}₽</p>}
                {product.quantity && <p>Кол-во: {product.quantity} {product.unit}</p>}
              </div>
              {(product.frontPhoto || product.barcodePhoto) && (
                <div className="flex gap-1 mt-2">
                  {product.frontPhoto && (
                    <img src={product.frontPhoto} alt="Лицевая" className="w-12 h-12 object-cover rounded" />
                  )}
                  {product.barcodePhoto && (
                    <img src={product.barcodePhoto} alt="Штрихкод" className="w-12 h-12 object-cover rounded" />
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex gap-1 ml-2">
          {isEditing ? (
            <Button size="icon" variant="ghost" onClick={handleSave} className="h-7 w-7">
              <Check className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)} className="h-7 w-7">
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => onRemove(product.id)} className="h-7 w-7">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
};
