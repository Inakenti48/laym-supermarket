import { X, Edit2, Check, ZoomIn, ChevronLeft, ChevronRight, Save, Plus, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QuickSupplierDialog } from './QuickSupplierDialog';
import { useState, useEffect, useRef } from 'react';

// Функция для нормализации URL фото (добавляет префикс base64 если нужно)
const normalizePhotoUrl = (src: string): string => {
  if (!src) return '';
  // Если уже полный URL или data URL - возвращаем как есть
  if (src.startsWith('http') || src.startsWith('data:')) {
    return src;
  }
  // Если похоже на base64 без префикса - добавляем
  if (src.startsWith('/9j/') || src.startsWith('iVBOR') || src.length > 100) {
    return `data:image/jpeg;base64,${src}`;
  }
  return src;
};

// Компонент миниатюры фото с обработкой ошибок
const PhotoThumbnail = ({ 
  src, 
  label, 
  color, 
  onClick 
}: { 
  src: string; 
  label?: string; 
  color?: 'green' | 'blue'; 
  onClick: () => void;
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const borderColor = color === 'green' ? 'border-green-500' : color === 'blue' ? 'border-blue-500' : 'border-border';
  const bgColor = color === 'green' ? 'bg-green-500' : color === 'blue' ? 'bg-blue-500' : 'bg-muted';
  
  const normalizedSrc = normalizePhotoUrl(src);

  if (hasError || !normalizedSrc) {
    return (
      <div 
        className={`relative w-14 h-14 rounded border-2 ${borderColor} bg-muted flex items-center justify-center cursor-pointer`}
        onClick={onClick}
      >
        {label && (
          <div className={`absolute -top-1 -left-1 ${bgColor} text-white text-xs px-1.5 py-0.5 rounded`}>{label}</div>
        )}
        <ImageOff className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div 
      className="relative cursor-pointer hover:opacity-80 transition-opacity group"
      onClick={onClick}
    >
      {isLoading && (
        <div className={`absolute inset-0 w-14 h-14 rounded border-2 ${borderColor} bg-muted animate-pulse`} />
      )}
      <img 
        src={normalizedSrc} 
        alt={label || 'Фото'} 
        className={`w-14 h-14 object-cover rounded border-2 ${borderColor} ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
      {label && (
        <div className={`absolute -top-1 -left-1 ${bgColor} text-white text-xs px-1.5 py-0.5 rounded`}>{label}</div>
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded flex items-center justify-center transition-all">
        <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  );
};

// Компонент увеличенного фото
const EnlargedPhoto = ({ 
  src, 
  label, 
  labelColor 
}: { 
  src: string; 
  label?: string; 
  labelColor?: 'green' | 'blue';
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const bgColor = labelColor === 'green' ? 'bg-green-500' : labelColor === 'blue' ? 'bg-blue-500' : 'bg-muted';
  const normalizedSrc = normalizePhotoUrl(src);

  if (hasError || !normalizedSrc) {
    return (
      <div className="w-full h-64 bg-muted rounded flex flex-col items-center justify-center gap-2">
        <ImageOff className="h-12 w-12 text-muted-foreground" />
        <span className="text-muted-foreground">Фото недоступно</span>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {isLoading && (
        <div className="absolute inset-0 bg-muted rounded animate-pulse flex items-center justify-center">
          <span className="text-muted-foreground">Загрузка...</span>
        </div>
      )}
      <img 
        src={normalizedSrc} 
        alt="Увеличенное фото" 
        className={`w-full h-auto max-h-[80vh] object-contain rounded ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
        }}
      />
      {label && !isLoading && !hasError && (
        <div className={`absolute top-2 left-2 ${bgColor} text-white px-2 py-1 rounded z-10`}>
          {label}
        </div>
      )}
    </div>
  );
};

export interface PendingProduct {
  id: string;
  barcode: string;
  name: string;
  category: string;
  purchasePrice: string;
  retailPrice: string;
  quantity: string;
  unit: string;
  expiryDate?: string;
  supplier?: string;
  photos: string[];
  frontPhoto?: string;
  barcodePhoto?: string;
}

interface Supplier {
  id: string;
  name: string;
  phone?: string;
  contactPerson?: string;
  address?: string;
}

interface PendingProductItemProps {
  product: PendingProduct;
  suppliers: Supplier[];
  onUpdate: (id: string, updates: Partial<PendingProduct>) => void;
  onRemove: (id: string) => void;
  onSave: (id: string) => void;
  onSupplierAdded: (supplier: Supplier) => void;
  autoEdit?: boolean;
  onMoveToNext?: () => void;
}

export const PendingProductItem = ({ product, suppliers, onUpdate, onRemove, onSave, onSupplierAdded, autoEdit, onMoveToNext }: PendingProductItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProduct, setEditedProduct] = useState(product);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoEdit && !isEditing) {
      setIsEditing(true);
      setEditedProduct(product);
    }
  }, [autoEdit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isEditing && autoEdit) {
        e.preventDefault();
        handleSaveAndNext();
      }
    };

    if (autoEdit && isEditing) {
      window.addEventListener('keydown', handleKeyDown);
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isEditing, autoEdit, editedProduct]);

  const handleSaveAndNext = () => {
    onUpdate(product.id, editedProduct);
    setIsEditing(false);
    if (onMoveToNext) {
      onMoveToNext();
    }
  };

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

  const isComplete = product.barcode && product.name && product.category && product.purchasePrice && product.retailPrice && product.quantity &&
    (product.frontPhoto || product.barcodePhoto || product.photos.length > 0);

  return (
    <Card ref={cardRef} className={`p-4 space-y-3 bg-background/50 shadow-sm hover:shadow-md transition-shadow ${autoEdit && isEditing ? 'ring-2 ring-primary' : ''}`}>
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
              <div className="space-y-2">
                <Input
                  placeholder="🔍 Поиск поставщика..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  className="h-10 text-sm"
                />
                <Select
                  value={editedProduct.supplier || ''}
                  onValueChange={(value) => {
                    setEditedProduct({ ...editedProduct, supplier: value });
                    setSupplierSearch('');
                  }}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Выберите поставщика" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-[100]">
                    {[...suppliers]
                      .filter(s => 
                        supplierSearch === '' || 
                        s.name.toLowerCase().includes(supplierSearch.toLowerCase())
                      )
                      .sort((a, b) => {
                        if (a.name === 'ААА') return -1;
                        if (b.name === 'ААА') return 1;
                        return a.name.localeCompare(b.name);
                      })
                      .map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.name}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSupplierDialog(true)}
                  className="w-full h-8 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Добавить поставщика
                </Button>
              </div>
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
                {product.supplier && <p className="leading-relaxed">Поставщик: {product.supplier}</p>}
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                {product.frontPhoto && (
                  <PhotoThumbnail 
                    src={product.frontPhoto} 
                    label="Л" 
                    color="green" 
                    onClick={() => handlePhotoClick(product.frontPhoto!)} 
                  />
                )}
                {product.barcodePhoto && (
                  <PhotoThumbnail 
                    src={product.barcodePhoto} 
                    label="Ш" 
                    color="blue" 
                    onClick={() => handlePhotoClick(product.barcodePhoto!)} 
                  />
                )}
                {product.photos.filter(p => p !== product.frontPhoto && p !== product.barcodePhoto).map((photo, idx) => (
                  <PhotoThumbnail 
                    key={idx}
                    src={photo} 
                    onClick={() => handlePhotoClick(photo)} 
                  />
                ))}
                {!product.frontPhoto && !product.barcodePhoto && product.photos.length === 0 && (
                  <div className="text-xs text-muted-foreground">Нет фото</div>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          {isEditing ? (
            <Button size="icon" variant="ghost" onClick={handleSave} className="h-8 w-8">
              <Check className="h-4 w-4" />
            </Button>
          ) : (
            <>
              <Button 
                size="icon" 
                variant="ghost" 
                onClick={() => onSave(product.id)} 
                className="h-8 w-8"
                disabled={!isComplete}
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)} className="h-8 w-8">
                <Edit2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button size="icon" variant="ghost" onClick={() => onRemove(product.id)} className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Quick Supplier Dialog */}
      <QuickSupplierDialog
        open={showSupplierDialog}
        onClose={() => setShowSupplierDialog(false)}
        onSupplierAdded={(newSupplier) => {
          // Добавляем поставщика в список
          onSupplierAdded(newSupplier);
          // Автоматически выбираем его
          setEditedProduct({ ...editedProduct, supplier: newSupplier.name });
          setShowSupplierDialog(false);
        }}
      />

      {/* Dialog для увеличенного просмотра фото */}
      <Dialog open={enlargedPhoto !== null} onOpenChange={(open) => !open && setEnlargedPhoto(null)}>
        <DialogContent className="max-w-4xl w-full p-2 sm:p-4">
          <div className="relative min-h-[200px] flex items-center justify-center">
            <EnlargedPhoto 
              src={enlargedPhoto || ''} 
              label={
                enlargedPhoto === product.frontPhoto ? 'Лицевая сторона' : 
                enlargedPhoto === product.barcodePhoto ? 'Штрихкод' : undefined
              }
              labelColor={
                enlargedPhoto === product.frontPhoto ? 'green' : 
                enlargedPhoto === product.barcodePhoto ? 'blue' : undefined
              }
            />
            
            {/* Навигация между фото */}
            {allPhotos.length > 1 && (
              <>
                {currentPhotoIndex > 0 && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-10"
                    onClick={handlePrevPhoto}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                )}
                {currentPhotoIndex < allPhotos.length - 1 && (
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-10"
                    onClick={handleNextPhoto}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                )}
                
                {/* Индикатор текущего фото */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded-full text-sm z-10">
                  {currentPhotoIndex + 1} / {allPhotos.length}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
