import { useState } from 'react';
import { Image, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getAllProducts, findProductByBarcode } from '@/lib/storage';

interface PhotoGalleryRecognitionProps {
  onProductFound: (data: { 
    barcode: string; 
    name?: string; 
    category?: string; 
    frontPhoto?: string; 
    barcodePhoto?: string;
  }) => void;
  onClose: () => void;
}

export const PhotoGalleryRecognition = ({ onProductFound, onClose }: PhotoGalleryRecognitionProps) => {
  const [frontPhoto, setFrontPhoto] = useState<string>('');
  const [barcodePhoto, setBarcodePhoto] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = async (file: File, type: 'front' | 'barcode') => {
    if (!file.type.startsWith('image/')) {
      toast.error('Пожалуйста, выберите изображение');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (type === 'front') {
        setFrontPhoto(base64);
        toast.success('✅ Лицевое фото загружено');
      } else {
        setBarcodePhoto(base64);
        toast.success('✅ Фото штрихкода загружено');
      }
    };
    reader.readAsDataURL(file);
  };

  const recognizeFromPhotos = async () => {
    if (!frontPhoto || !barcodePhoto) {
      toast.error('Загрузите оба фото');
      return;
    }

    setIsProcessing(true);
    try {
      // AI распознавание отключено (Supabase удален)
      console.log('⚠️ AI распознавание отключено');
      toast.warning('⚠️ AI распознавание временно недоступно. Добавьте товар вручную.', { position: 'top-center' });
      
      // Передаем фото без распознавания
      onProductFound({
        barcode: '',
        name: '',
        category: '',
        frontPhoto,
        barcodePhoto
      });
      onClose();
      
    } catch (error: any) {
      console.error('Ошибка распознавания:', error);
      toast.error(`❌ Ошибка: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background z-50 p-4 overflow-y-auto">
      <Card className="max-w-2xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Image className="h-6 w-6" />
            Распознать из фото
          </h2>
          <Button onClick={onClose} variant="ghost" size="icon">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-6">
          {/* Лицевое фото */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              1. Лицевая сторона товара
            </label>
            <div className="border-2 border-dashed rounded-lg p-4">
              {frontPhoto ? (
                <div className="relative">
                  <img src={frontPhoto} alt="Front" className="w-full h-48 object-contain rounded" />
                  <Button
                    onClick={() => setFrontPhoto('')}
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer">
                  <Image className="h-12 w-12 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Нажмите для выбора фото</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file, 'front');
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Фото штрихкода */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              2. Штрихкод товара
            </label>
            <div className="border-2 border-dashed rounded-lg p-4">
              {barcodePhoto ? (
                <div className="relative">
                  <img src={barcodePhoto} alt="Barcode" className="w-full h-48 object-contain rounded" />
                  <Button
                    onClick={() => setBarcodePhoto('')}
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer">
                  <Image className="h-12 w-12 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Нажмите для выбора фото</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file, 'barcode');
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Кнопка распознавания */}
          <Button
            onClick={recognizeFromPhotos}
            disabled={!frontPhoto || !barcodePhoto || isProcessing}
            className="w-full"
            size="lg"
          >
            <Sparkles className="h-5 w-5 mr-2" />
            {isProcessing ? 'Распознаем...' : 'Распознать товар'}
          </Button>
        </div>
      </Card>
    </div>
  );
};
