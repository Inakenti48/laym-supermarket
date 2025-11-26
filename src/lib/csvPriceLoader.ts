// Utility to load prices from CSV product database by barcode
const CSV_FILES = [
  '/data/products_part_1.csv',
  '/data/products_part_2.csv',
  '/data/products_part_3.csv',
  '/data/products_part_4.csv',
];

interface CSVProductPrice {
  barcode: string;
  purchase_price: number;
  sale_price: number;
  name?: string;
  category?: string;
}

let cachedProducts: CSVProductPrice[] | null = null;

export const loadCSVPrices = async (): Promise<CSVProductPrice[]> => {
  if (cachedProducts) {
    return cachedProducts;
  }

  const allProducts: CSVProductPrice[] = [];

  for (const file of CSV_FILES) {
    try {
      const response = await fetch(file);
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim());

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(p => p.trim());
        if (parts.length < 7) continue;

        const barcode = parts[0];
        const name = parts[1];
        const category = parts[2];
        const purchasePrice = parseFloat(parts[4]) || 0;
        const salePrice = parseFloat(parts[5]) || 0;

        if (barcode) {
          allProducts.push({
            barcode,
            purchase_price: purchasePrice,
            sale_price: salePrice,
            name,
            category
          });
        }
      }
    } catch (error) {
      console.error(`Error loading ${file}:`, error);
    }
  }

  cachedProducts = allProducts;
  return allProducts;
};

export const findPricesByBarcode = async (barcode: string): Promise<CSVProductPrice | null> => {
  const products = await loadCSVPrices();
  return products.find(p => p.barcode === barcode) || null;
};

export const clearPriceCache = () => {
  cachedProducts = null;
};
