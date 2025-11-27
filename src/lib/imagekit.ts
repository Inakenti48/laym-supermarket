import { supabase } from "@/integrations/supabase/client";

interface UploadResult {
  success: boolean;
  url?: string;
  fileId?: string;
  name?: string;
  thumbnailUrl?: string;
  error?: string;
}

export const uploadToImageKit = async (
  base64Image: string,
  fileName?: string,
  folder: string = '/products'
): Promise<UploadResult> => {
  try {
    const { data, error } = await supabase.functions.invoke('upload-to-imagekit', {
      body: {
        base64Image,
        fileName,
        folder,
      },
    });

    if (error) {
      console.error('ImageKit upload error:', error);
      return { success: false, error: error.message };
    }

    return data;
  } catch (err) {
    console.error('ImageKit upload exception:', err);
    return { success: false, error: String(err) };
  }
};

export const uploadProductImage = async (
  base64Image: string,
  barcode: string
): Promise<string | null> => {
  const fileName = `product_${barcode}_${Date.now()}.jpg`;
  const result = await uploadToImageKit(base64Image, fileName, '/products');
  
  if (result.success && result.url) {
    return result.url;
  }
  
  console.error('Failed to upload product image:', result.error);
  return null;
};
