/**
 * Сжимает изображение для быстрой отправки на сервер
 * Уменьшает размер в 5-10 раз без значительной потери качества
 */
export const compressImage = async (
  base64Image: string,
  maxWidth: number = 800,
  quality: number = 0.7
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Пропорциональное масштабирование
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Улучшение качества отрисовки
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Конвертируем в JPEG с указанным качеством
      const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
      
      const originalSize = (base64Image.length * 3) / 4;
      const compressedSize = (compressedBase64.length * 3) / 4;
      const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);
      
      console.log(`📦 Изображение сжато: ${(originalSize / 1024).toFixed(0)}KB → ${(compressedSize / 1024).toFixed(0)}KB (уменьшение ${reduction}%)`);
      
      resolve(compressedBase64);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    img.src = base64Image;
  });
};

/**
 * Быстрое агрессивное сжатие для AI распознавания
 */
export const compressForAI = async (base64Image: string): Promise<string> => {
  return compressImage(base64Image, 640, 0.6);
};
