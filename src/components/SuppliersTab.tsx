import { useState, useEffect } from 'react';
import { Users, Plus, Phone, FileText, DollarSign, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  addSystemLog, 
  getSuppliers as getFirebaseSuppliers, 
  saveSupplier as saveFirebaseSupplier,
  updateSupplier as updateFirebaseSupplier,
  subscribeToSuppliers,
  Supplier as FirebaseSupplier
} from '@/lib/mysqlCollections';
import { getCurrentLoginUserSync } from '@/lib/loginAuth';

interface PaymentHistoryItem {
  productName: string;
  productQuantity: number;
  productPrice: number;
  paymentType: string;
  amount: number;
  date: string;
}

interface Supplier {
  id: string;
  name: string;
  phone: string;
  notes: string;
  totalDebt: number;
  paymentHistory: PaymentHistoryItem[];
  createdAt: string;
  lastUpdated: string;
}

export const SuppliersTab = () => {
  const currentUser = getCurrentLoginUserSync();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  const [newSupplier, setNewSupplier] = useState(() => {
    const saved = localStorage.getItem('supplier_form_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { name: '', phone: '', notes: '' };
      }
    }
    return { name: '', phone: '', notes: '' };
  });

  const [payment, setPayment] = useState(() => {
    const saved = localStorage.getItem('payment_form_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {
          supplierId: '',
          productName: '',
          productQuantity: '',
          productPrice: '',
          paymentType: 'full' as 'full' | 'partial' | 'debt',
          paidAmount: '',
        };
      }
    }
    return {
      supplierId: '',
      productName: '',
      productQuantity: '',
      productPrice: '',
      paymentType: 'full' as 'full' | 'partial' | 'debt',
      paidAmount: '',
    };
  });

  // Сохраняем форму при изменении
  useEffect(() => {
    localStorage.setItem('supplier_form_data', JSON.stringify(newSupplier));
  }, [newSupplier]);

  useEffect(() => {
    localStorage.setItem('payment_form_data', JSON.stringify(payment));
  }, [payment]);

  useEffect(() => {
    loadSuppliers();
    
    // Подписка на Firebase
    const unsubscribe = subscribeToSuppliers((data) => {
      const mapped = data.map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone || '',
        notes: s.notes || '',
        totalDebt: Number(s.totalDebt || 0),
        paymentHistory: (s.paymentHistory as any) || [],
        createdAt: s.created_at,
        lastUpdated: s.updated_at
      }));
      setSuppliers(mapped);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadSuppliers = async () => {
    try {
      const data = await getFirebaseSuppliers();
      const mapped = data.map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone || '',
        notes: s.notes || '',
        totalDebt: Number(s.totalDebt || 0),
        paymentHistory: (s.paymentHistory as any) || [],
        createdAt: s.created_at,
        lastUpdated: s.updated_at
      }));
      setSuppliers(mapped);
    } catch (error: any) {
      console.error('Error loading suppliers:', error);
      toast.error('Ошибка загрузки поставщиков');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSupplier = async () => {
    if (saving) return;
    
    setSaving(true);
    toast.loading('Добавление поставщика...');
    
    try {
      if (!newSupplier.name?.trim()) {
        toast.dismiss();
        toast.error('Введите название поставщика');
        return;
      }
      
      if (!newSupplier.phone?.trim()) {
        toast.dismiss();
        toast.error('Введите телефон поставщика');
        return;
      }

      await saveFirebaseSupplier({
        name: newSupplier.name.trim(),
        phone: newSupplier.phone.trim(),
        notes: newSupplier.notes?.trim() || '',
        totalDebt: 0
      });

      await addSystemLog(
        'supplier_added',
        currentUser?.username || 'Система',
        `Добавлен поставщик: ${newSupplier.name}`
      );

      toast.dismiss();
      toast.success(`Поставщик "${newSupplier.name}" добавлен`);
      
      setNewSupplier({ name: '', phone: '', notes: '' });
      localStorage.removeItem('supplier_form_data');
      setShowAddForm(false);
      loadSuppliers();
    } catch (error: any) {
      toast.dismiss();
      toast.error('Ошибка добавления поставщика');
      console.error('Error adding supplier:', error);
    } finally {
      setSaving(false);
    }
  };

  const handlePaymentSubmit = async () => {
    if (!payment.supplierId || !payment.productName || !payment.productQuantity || !payment.productPrice) {
      toast.error('Заполните все поля');
      return;
    }

    const productPrice = parseFloat(payment.productPrice);
    const productQuantity = parseInt(payment.productQuantity);
    const totalAmount = productPrice * productQuantity;
    
    let paidAmount = totalAmount;
    let debtAmount = 0;

    if (payment.paymentType === 'partial') {
      paidAmount = parseFloat(payment.paidAmount) || 0;
      debtAmount = totalAmount - paidAmount;
    } else if (payment.paymentType === 'debt') {
      paidAmount = 0;
      debtAmount = totalAmount;
    }

    try {
      const supplier = suppliers.find(s => s.id === payment.supplierId);
      if (!supplier) {
        toast.error('Поставщик не найден');
        return;
      }

      const newPaymentRecord: PaymentHistoryItem = {
        productName: payment.productName,
        productQuantity,
        productPrice,
        paymentType: payment.paymentType,
        amount: paidAmount,
        date: new Date().toISOString()
      };

      const updatedHistory = [...(supplier.paymentHistory || []), newPaymentRecord];
      const newDebt = (supplier.totalDebt || 0) + debtAmount;

      await updateFirebaseSupplier(payment.supplierId, {
        totalDebt: newDebt,
        paymentHistory: updatedHistory as any
      });

      await addSystemLog(
        'payment_added',
        currentUser?.username || 'Система',
        `Платеж поставщику ${supplier.name}: ${payment.productName} x${productQuantity}`
      );

      toast.success('Платеж добавлен');
      
      setPayment({
        supplierId: '',
        productName: '',
        productQuantity: '',
        productPrice: '',
        paymentType: 'full',
        paidAmount: '',
      });
      localStorage.removeItem('payment_form_data');
      loadSuppliers();
    } catch (error: any) {
      console.error('Error adding payment:', error);
      toast.error('Ошибка добавления платежа');
    }
  };

  const handlePayDebt = async (supplierId: string, amount: number) => {
    try {
      const supplier = suppliers.find(s => s.id === supplierId);
      if (!supplier) return;

      if (amount > supplier.totalDebt) {
        toast.error('Сумма больше текущего долга');
        return;
      }

      const debtPaymentRecord: PaymentHistoryItem = {
        productName: 'Погашение долга',
        productQuantity: 0,
        productPrice: 0,
        paymentType: 'debt_payment',
        amount: -amount,
        date: new Date().toISOString()
      };

      const updatedHistory = [...(supplier.paymentHistory || []), debtPaymentRecord];
      const newDebt = supplier.totalDebt - amount;

      await updateFirebaseSupplier(supplierId, {
        totalDebt: newDebt,
        paymentHistory: updatedHistory as any
      });

      await addSystemLog(
        'debt_paid',
        currentUser?.username || 'Система',
        `Погашение долга поставщику ${supplier.name}: ${amount} ₽`
      );

      toast.success('Долг погашен');
      loadSuppliers();
    } catch (error) {
      console.error('Error paying debt:', error);
      toast.error('Ошибка погашения долга');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          Поставщики ({suppliers.length})
        </h2>
        <Button onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Добавить
        </Button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <Card className="p-4">
          <h3 className="font-semibold mb-4">Новый поставщик</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Название *"
              value={newSupplier.name}
              onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
            />
            <Input
              placeholder="Телефон *"
              value={newSupplier.phone}
              onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
            />
            <Input
              placeholder="Примечание"
              value={newSupplier.notes}
              onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
            />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={handleAddSupplier} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Сохранить
            </Button>
            <Button variant="outline" onClick={() => setShowAddForm(false)}>
              Отмена
            </Button>
          </div>
        </Card>
      )}

      {/* Payment Form */}
      <Card className="p-4">
        <h3 className="font-semibold mb-4">Добавить платеж</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Select
            value={payment.supplierId}
            onValueChange={(value) => setPayment({ ...payment, supplierId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Поставщик" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Input
            placeholder="Товар"
            value={payment.productName}
            onChange={(e) => setPayment({ ...payment, productName: e.target.value })}
          />
          
          <Input
            type="number"
            placeholder="Кол-во"
            value={payment.productQuantity}
            onChange={(e) => setPayment({ ...payment, productQuantity: e.target.value })}
          />
          
          <Input
            type="number"
            placeholder="Цена"
            value={payment.productPrice}
            onChange={(e) => setPayment({ ...payment, productPrice: e.target.value })}
          />
          
          <Select
            value={payment.paymentType}
            onValueChange={(value: 'full' | 'partial' | 'debt') => setPayment({ ...payment, paymentType: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Полная оплата</SelectItem>
              <SelectItem value="partial">Частичная</SelectItem>
              <SelectItem value="debt">В долг</SelectItem>
            </SelectContent>
          </Select>

          {payment.paymentType === 'partial' && (
            <Input
              type="number"
              placeholder="Оплачено"
              value={payment.paidAmount}
              onChange={(e) => setPayment({ ...payment, paidAmount: e.target.value })}
            />
          )}
        </div>
        <Button className="mt-4" onClick={handlePaymentSubmit}>
          Добавить платеж
        </Button>
      </Card>

      {/* Suppliers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {suppliers.map((supplier) => (
          <Card key={supplier.id} className="p-4">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-semibold">{supplier.name}</h4>
              {Number(supplier.totalDebt || 0) > 0 && (
                <Badge variant="destructive">
                  Долг: {Number(supplier.totalDebt || 0).toFixed(2)} ₽
                </Badge>
              )}
            </div>
            
            {supplier.phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {supplier.phone}
              </p>
            )}
            
            {supplier.notes && (
              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                <FileText className="h-3 w-3" />
                {supplier.notes}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" onClick={() => setSelectedSupplier(supplier)}>
                    История
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>История платежей - {supplier.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    {(supplier.paymentHistory || []).length === 0 ? (
                      <p className="text-muted-foreground">Нет платежей</p>
                    ) : (
                      supplier.paymentHistory.map((p, i) => (
                        <div key={i} className="p-2 border rounded text-sm">
                          <div className="flex justify-between">
                            <span>{p.productName}</span>
                            <span>{new Date(p.date).toLocaleDateString('ru-RU')}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {p.productQuantity} x {p.productPrice} ₽ = {(Number(p.productQuantity || 0) * Number(p.productPrice || 0)).toFixed(2)} ₽
                          </div>
                          <div>
                            {p.paymentType === 'full' && 'Полная оплата'}
                            {p.paymentType === 'partial' && `Частично: ${p.amount} ₽`}
                            {p.paymentType === 'debt' && 'В долг'}
                            {p.paymentType === 'debt_payment' && `Погашение: ${Math.abs(p.amount)} ₽`}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>

              {Number(supplier.totalDebt || 0) > 0 && (
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="default">
                      <DollarSign className="h-3 w-3 mr-1" />
                      Погасить
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Погашение долга - {supplier.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p>Текущий долг: <strong>{Number(supplier.totalDebt || 0).toFixed(2)} ₽</strong></p>
                      <Input
                        type="number"
                        placeholder="Сумма погашения"
                        id={`debt-${supplier.id}`}
                      />
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => {
                            const input = document.getElementById(`debt-${supplier.id}`) as HTMLInputElement;
                            const amount = parseFloat(input?.value || '0');
                            if (amount > 0) {
                              handlePayDebt(supplier.id, amount);
                            }
                          }}
                        >
                          Погасить
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={() => handlePayDebt(supplier.id, supplier.totalDebt)}
                        >
                          Погасить полностью
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </Card>
        ))}
      </div>

      {suppliers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          Нет поставщиков. Добавьте первого!
        </div>
      )}
    </div>
  );
};
