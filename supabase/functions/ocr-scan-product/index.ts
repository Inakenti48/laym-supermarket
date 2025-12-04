import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { frontPhoto, barcodePhoto, deviceId, userName } = await req.json();
    
    console.log('=== OCR SCAN START ===');
    console.log('Device:', deviceId);
    
    if (!frontPhoto && !barcodePhoto) {
      return new Response(
        JSON.stringify({ error: 'At least one photo is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OCR_API_KEY = Deno.env.get('OCR_SPACE_API_KEY');
    if (!OCR_API_KEY) {
      throw new Error('OCR_SPACE_API_KEY not configured');
    }

    // Используем фото штрихкода если есть, иначе фронтальное
    const imageToScan = barcodePhoto || frontPhoto;
    
    // Подготавливаем base64 для OCR.space
    let base64Data = imageToScan;
    if (imageToScan.startsWith('data:')) {
      // Уже в формате data URL, берем только base64 часть
      base64Data = imageToScan;
    }

    // Вызываем OCR.space API для распознавания текста и штрихкода
    const formData = new FormData();
    formData.append('base64Image', base64Data);
    formData.append('language', 'rus');
    formData.append('isOverlayRequired', 'false');
    formData.append('detectOrientation', 'true');
    formData.append('scale', 'true');
    formData.append('OCREngine', '2'); // Engine 2 лучше для мелкого текста
    
    console.log('🔍 Calling OCR.space API...');
    
    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: {
        'apikey': OCR_API_KEY,
      },
      body: formData,
    });

    if (!ocrResponse.ok) {
      const errorText = await ocrResponse.text();
      console.error('OCR.space error:', ocrResponse.status, errorText);
      throw new Error(`OCR.space error: ${ocrResponse.status}`);
    }

    const ocrData = await ocrResponse.json();
    const ocrTime = Date.now() - startTime;
    console.log(`⚡ OCR выполнен за ${ocrTime}ms`);
    console.log('OCR response:', JSON.stringify(ocrData).slice(0, 500));

    // Извлекаем распознанный текст
    let fullText = '';
    if (ocrData.ParsedResults && ocrData.ParsedResults.length > 0) {
      fullText = ocrData.ParsedResults.map((r: any) => r.ParsedText || '').join('\n');
    }

    console.log('📝 Распознанный текст:', fullText.slice(0, 300));

    // Извлекаем штрихкод из текста (ищем последовательности цифр 8-14 символов)
    let barcode = '';
    const barcodePatterns = fullText.match(/\b\d{8,14}\b/g);
    if (barcodePatterns && barcodePatterns.length > 0) {
      // Берем первый найденный штрихкод (обычно EAN-13 или EAN-8)
      barcode = barcodePatterns.find(b => b.length === 13) || 
                barcodePatterns.find(b => b.length === 8) || 
                barcodePatterns[0];
      console.log('🔢 Найден штрихкод:', barcode);
    }

    // Если штрихкод не найден в тексте, пробуем отдельный запрос для штрихкода
    if (!barcode && barcodePhoto) {
      console.log('🔄 Пробуем отдельное распознавание штрихкода...');
      
      const barcodeFormData = new FormData();
      barcodeFormData.append('base64Image', barcodePhoto);
      barcodeFormData.append('language', 'eng');
      barcodeFormData.append('isOverlayRequired', 'false');
      barcodeFormData.append('OCREngine', '2');
      barcodeFormData.append('scale', 'true');
      
      try {
        const barcodeOcrResponse = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          headers: {
            'apikey': OCR_API_KEY,
          },
          body: barcodeFormData,
        });

        if (barcodeOcrResponse.ok) {
          const barcodeOcrData = await barcodeOcrResponse.json();
          if (barcodeOcrData.ParsedResults && barcodeOcrData.ParsedResults.length > 0) {
            const barcodeText = barcodeOcrData.ParsedResults.map((r: any) => r.ParsedText || '').join('\n');
            const barcodeMatch = barcodeText.match(/\b\d{8,14}\b/g);
            if (barcodeMatch) {
              barcode = barcodeMatch.find((b: string) => b.length === 13) || 
                       barcodeMatch.find((b: string) => b.length === 8) || 
                       barcodeMatch[0];
              console.log('🔢 Штрихкод из отдельного фото:', barcode);
            }
          }
        }
      } catch (e) {
        console.error('Barcode OCR error:', e);
      }
    }

    // Извлекаем название и категорию из текста
    let name = '';
    let category = '';

    // Простая эвристика для извлечения названия
    const lines = fullText.split('\n').filter(l => l.trim().length > 2);
    if (lines.length > 0) {
      // Берем первые несколько строк как название
      name = lines.slice(0, 3).join(' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
    }

    // Определяем категорию по ключевым словам
    const textLower = fullText.toLowerCase();
    if (textLower.includes('молок') || textLower.includes('кефир') || textLower.includes('йогурт') || textLower.includes('творог') || textLower.includes('сметан')) {
      category = 'Молочные продукты';
    } else if (textLower.includes('сок') || textLower.includes('напит') || textLower.includes('вода') || textLower.includes('лимонад')) {
      category = 'Напитки';
    } else if (textLower.includes('каша') || textLower.includes('пюре') || textLower.includes('смесь')) {
      category = 'Детское питание';
    } else if (textLower.includes('шампунь') || textLower.includes('мыло') || textLower.includes('крем') || textLower.includes('гель')) {
      category = 'Гигиена';
    } else if (textLower.includes('подгузник') || textLower.includes('памперс') || textLower.includes('huggies') || textLower.includes('libero')) {
      category = 'Подгузники';
    } else if (textLower.includes('хлеб') || textLower.includes('батон') || textLower.includes('булк')) {
      category = 'Хлеб и выпечка';
    } else if (textLower.includes('колбас') || textLower.includes('сосиск') || textLower.includes('мясо')) {
      category = 'Мясные изделия';
    } else if (textLower.includes('печень') || textLower.includes('конфет') || textLower.includes('шоколад') || textLower.includes('вафл')) {
      category = 'Кондитерские изделия';
    } else {
      category = 'Другое';
    }

    const totalTime = Date.now() - startTime;
    console.log(`📦 Результат: ${barcode} - ${name.slice(0, 50)}... (${category})`);
    console.log(`=== OCR SCAN DONE in ${totalTime}ms ===`);

    return new Response(
      JSON.stringify({
        success: true,
        barcode,
        name,
        category,
        rawText: fullText.slice(0, 500),
        processingTime: totalTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OCR scan error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
