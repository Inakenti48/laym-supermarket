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
import { supabase } from '@/integrations/supabase/client';
import { getCurrentUser } from '@/lib/auth';
import { getPendingSuppliersCount, syncSuppliersToCloud, setupSuppliersAutoSync } from '@/lib/suppliersOffline';

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
  contact_person: string | null;
  phone: string | null;
  address: string | null;
  debt: number;
  payment_history: PaymentHistoryItem[] | any;
  created_at: string;
  updated_at: string;
}

export const SuppliersTab = () => {
  const currentUser = getCurrentUser();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  
  const [newSupplier, setNewSupplier] = useState(() => {
    const saved = localStorage.getItem('supplier_form_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { name: '', phone: '', contact_person: '', address: '' };
      }
    }
    return { name: '', phone: '', contact_person: '', address: '' };
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

  const [debtPayment, setDebtPayment] = useState(() => {
    const saved = localStorage.getItem('debt_payment_form_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { supplierId: '', amount: '' };
      }
    }
    return { supplierId: '', amount: '' };
  });

  // Сохраняем состояния форм при изменении
  useEffect(() => {
    localStorage.setItem('supplier_form_data', JSON.stringify(newSupplier));
  }, [newSupplier]);

  useEffect(() => {
    localStorage.setItem('payment_form_data', JSON.stringify(payment));
  }, [payment]);

  useEffect(() => {
    localStorage.setItem('debt_payment_form_data', JSON.stringify(debtPayment));
  }, [debtPayment]);

  useEffect(() => {
    loadSuppliers();
    checkPendingSuppliers();

    // Настройка автоматической синхронизации
    setupSuppliersAutoSync((result) => {
      if (result.synced > 0) {
        toast.success(`Синхронизировано ${result.synced} поставщиков`);
        loadSuppliers();
        checkPendingSuppliers();
      }
      if (result.failed > 0) {
        toast.error(`Не удалось синхронизировать ${result.failed} поставщиков`);
      }
    });

    // Подписка на реалтайм обновления
    const channel = supabase
      .channel('suppliers_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'suppliers'
        },
        () => {
          loadSuppliers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkPendingSuppliers = async () => {
    const count = await getPendingSuppliersCount();
    setPendingCount(count);
  };

  const handleManualSync = async () => {
    toast.loading('Синхронизация...');
    const result = await syncSuppliersToCloud();
    toast.dismiss();
    
    if (result.synced > 0) {
      toast.success(`Синхронизировано ${result.synced} поставщиков`);
      loadSuppliers();
      checkPendingSuppliers();
    }
    if (result.failed > 0) {
      toast.error(`Не удалось синхронизировать ${result.failed} поставщиков`);
    }
    if (result.synced === 0 && result.failed === 0) {
      toast.info('Нет данных для синхронизации');
    }
  };

  const loadSuppliers = async () => {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSuppliers((data || []) as Supplier[]);
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
      // Валидация
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

      // Проверка авторизации
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) {
        console.error('❌ Ошибка авторизации:', {
          message: authError.message,
          code: authError.status
        });
        toast.dismiss();
        toast.error('Ошибка авторизации. Войдите в систему.');
        return;
      }
      
      if (!user) {
        console.warn('⚠️ Пользователь не авторизован');
        toast.dismiss();
        toast.error('Необходима авторизация');
        return;
      }

      const supplierData = {
        name: newSupplier.name.trim(),
        phone: newSupplier.phone.trim(),
        contact_person: newSupplier.contact_person?.trim() || null,
        address: newSupplier.address?.trim() || null,
        debt: 0,
        payment_history: [],
        created_by: user.id
      };
      
      const { data, error } = await supabase
        .from('suppliers')
        .insert(supplierData)
        .select()
        .single();

      if (error) throw error;

      // Добавляем лог
      try {
        await supabase.from('system_logs').insert({
          user_id: user.id,
          user_name: currentUser?.username || 'Неизвестно',
          message: `Добавлен поставщик: ${newSupplier.name} (${newSupplier.phone})`
        });
      } catch (logError) {
        console.warn('Ошибка записи лога:', logError);
      }

      toast.dismiss();
      toast.success('Поставщик успешно добавлен');
      setNewSupplier({ name: '', phone: '', contact_person: '', address: '' });
      setShowAddForm(false);
      loadSuppliers();
      localStorage.removeItem('supplier_form_data');
    } catch (error: any) {
      toast.dismiss();
      
      let errorMessage = 'Ошибка добавления поставщика';
      if (error.code === '23505') {
        errorMessage = 'Поставщик с такими данными уже существует';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
      console.error('Ошибка добавления поставщика:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPayment = async () => {
    if (!payment.supplierId || !payment.productName || !payment.productQuantity || !payment.productPrice) {
      toast.error('Заполните все поля');
      return;
    }

    const quantity = parseFloat(payment.productQuantity);
    const price = parseFloat(payment.productPrice);
    const totalCost = quantity * price;
    const paidAmount = payment.paymentType === 'full' 
      ? totalCost 
      : payment.paymentType === 'debt'
      ? 0
      : parseFloat(payment.paidAmount) || 0;

    if (payment.paymentType === 'partial' && paidAmount <= 0) {
      toast.error('Укажите сумму частичной оплаты');
      return;
    }

    if (payment.paymentType === 'partial' && paidAmount >= totalCost) {
      toast.error('Частичная оплата не может быть больше или равна полной сумме');
      return;
    }

    try {
      // Получаем текущего поставщика
      const { data: supplier, error: supplierError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', payment.supplierId)
        .single();

      if (supplierError || !supplier) throw supplierError;

      // Создаем новую запись в истории платежей
      const newPaymentRecord = {
        productName: payment.productName,
        productQuantity: quantity,
        productPrice: price,
        paymentType: payment.paymentType,
        amount: paidAmount,
        date: new Date().toISOString()
      };

      const currentHistory = Array.isArray(supplier.payment_history) ? supplier.payment_history : [];
      const updatedHistory = [...currentHistory, newPaymentRecord];
      const debtChange = totalCost - paidAmount;
      const newDebt = (supplier.debt || 0) + debtChange;

      // Обновляем поставщика
      const { error: updateError } = await supabase
        .from('suppliers')
        .update({
          debt: newDebt,
          payment_history: updatedHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', payment.supplierId);

      if (updateError) throw updateError;

      const paymentStatus = 
        payment.paymentType === 'full' ? 'Полная оплата' :
        payment.paymentType === 'partial' ? `Частичная оплата (${paidAmount}₽ из ${totalCost}₽)` :
        `Долг (${totalCost}₽)`;

      // Добавляем лог
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('system_logs').insert({
            user_id: user.id,
            user_name: currentUser?.username || 'Неизвестно',
            message: `Операция с поставщиком "${supplier.name}": ${payment.productName} (${quantity} шт) - ${paymentStatus}`
          });
        }
      } catch (logError) {
        console.warn('⚠️ Не удалось записать лог:', logError);
      }

      toast.success('Операция добавлена');
      setPayment({
        supplierId: '',
        productName: '',
        productQuantity: '',
        productPrice: '',
        paymentType: 'full',
        paidAmount: '',
      });
      loadSuppliers();
      // Очищаем сохраненное состояние формы
      localStorage.removeItem('payment_form_data');
    } catch (error: any) {
      console.error('Error adding payment:', error);
      toast.error('Ошибка добавления операции');
    }
  };

  const handlePayDebt = async () => {
    if (!debtPayment.supplierId || !debtPayment.amount) {
      toast.error('Выберите поставщика и укажите сумму');
      return;
    }

    const amount = parseFloat(debtPayment.amount);
    if (amount <= 0) {
      toast.error('Сумма должна быть больше 0');
      return;
    }

    try {
      // Получаем текущего поставщика
      const { data: supplier, error: supplierError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', debtPayment.supplierId)
        .single();

      if (supplierError || !supplier) throw supplierError;

      if (amount > (supplier.debt || 0)) {
        toast.error('Сумма больше текущего долга');
        return;
      }

      // Создаем запись о погашении долга
      const debtPaymentRecord = {
        productName: 'Погашение долга',
        productQuantity: 0,
        productPrice: 0,
        paymentType: 'debt_payment',
        amount: -amount, // Отрицательная сумма для обозначения погашения
        date: new Date().toISOString()
      };

      const currentHistory = Array.isArray(supplier.payment_history) ? supplier.payment_history : [];
      const updatedHistory = [...currentHistory, debtPaymentRecord];
      const newDebt = (supplier.debt || 0) - amount;

      // Обновляем поставщика
      const { error: updateError } = await supabase
        .from('suppliers')
        .update({
          debt: newDebt,
          payment_history: updatedHistory,
          updated_at: new Date().toISOString()
        })
        .eq('id', debtPayment.supplierId);

      if (updateError) throw updateError;

      // Добавляем лог
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('system_logs').insert({
            user_id: user.id,
            user_name: currentUser?.username || 'Неизвестно',
            message: `Погашен долг поставщику "${supplier.name}": ${amount}₽`
          });
        }
      } catch (logError) {
        console.warn('⚠️ Не удалось записать лог:', logError);
      }

      toast.success('Долг погашен');
      setDebtPayment({ supplierId: '', amount: '' });
      loadSuppliers();
      // Очищаем сохраненное состояние формы
      localStorage.removeItem('debt_payment_form_data');
    } catch (error: any) {
      console.error('Error paying debt:', error);
      toast.error('Ошибка погашения долга');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" />
              Поставщики ({suppliers.length})
            </h3>
            {pendingCount > 0 && (
              <div className="text-sm text-orange-500 mt-1">
                {pendingCount} не синхронизировано
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {pendingCount > 0 && (
              <Button variant="outline" onClick={handleManualSync}>
                Синхронизировать ({pendingCount})
              </Button>
            )}
            <Button onClick={() => setShowAddForm(!showAddForm)}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить поставщика
            </Button>
          </div>
        </div>

        {showAddForm && (
          <Card className="p-4 mb-6 bg-muted/50">
            <h4 className="font-medium mb-4">Новый поставщик</h4>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium mb-2 block">Название *</label>
                <Input
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  placeholder="Например: ООО Поставщик"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Телефон *</label>
                <Input
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  placeholder="+7 (999) 123-45-67"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Контактное лицо</label>
                <Input
                  value={newSupplier.contact_person}
                  onChange={(e) => setNewSupplier({ ...newSupplier, contact_person: e.target.value })}
                  placeholder="Иван Иванов"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Адрес</label>
                <Textarea
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  placeholder="Адрес поставщика"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddSupplier} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Сохранить
                </Button>
                <Button variant="outline" onClick={() => setShowAddForm(false)} disabled={saving}>Отмена</Button>
              </div>
            </div>
          </Card>
        )}

        <div className="grid gap-4">
          {suppliers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Нет поставщиков
            </div>
          ) : (
            suppliers.map((supplier) => (
              <Card key={supplier.id} className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg">{supplier.name}</h4>
                    {supplier.contact_person && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Users className="h-4 w-4" />
                        {supplier.contact_person}
                      </div>
                    )}
                    {supplier.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        <Phone className="h-4 w-4" />
                        {supplier.phone}
                      </div>
                    )}
                    {supplier.address && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground mt-1">
                        <FileText className="h-4 w-4 mt-0.5" />
                        <span>{supplier.address}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge variant={(supplier.debt || 0) > 0 ? 'destructive' : 'secondary'} className="text-base">
                      Долг: {(supplier.debt || 0).toFixed(2)}₽
                    </Badge>
                  </div>
                </div>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedSupplier(supplier)}
                    >
                      История операций ({Array.isArray(supplier.payment_history) ? supplier.payment_history.length : 0})
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>История операций: {supplier.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      {(!Array.isArray(supplier.payment_history) || supplier.payment_history.length === 0) ? (
                        <div className="text-center py-4 text-muted-foreground">
                          Нет операций
                        </div>
                      ) : (
                        (supplier.payment_history as PaymentHistoryItem[]).map((payment, idx) => (
                          <div key={idx} className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex justify-between items-start mb-1">
                              <div>
                                <span className="font-medium">{payment.productName}</span>
                                {payment.productQuantity > 0 && (
                                  <span className="text-sm text-muted-foreground ml-2">
                                    ({payment.productQuantity} шт × {payment.productPrice}₽)
                                  </span>
                                )}
                              </div>
                              <Badge variant={
                                payment.paymentType === 'full' ? 'secondary' :
                                payment.paymentType === 'debt' ? 'destructive' : 
                                payment.paymentType === 'debt_payment' ? 'default' : 'default'
                              }>
                                {payment.paymentType === 'full' ? 'Полная оплата' :
                                 payment.paymentType === 'debt' ? 'Долг' : 
                                 payment.paymentType === 'debt_payment' ? 'Погашение долга' : 'Частичная оплата'}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground flex justify-between">
                              <span>{new Date(payment.date).toLocaleString('ru-RU')}</span>
                              <span className={payment.amount < 0 ? 'text-green-600' : ''}>
                                {payment.amount < 0 ? 'Погашение: ' : 'Оплачено: '}
                                {Math.abs(payment.amount).toFixed(2)}₽
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </Card>
            ))
          )}
        </div>
      </Card>

      {/* Добавление операции */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Добавить операцию
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-2 block">Поставщик *</label>
            <Select
              value={payment.supplierId}
              onValueChange={(value) => setPayment({ ...payment, supplierId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите поставщика" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Название товара *</label>
            <Input
              value={payment.productName}
              onChange={(e) => setPayment({ ...payment, productName: e.target.value })}
              placeholder="Введите название товара"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Количество *</label>
              <Input
                type="number"
                step="0.01"
                value={payment.productQuantity}
                onChange={(e) => setPayment({ ...payment, productQuantity: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Цена за единицу *</label>
              <Input
                type="number"
                step="0.01"
                value={payment.productPrice}
                onChange={(e) => setPayment({ ...payment, productPrice: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Тип оплаты</label>
            <Select
              value={payment.paymentType}
              onValueChange={(value: 'full' | 'partial' | 'debt') => 
                setPayment({ ...payment, paymentType: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Полная оплата</SelectItem>
                <SelectItem value="partial">Частичная оплата</SelectItem>
                <SelectItem value="debt">Долг</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {payment.paymentType === 'partial' && (
            <div>
              <label className="text-sm font-medium mb-2 block">Оплачено (₽) *</label>
              <Input
                type="number"
                step="0.01"
                value={payment.paidAmount}
                onChange={(e) => setPayment({ ...payment, paidAmount: e.target.value })}
                placeholder="0"
              />
              {payment.productQuantity && payment.productPrice && payment.paidAmount && (
                <p className="text-xs text-muted-foreground mt-1">
                  Остаток долга: {(parseFloat(payment.productQuantity) * parseFloat(payment.productPrice) - parseFloat(payment.paidAmount)).toFixed(2)}₽
                </p>
              )}
            </div>
          )}

          <Button onClick={handleAddPayment}>Добавить операцию</Button>
        </div>
      </Card>

      {/* Погашение долга */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Погасить долг
        </h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-2 block">Поставщик *</label>
            <Select
              value={debtPayment.supplierId}
              onValueChange={(value) => setDebtPayment({ ...debtPayment, supplierId: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите поставщика" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.filter(s => (s.debt || 0) > 0).map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name} (Долг: {(supplier.debt || 0).toFixed(2)}₽)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Сумма погашения (₽) *</label>
            <Input
              type="number"
              step="0.01"
              value={debtPayment.amount}
              onChange={(e) => setDebtPayment({ ...debtPayment, amount: e.target.value })}
              placeholder="0"
            />
          </div>

          <Button onClick={handlePayDebt}>Погасить долг</Button>
        </div>
      </Card>
    </div>
  );
};