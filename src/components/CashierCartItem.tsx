import { useState, useEffect } from 'react';
import { Plus, Minus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { findProductByBarcode } from '@/lib/storage';

interface CartItemProps {
  item: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    barcode?: string;
  };
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}

export const CartItem = ({ item, onUpdateQuantity, onRemove }: CartItemProps) => {
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProduct = async () => {
      if (item.barcode) {
        const prod = await findProductByBarcode(item.barcode);
        setProduct(prod);
      }
      setLoading(false);
    };
    loadProduct();
  }, [item.barcode]);

  const stockQuantity = product?.quantity || 0;

  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm sm:text-base truncate">{item.name}</div>
        <div className="text-xs sm:text-sm text-primary font-medium">{item.price.toFixed(2)} ₽</div>
        {!loading && product && (
          <div className="text-xs text-muted-foreground">
            Остаток: {stockQuantity} {product.unit}
            {stockQuantity < item.quantity && (
              <span className="text-red-500 ml-2">⚠️ Недостаточно!</span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg"
          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
        >
          <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
        <Input
          type="number"
          value={item.quantity}
          onChange={(e) => onUpdateQuantity(item.id, parseInt(e.target.value) || 0)}
          className="w-12 sm:w-14 h-8 sm:h-10 text-center text-sm sm:text-base"
        />
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg"
          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
        >
          <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
        <Button
          variant="destructive"
          size="icon"
          className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg ml-1 sm:ml-2"
          onClick={() => onRemove(item.id)}
        >
          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
        </Button>
      </div>
      <div className="font-bold text-base sm:text-lg w-16 sm:w-20 text-right">
        {(item.price * item.quantity).toFixed(2)} ₽
      </div>
    </div>
  );
};