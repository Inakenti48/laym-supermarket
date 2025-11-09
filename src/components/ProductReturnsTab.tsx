import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Printer, Plus } from 'lucide-react';
import { printReceiptBrowser } from '@/lib/printer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getSuppliers, Supplier } from '@/lib/suppliersDb';

interface ProductReturn {
  id: string;
  product_name: string;
  purchase_price: number;
  quantity: number;
  supplier?: string;
  note?: string;
  created_at: string;
}

export const ProductReturnsTab = () => {
  const [returns, setReturns] = useState<ProductReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  const [formData, setFormData] = useState({
    productName: '',
    purchasePrice: '',
    quantity: '',
    supplier: '',
    note: '',
  });

  useEffect(() => {
    loadReturns();
    loadSuppliers();
    
    // Realtime подписка
    const channel = supabase
      .channel('product_returns_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'product_returns'
        },
        () => {
          loadReturns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadSuppliers = async () => {
    const loadedSuppliers = await getSuppliers();
    setSuppliers(loadedSuppliers);
  };

  const loadReturns = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('product_returns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReturns(data || []);
    } catch (error) {
      console.error('Error loading returns:', error);
      toast.error('Ошибка загрузки возвратов');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.productName || !formData.purchasePrice || !formData.quantity) {
      toast.error('Заполните обязательные поля');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('product_returns')
        .insert({
          product_name: formData.productName,
          purchase_price: parseFloat(formData.purchasePrice),
          quantity: parseInt(formData.quantity),
          supplier: formData.supplier || null,
          note: formData.note || null,
        });

      if (error) throw error;

      toast.success('Возврат добавлен');
      setFormData({
        productName: '',
        purchasePrice: '',
        quantity: '',
        supplier: '',
        note: '',
      });
      loadReturns();
    } catch (error) {
      console.error('Error adding return:', error);
      toast.error('Ошибка добавления возврата');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (returnItem: ProductReturn) => {
    const now = new Date(returnItem.created_at);
    const itemTotal = returnItem.purchase_price * returnItem.quantity;
    const receiptData = {
      receiptNumber: returnItem.id.substring(0, 8).toUpperCase(),
      date: now.toLocaleDateString('ru-RU'),
      time: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      cashier: 'Склад',
      items: [
        {
          name: returnItem.product_name,
          quantity: returnItem.quantity,
          price: returnItem.purchase_price,
          total: itemTotal,
        },
      ],
      total: itemTotal,
      paymentMethod: `Возврат${returnItem.supplier ? ' (' + returnItem.supplier + ')' : ''}`,
      cashierName: 'Склад',
      cashierRole: 'inventory',
      change: 0,
      received: 0,
    };

    printReceiptBrowser(receiptData);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeft className="h-5 w-5" />
            Возврат товара
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="productName">Название товара *</Label>
                <Input
                  id="productName"
                  value={formData.productName}
                  onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  placeholder="Введите название"
                  required
                />
              </div>

              <div>
                <Label htmlFor="purchasePrice">Цена закупа *</Label>
                <Input
                  id="purchasePrice"
                  type="number"
                  step="0.01"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <Label htmlFor="quantity">Количество *</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  placeholder="0"
                  required
                />
              </div>

              <div>
                <Label htmlFor="supplier">Поставщик</Label>
                <Select
                  value={formData.supplier}
                  onValueChange={(value) => setFormData({ ...formData, supplier: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите поставщика" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.name}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="note">Примечание (причина возврата)</Label>
              <Textarea
                id="note"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="Например: срок годности истёк, товар не продаётся"
                rows={3}
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Добавить возврат
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>История возвратов</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground">Загрузка...</p>
          ) : returns.length === 0 ? (
            <p className="text-center text-muted-foreground">Нет возвратов</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Товар</TableHead>
                  <TableHead>Цена</TableHead>
                  <TableHead>Кол-во</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Поставщик</TableHead>
                  <TableHead>Примечание</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((returnItem) => (
                  <TableRow key={returnItem.id}>
                    <TableCell>
                      {new Date(returnItem.created_at).toLocaleDateString('ru-RU')}
                    </TableCell>
                    <TableCell>{returnItem.product_name}</TableCell>
                    <TableCell>₽{returnItem.purchase_price.toFixed(2)}</TableCell>
                    <TableCell>{returnItem.quantity}</TableCell>
                    <TableCell>
                      ₽{(returnItem.purchase_price * returnItem.quantity).toFixed(2)}
                    </TableCell>
                    <TableCell>{returnItem.supplier || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {returnItem.note || '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePrint(returnItem)}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};