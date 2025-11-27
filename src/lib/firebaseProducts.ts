import { firebaseDb } from './firebase';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc,
  query,
  where
} from 'firebase/firestore';

export interface FirebaseProduct {
  id?: string;
  barcode: string;
  name: string;
  purchasePrice: number;
  salePrice: number;
  quantity: number;
  unit: string;
  category?: string;
  imageUrl?: string;
  imageFileId?: string;
  expiryDate?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

const PRODUCTS_COLLECTION = 'products';
const PRODUCT_IMAGES_COLLECTION = 'product_images';

// Сохранить товар
export const saveFirebaseProduct = async (product: FirebaseProduct): Promise<boolean> => {
  try {
    const docRef = doc(firebaseDb, PRODUCTS_COLLECTION, product.barcode);
    await setDoc(docRef, {
      ...product,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log('Product saved to Firebase:', product.barcode);
    return true;
  } catch (error) {
    console.error('Error saving product to Firebase:', error);
    return false;
  }
};

// Получить товар по штрих-коду
export const getFirebaseProduct = async (barcode: string): Promise<FirebaseProduct | null> => {
  try {
    const docRef = doc(firebaseDb, PRODUCTS_COLLECTION, barcode);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as FirebaseProduct;
    }
    return null;
  } catch (error) {
    console.error('Error getting product from Firebase:', error);
    return null;
  }
};

// Получить все товары
export const getAllFirebaseProducts = async (): Promise<FirebaseProduct[]> => {
  try {
    const querySnapshot = await getDocs(collection(firebaseDb, PRODUCTS_COLLECTION));
    const products: FirebaseProduct[] = [];
    
    querySnapshot.forEach((doc) => {
      products.push({ id: doc.id, ...doc.data() } as FirebaseProduct);
    });
    
    console.log('Loaded products from Firebase:', products.length);
    return products;
  } catch (error) {
    console.error('Error getting all products from Firebase:', error);
    return [];
  }
};

// Обновить количество товара
export const updateFirebaseProductQuantity = async (
  barcode: string, 
  quantityChange: number
): Promise<boolean> => {
  try {
    const product = await getFirebaseProduct(barcode);
    if (!product) return false;
    
    const newQuantity = Math.max(0, product.quantity + quantityChange);
    const docRef = doc(firebaseDb, PRODUCTS_COLLECTION, barcode);
    
    await updateDoc(docRef, {
      quantity: newQuantity,
      updatedAt: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    console.error('Error updating product quantity:', error);
    return false;
  }
};

// Удалить товар
export const deleteFirebaseProduct = async (barcode: string): Promise<boolean> => {
  try {
    await deleteDoc(doc(firebaseDb, PRODUCTS_COLLECTION, barcode));
    return true;
  } catch (error) {
    console.error('Error deleting product from Firebase:', error);
    return false;
  }
};

// Сохранить изображение товара
export const saveFirebaseProductImage = async (
  barcode: string,
  imageUrl: string,
  fileId?: string
): Promise<boolean> => {
  try {
    const imageDoc = {
      barcode,
      imageUrl,
      fileId: fileId || null,
      createdAt: new Date().toISOString()
    };
    
    const docRef = doc(collection(firebaseDb, PRODUCT_IMAGES_COLLECTION));
    await setDoc(docRef, imageDoc);
    
    // Обновить imageUrl в товаре
    const productRef = doc(firebaseDb, PRODUCTS_COLLECTION, barcode);
    await updateDoc(productRef, {
      imageUrl,
      imageFileId: fileId || null,
      updatedAt: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    console.error('Error saving product image to Firebase:', error);
    return false;
  }
};

// Получить изображения товара
export const getFirebaseProductImages = async (barcode: string): Promise<string[]> => {
  try {
    const q = query(
      collection(firebaseDb, PRODUCT_IMAGES_COLLECTION),
      where('barcode', '==', barcode)
    );
    
    const querySnapshot = await getDocs(q);
    const images: string[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.imageUrl) {
        images.push(data.imageUrl);
      }
    });
    
    return images;
  } catch (error) {
    console.error('Error getting product images:', error);
    return [];
  }
};

// Поиск товаров по названию
export const searchFirebaseProducts = async (searchTerm: string): Promise<FirebaseProduct[]> => {
  try {
    const allProducts = await getAllFirebaseProducts();
    const lowerSearch = searchTerm.toLowerCase();
    
    return allProducts.filter(p => 
      p.name.toLowerCase().includes(lowerSearch) ||
      p.barcode.includes(searchTerm)
    );
  } catch (error) {
    console.error('Error searching products:', error);
    return [];
  }
};

// Получить товары с истекающим сроком
export const getExpiringFirebaseProducts = async (days: number = 30): Promise<FirebaseProduct[]> => {
  try {
    const allProducts = await getAllFirebaseProducts();
    const now = new Date();
    const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    
    return allProducts.filter(p => {
      if (!p.expiryDate) return false;
      const expiry = new Date(p.expiryDate);
      return expiry <= futureDate && expiry >= now;
    });
  } catch (error) {
    console.error('Error getting expiring products:', error);
    return [];
  }
};
