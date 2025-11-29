import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PhotoReportsTab } from './PhotoReportsTab';
import { Card } from '@/components/ui/card';
import { FileText, Image, TrendingUp, X } from 'lucide-react';
import { getAllProducts } from '@/lib/storage';
import { getSuppliers } from '@/lib/suppliersDb';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const ReportsTab = () => {
  const [activeTab, setActiveTab] = useState('products');
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        console.log('📊 Загрузка данных для отчётов...');
        const [productsData, suppliersData] = await Promise.all([
          getAllProducts(),
          getSuppliers()
        ]);
        console.log(`✅ Загружено товаров: ${productsData.length}, поставщиков: ${suppliersData.length}`);
        setProducts(productsData);
        setSuppliers(suppliersData);
      } catch (error) {
        console.error('❌ Ошибка загрузки данных отчётов:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();

    // Подписка на Firebase realtime обновления товаров
    const { collection, onSnapshot } = require('firebase/firestore');
    const { firebaseDb } = require('@/lib/firebase');
    
    const unsubscribe = onSnapshot(
      collection(firebaseDb, 'products'),
      () => {
        console.log('🔄 Products updated - reloading reports');
        loadData();
      },
      (error: any) => console.error('Firebase error:', error)
    );

    return () => {
      unsubscribe();
    };
  }, [activeTab]);

  // Статистика товаров
  const totalProducts = products.length;
  const totalValue = products.reduce((sum, p) => sum + (p.purchasePrice * p.quantity), 0);
  const totalRetailValue = products.reduce((sum, p) => sum + (p.retailPrice * p.quantity), 0);
  const potentialProfit = totalRetailValue - totalValue;
  const totalDebt = products.reduce((sum, p) => sum + p.debtAmount, 0);

  // Статистика поставщиков
  const totalSuppliers = suppliers.length;
  const totalSupplierDebt = suppliers.reduce((sum, s) => sum + s.totalDebt, 0);

  // Товары по категориям
  const categoriesMap = new Map<string, { count: number; value: number }>();
  products.forEach(p => {
    const existing = categoriesMap.get(p.category) || { count: 0, value: 0 };
    categoriesMap.set(p.category, {
      count: existing.count + 1,
      value: existing.value + (p.purchasePrice * p.quantity)
    });
  });
  const categories = Array.from(categoriesMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.value - a.value);

  // Фильтрация товаров по выбранной категории
  const filteredProducts = selectedCategory 
    ? products.filter(p => p.category === selectedCategory)
    : products;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Отчёты</h2>
        <p className="text-muted-foreground mt-2">
          Просмотр отчётов по товарам, поставщикам и фотоотчётам
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="products">
            <FileText className="h-4 w-4 mr-2" />
            Товары
          </TabsTrigger>
          <TabsTrigger value="suppliers">
            <TrendingUp className="h-4 w-4 mr-2" />
            Поставщики
          </TabsTrigger>
          <TabsTrigger value="photos">
            <Image className="h-4 w-4 mr-2" />
            Фотоотчёты
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Загрузка данных...</p>
              </div>
            </div>
          ) : (
            <>
          {/* Общая статистика */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Всего товаров</div>
              <div className="text-2xl font-bold mt-2">{totalProducts}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Стоимость закупки</div>
              <div className="text-2xl font-bold mt-2">{totalValue.toFixed(2)}₽</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Розничная стоимость</div>
              <div className="text-2xl font-bold mt-2">{totalRetailValue.toFixed(2)}₽</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Потенциальная прибыль</div>
              <div className="text-2xl font-bold mt-2 text-success">{potentialProfit.toFixed(2)}₽</div>
            </Card>
          </div>

          {/* Задолженность по товарам */}
          {totalDebt > 0 && (
            <Card className="p-6 border-destructive/50 bg-destructive/5">
              <h3 className="font-semibold text-lg mb-2">Общая задолженность по товарам</h3>
              <div className="text-3xl font-bold text-destructive">{totalDebt.toFixed(2)}₽</div>
            </Card>
          )}

          {/* Товары по категориям */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Товары по категориям</h3>
              {selectedCategory && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                  className="h-8"
                >
                  <X className="h-3 w-3 mr-1" />
                  Показать все
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setSelectedCategory(cat.name === selectedCategory ? null : cat.name)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-all ${
                    selectedCategory === cat.name
                      ? 'bg-primary text-primary-foreground shadow-md scale-[1.02]'
                      : 'bg-muted/50 hover:bg-muted hover:shadow-sm'
                  }`}
                >
                  <div className="text-left">
                    <div className="font-medium">{cat.name}</div>
                    <div className={`text-sm ${selectedCategory === cat.name ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                      {cat.count} товаров
                    </div>
                  </div>
                  <Badge variant={selectedCategory === cat.name ? "secondary" : "secondary"}>
                    {cat.value.toFixed(2)}₽
                  </Badge>
                </button>
              ))}
            </div>
          </Card>

          {/* Список всех товаров */}
          <Card className="p-6">
            <h3 className="font-semibold text-lg mb-4">
              {selectedCategory ? `${selectedCategory} (${filteredProducts.length})` : `Все товары (${products.length})`}
            </h3>
            <ScrollArea className="h-[600px] w-full">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Категория</TableHead>
                      <TableHead>Штрихкод</TableHead>
                      <TableHead className="text-right">Количество</TableHead>
                      <TableHead className="text-right">Закуп</TableHead>
                      <TableHead className="text-right">Розница</TableHead>
                      <TableHead className="text-right">Итого</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Нет товаров в этой категории
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.category}</TableCell>
                          <TableCell className="font-mono text-xs">{product.barcode}</TableCell>
                          <TableCell className="text-right">
                            {product.quantity} шт
                          </TableCell>
                          <TableCell className="text-right">{product.purchasePrice}₽</TableCell>
                          <TableCell className="text-right">{product.retailPrice}₽</TableCell>
                          <TableCell className="text-right font-semibold">
                            {(product.purchasePrice * product.quantity).toFixed(2)}₽
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Загрузка данных...</p>
              </div>
            </div>
          ) : (
            <>
          {/* Статистика поставщиков */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Всего поставщиков</div>
              <div className="text-2xl font-bold mt-2">{totalSuppliers}</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm font-medium text-muted-foreground">Общая задолженность</div>
              <div className="text-2xl font-bold mt-2 text-destructive">
                {totalSupplierDebt.toFixed(2)}₽
              </div>
            </Card>
          </div>

          {/* Список поставщиков */}
          <Card className="p-6">
            <h3 className="font-semibold text-lg mb-4">Поставщики</h3>
            {suppliers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Нет поставщиков
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead className="text-right">Операций</TableHead>
                      <TableHead className="text-right">Задолженность</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers.map((supplier) => (
                      <TableRow key={supplier.id}>
                        <TableCell className="font-medium">{supplier.name}</TableCell>
                        <TableCell>{supplier.phone}</TableCell>
                        <TableCell className="text-right">
                          {supplier.paymentHistory.length}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={supplier.totalDebt > 0 ? 'destructive' : 'secondary'}>
                            {supplier.totalDebt.toFixed(2)}₽
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="photos">
          <PhotoReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
