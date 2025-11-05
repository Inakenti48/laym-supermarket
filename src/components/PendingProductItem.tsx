import { X, Edit2, Check, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  // Собираем все фото в один массив
  const allPhotos = [
    ...(product.frontPhoto ? [product.frontPhoto] : []),
    ...(product.barcodePhoto ? [product.barcodePhoto] : []),
    ...product.photos.filter(p => p !== product.frontPhoto && p !== product.barcodePhoto)
  ];

  const handlePhotoClick = (photo: string) => {
    const index = allPhotos.indexOf(photo);
    setCurrentPhotoIndex(index);
    setEnlargedPhoto(photo);
  };

  const handleNextPhoto = () => {
    if (currentPhotoIndex < allPhotos.length - 1) {
      setCurrentPhotoIndex(currentPhotoIndex + 1);
      setEnlargedPhoto(allPhotos[currentPhotoIndex + 1]);
    }
  };

  const handlePrevPhoto = () => {
    if (currentPhotoIndex > 0) {
      setCurrentPhotoIndex(currentPhotoIndex - 1);
      setEnlargedPhoto(allPhotos[currentPhotoIndex - 1]);
    }
  };

  const handleSave = () => {
    onUpdate(product.id, editedProduct);
    setIsEditing(false);
  };

  const isComplete = product.name && product.category && product.purchasePrice && product.retailPrice && product.quantity;

  return (
    <Card className="p-4 space-y-3 bg-background/50 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-3">
              <Input
                value={editedProduct.name}
                onChange={(e) => setEditedProduct({ ...editedProduct, name: e.target.value })}
                placeholder="Название"
                className="h-10 text-sm"
              />
              <Input
                value={editedProduct.category}
                onChange={(e) => setEditedProduct({ ...editedProduct, category: e.target.value })}
                placeholder="Категория"
                className="h-10 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={editedProduct.purchasePrice}
                  onChange={(e) => setEditedProduct({ ...editedProduct, purchasePrice: e.target.value })}
                  placeholder="Закуп"
                  className="h-10 text-sm"
                />
                <Input
                  type="number"
                  value={editedProduct.retailPrice}
                  onChange={(e) => setEditedProduct({ ...editedProduct, retailPrice: e.target.value })}
                  placeholder="Розница"
                  className="h-10 text-sm"
                />
              </div>
              <Input
                type="number"
                value={editedProduct.quantity}
                onChange={(e) => setEditedProduct({ ...editedProduct, quantity: e.target.value })}
                placeholder="Количество"
                className="h-10 text-sm"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="font-medium text-base truncate">{product.name || 'Без названия'}</h4>
                {isComplete ? (
                  <Badge variant="default" className="text-xs px-2 py-0.5">Готов</Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs px-2 py-0.5">Не заполнен</Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground space-y-1.5">
                {product.barcode && <p className="leading-relaxed">Штрихкод: {product.barcode}</p>}
                {product.category && <p className="leading-relaxed">Категория: {product.category}</p>}
                {product.purchasePrice && <p className="leading-relaxed">Закуп: {product.purchasePrice}₽</p>}
                {product.retailPrice && <p className="leading-relaxed">Розница: {product.retailPrice}₽</p>}
                {product.quantity && <p className="leading-relaxed">Кол-во: {product.quantity} {product.unit}</p>}
              </div>
              {(product.frontPhoto || product.barcodePhoto || product.photos.length > 0) && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {product.frontPhoto && (
                    <div 
                      className="relative cursor-pointer hover:opacity-80 transition-opacity group"
                      onClick={() => handlePhotoClick(product.frontPhoto!)}
                    >
                      <img src={product.frontPhoto} alt="Лицевая" className="w-14 h-14 object-cover rounded border-2 border-green-500" />
                      <div className="absolute -top-1 -left-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">Л</div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded flex items-center justify-center transition-all">
                        <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  )}
                  {product.barcodePhoto && (
                    <div 
                      className="relative cursor-pointer hover:opacity-80 transition-opacity group"
                      onClick={() => handlePhotoClick(product.barcodePhoto!)}
                    >
                      <img src={product.barcodePhoto} alt="Штрихкод" className="w-14 h-14 object-cover rounded border-2 border-blue-500" />
                      <div className="absolute -top-1 -left-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">Ш</div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded flex items-center justify-center transition-all">
                        <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  )}
                  {product.photos.filter(p => p !== product.frontPhoto && p !== product.barcodePhoto).map((photo, idx) => (
                    <div 
                      key={idx}
                      className="relative cursor-pointer hover:opacity-80 transition-opacity group"
                      onClick={() => handlePhotoClick(photo)}
                    >
                      <img src={photo} alt={`Фото ${idx + 1}`} className="w-14 h-14 object-cover rounded border" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded flex items-center justify-center transition-all">
                        <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {isEditing ? (
            <Button size="icon" variant="ghost" onClick={handleSave} className="h-8 w-8">
              <Check className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)} className="h-8 w-8">
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => onRemove(product.id)} className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Dialog для увеличенного просмотра фото */}
      <Dialog open={enlargedPhoto !== null} onOpenChange={(open) => !open && setEnlargedPhoto(null)}>
        <DialogContent className="max-w-4xl w-full p-2">
          <div className="relative">
            <img 
              src={enlargedPhoto || ''} 
              alt="Увеличенное фото" 
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
            
            {/* Навигация между фото */}
            {allPhotos.length > 1 && (
              <>
                {currentPhotoIndex > 0 && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                    onClick={handlePrevPhoto}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                )}
                {currentPhotoIndex < allPhotos.length - 1 && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={handleNextPhoto}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                )}
                
                {/* Индикатор текущего фото */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm">
                  {currentPhotoIndex + 1} / {allPhotos.length}
                </div>
              </>
            )}

            {/* Метки для типа фото */}
            {enlargedPhoto === product.frontPhoto && (
              <div className="absolute top-2 left-2 bg-green-500 text-white px-2 py-1 rounded">
                Лицевая сторона
              </div>
            )}
            {enlargedPhoto === product.barcodePhoto && (
              <div className="absolute top-2 left-2 bg-blue-500 text-white px-2 py-1 rounded">
                Штрихкод
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
