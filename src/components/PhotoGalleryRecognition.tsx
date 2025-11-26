import { useState, useRef } from 'react';
import { Image, X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { compressForAI } from '@/lib/imageCompression';
import { getAllProducts } from '@/lib/storage';

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
  
  // Буфер для отложенных уведомлений
  const toastBufferRef = useRef<Array<{ type: 'success' | 'error' | 'info' | 'warning'; message: string }>>([]);
  
  // Хелпер для буферизации тостов
  const bufferedToast = {
    success: (msg: string) => toastBufferRef.current.push({ type: 'success', message: msg }),
    error: (msg: string) => toastBufferRef.current.push({ type: 'error', message: msg }),
    info: (msg: string) => toastBufferRef.current.push({ type: 'info', message: msg }),
    warning: (msg: string) => toastBufferRef.current.push({ type: 'warning', message: msg })
  };
  
  // При закрытии показываем все буферизованные тосты внизу
  const handleClose = () => {
    if (toastBufferRef.current.length > 0) {
      toastBufferRef.current.forEach(({ type, message }) => {
        toast[type](message, { position: 'bottom-center' });
      });
      toastBufferRef.current = [];
    }
    onClose();
  };

  const handleFileSelect = async (file: File, type: 'front' | 'barcode') => {
    if (!file.type.startsWith('image/')) {
      bufferedToast.error('Пожалуйста, выберите изображение');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (type === 'front') {
        setFrontPhoto(base64);
        bufferedToast.success('✅ Лицевое фото загружено');
      } else {
        setBarcodePhoto(base64);
        bufferedToast.success('✅ Фото штрихкода загружено');
      }
    };
    reader.readAsDataURL(file);
  };

  const recognizeFromPhotos = async () => {
    if (!frontPhoto || !barcodePhoto) {
      bufferedToast.error('Загрузите оба фото');
      return;
    }

    setIsProcessing(true);
    try {
      // Шаг 1: Попытка найти существующий товар по фото
      console.log('🔍 Пытаемся найти существующий товар по фото...');
      
      const existingProducts = await getAllProducts();
      const productsWithImages = existingProducts.filter(p => p.photos && p.photos.length > 0);
      
      if (productsWithImages.length > 0) {
        console.log(`📸 Найдено ${productsWithImages.length} товаров с фото`);
        
        // Сжимаем фото для экономии трафика
        const compressedFront = await compressForAI(frontPhoto);
        const compressedBarcode = await compressForAI(barcodePhoto);
        
        try {
          const { data: matchData, error: matchError } = await supabase.functions.invoke(
            'recognize-product-by-photo',
            {
              body: { 
                frontPhoto: compressedFront,
                barcodePhoto: compressedBarcode
              }
            }
          );

          if (matchError) {
            console.warn('⚠️ Ошибка проверки в базе, переходим к AI:', matchError);
          } else if (matchData?.recognized && matchData.barcode !== 'UNKNOWN') {
            console.log('✅ Товар найден в базе:', matchData.barcode);
            bufferedToast.success(`✅ Товар найден: ${matchData.productName}`);
            
            onProductFound({
              barcode: matchData.barcode,
              name: matchData.productName,
              category: matchData.category,
              frontPhoto,
              barcodePhoto
            });
            handleClose();
            return;
          }
        } catch (checkError) {
          console.warn('⚠️ Ошибка проверки товара в базе, продолжаем с AI распознаванием:', checkError);
        }
        
        console.log('ℹ️ Товар не найден в базе, переходим к AI распознаванию');
      }

      // Шаг 2: AI распознавание если товар не найден
      console.log('🤖 Запускаем AI распознавание...');
      
      // Загружаем фото во временное хранилище
      const frontBlob = await fetch(frontPhoto).then(r => r.blob());
      const barcodeBlob = await fetch(barcodePhoto).then(r => r.blob());
      
      const frontFileName = `temp-front-${Date.now()}.jpg`;
      const barcodeFileName = `temp-barcode-${Date.now()}.jpg`;
      
      const { data: frontUpload, error: frontUploadError } = await supabase.storage
        .from('product-photos')
        .upload(`temporary/${frontFileName}`, frontBlob);
      
      const { data: barcodeUpload, error: barcodeUploadError } = await supabase.storage
        .from('product-photos')
        .upload(`temporary/${barcodeFileName}`, barcodeBlob);
      
      if (frontUploadError || barcodeUploadError) {
        throw new Error('Ошибка загрузки фото');
      }
      
      const { data: { publicUrl: frontUrl } } = supabase.storage
        .from('product-photos')
        .getPublicUrl(`temporary/${frontFileName}`);
      
      const { data: { publicUrl: barcodeUrl } } = supabase.storage
        .from('product-photos')
        .getPublicUrl(`temporary/${barcodeFileName}`);

      // Вызываем edge function для распознавания
      bufferedToast.info('🤖 AI анализирует фотографии...');
      
      const { data: scanData, error: scanError } = await supabase.functions.invoke(
        'scan-product-photos',
        {
          body: {
            frontPhoto: frontUrl,
            barcodePhoto: barcodeUrl
          }
        }
      );

      if (scanError) {
        console.error('❌ Ошибка AI распознавания:', scanError);
        throw new Error(`Не удалось распознать товар: ${scanError.message || 'неизвестная ошибка'}`);
      }

      console.log('✅ AI распознавание завершено:', scanData);
      
      const barcode = scanData?.barcode || '';
      const name = scanData?.name || '';
      const category = scanData?.category || '';
      
      if (!barcode && !name) {
        bufferedToast.error('❌ Не удалось распознать товар');
        return;
      }
      
      bufferedToast.success(`✅ Распознано: ${name || 'товар'}`);
      
      onProductFound({
        barcode,
        name,
        category,
        frontPhoto,
        barcodePhoto
      });
      handleClose();
      
    } catch (error: any) {
      console.error('❌ Критическая ошибка распознавания:', error);
      const errorMessage = error.message || 'Не удалось распознать товар';
      bufferedToast.error(`❌ ${errorMessage}. Попробуйте сделать более чёткие фотографии.`);
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
          <Button onClick={handleClose} variant="ghost" size="icon">
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
