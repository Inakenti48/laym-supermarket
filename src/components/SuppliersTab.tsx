import { useState } from 'react';
import { Users, Plus, Phone, FileText, DollarSign, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addLog, getCurrentUser } from '@/lib/auth';
import { toast } from 'sonner';
import { getSuppliers, saveSupplier, addSupplierPayment, paySupplierDebt, Supplier } from '@/lib/storage';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export const SuppliersTab = () => {
  const currentUser = getCurrentUser();
  const [suppliers, setSuppliers] = useState<Supplier[]>(getSuppliers());
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    notes: '',
  });

  const [payment, setPayment] = useState({
    supplierId: '',
    productName: '',
    productQuantity: '',
    productPrice: '',
    paymentType: 'full' as 'full' | 'partial' | 'debt',
    paidAmount: '',
  });

  const [debtPayment, setDebtPayment] = useState({
    supplierId: '',
    amount: '',
  });

  const refreshSuppliers = () => {
    setSuppliers(getSuppliers());
  };

  const handleAddSupplier = () => {
    if (!newSupplier.name || !newSupplier.phone) {
      toast.error('Заполните название и телефон поставщика');
      return;
    }

    const supplier = saveSupplier(
      {
        name: newSupplier.name,
        phone: newSupplier.phone,
        notes: newSupplier.notes,
        totalDebt: 0,
      },
      currentUser?.username || 'unknown'
    );

    addLog(`Добавлен поставщик: ${supplier.name} (${supplier.phone})`);
    toast.success('Поставщик добавлен');
    
    setNewSupplier({ name: '', phone: '', notes: '' });
    setShowAddForm(false);
    refreshSuppliers();
  };

  const handleAddPayment = () => {
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

    addSupplierPayment(
      payment.supplierId,
      {
        amount: paidAmount,
        paymentType: payment.paymentType,
        productName: payment.productName,
        productQuantity: quantity,
        productPrice: price,
      },
      currentUser?.username || 'unknown'
    );

    const supplier = suppliers.find(s => s.id === payment.supplierId);
    const paymentStatus = 
      payment.paymentType === 'full' ? 'Полная оплата' :
      payment.paymentType === 'partial' ? `Частичная оплата (${paidAmount}₽ из ${totalCost}₽)` :
      `Долг (${totalCost}₽)`;
    
    addLog(`Операция с поставщиком "${supplier?.name}": ${payment.productName} (${quantity} шт) - ${paymentStatus}`);
    toast.success('Операция добавлена');

    setPayment({
      supplierId: '',
      productName: '',
      productQuantity: '',
      productPrice: '',
      paymentType: 'full',
      paidAmount: '',
    });
    refreshSuppliers();
  };

  const handlePayDebt = () => {
    if (!debtPayment.supplierId || !debtPayment.amount) {
      toast.error('Выберите поставщика и укажите сумму');
      return;
    }

    const amount = parseFloat(debtPayment.amount);
    if (amount <= 0) {
      toast.error('Сумма должна быть больше 0');
      return;
    }

    const supplier = suppliers.find(s => s.id === debtPayment.supplierId);
    if (!supplier) {
      toast.error('Поставщик не найден');
      return;
    }

    if (amount > supplier.totalDebt) {
      toast.error('Сумма больше текущего долга');
      return;
    }

    paySupplierDebt(debtPayment.supplierId, amount, currentUser?.username || 'unknown');
    addLog(`Погашен долг поставщику "${supplier.name}": ${amount}₽`);
    toast.success('Долг погашен');

    setDebtPayment({ supplierId: '', amount: '' });
    refreshSuppliers();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Поставщики ({suppliers.length})
          </h3>
          <Button onClick={() => setShowAddForm(!showAddForm)}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить поставщика
          </Button>
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
                <label className="text-sm font-medium mb-2 block">Заметки</label>
                <Textarea
                  value={newSupplier.notes}
                  onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
                  placeholder="Дополнительная информация"
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAddSupplier}>Сохранить</Button>
                <Button variant="outline" onClick={() => setShowAddForm(false)}>Отмена</Button>
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
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Phone className="h-4 w-4" />
                      {supplier.phone}
                    </div>
                    {supplier.notes && (
                      <div className="flex items-start gap-2 text-sm text-muted-foreground mt-1">
                        <FileText className="h-4 w-4 mt-0.5" />
                        <span>{supplier.notes}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <Badge variant={supplier.totalDebt > 0 ? 'destructive' : 'secondary'} className="text-base">
                      Долг: {supplier.totalDebt.toFixed(2)}₽
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
                      История операций ({supplier.paymentHistory.length})
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>История операций: {supplier.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      {supplier.paymentHistory.length === 0 ? (
                        <div className="text-center py-4 text-muted-foreground">
                          Нет операций
                        </div>
                      ) : (
                        supplier.paymentHistory.map((payment, idx) => (
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
                                payment.paymentType === 'debt' ? 'destructive' : 'default'
                              }>
                                {payment.paymentType === 'full' ? 'Полная оплата' :
                                 payment.paymentType === 'debt' ? 'Долг' : 'Частичная оплата'}
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
                {suppliers.filter(s => s.totalDebt > 0).map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name} (Долг: {supplier.totalDebt.toFixed(2)}₽)
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
