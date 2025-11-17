// Компонент настройки Wi-Fi принтера для печати штрих-кодов

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Wifi, Printer, CheckCircle2, XCircle } from 'lucide-react';
import { setWiFiPrinterConfig, loadWiFiPrinterConfig, testWiFiPrinterConnection } from '@/lib/wifiPrinter';
import { toast } from 'sonner';

export const WiFiPrinterSettings = () => {
  const [ipAddress, setIpAddress] = useState('192.168.1.100');
  const [port, setPort] = useState('9100');
  const [isConnected, setIsConnected] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    // Загружаем сохраненную конфигурацию
    const config = loadWiFiPrinterConfig();
    if (config) {
      setIpAddress(config.ipAddress);
      setPort(config.port.toString());
      setIsConnected(true);
    }
  }, []);

  const handleSaveConfig = () => {
    if (!ipAddress) {
      toast.error('Введите IP-адрес принтера');
      return;
    }

    const portNumber = parseInt(port) || 9100;
    setWiFiPrinterConfig(ipAddress, portNumber);
    setIsConnected(true);
    toast.success('Настройки Wi-Fi принтера сохранены');
  };

  const handleTestConnection = async () => {
    if (!isConnected) {
      toast.error('Сначала сохраните настройки принтера');
      return;
    }

    setIsTesting(true);
    try {
      const success = await testWiFiPrinterConnection();
      if (success) {
        toast.success('Подключение к принтеру успешно!');
      } else {
        toast.error('Не удалось подключиться к принтеру');
        setIsConnected(false);
      }
    } catch (error) {
      toast.error('Ошибка подключения к принтеру');
      setIsConnected(false);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="h-5 w-5" />
          Настройка Wi-Fi принтера
        </CardTitle>
        <CardDescription>
          Настройте подключение к принтеру для автоматической печати штрих-кодов
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          {isConnected ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm">Принтер настроен</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-gray-500">
              <XCircle className="h-5 w-5" />
              <span className="text-sm">Принтер не настроен</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ip-address">IP-адрес принтера</Label>
          <Input
            id="ip-address"
            placeholder="192.168.1.100"
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Введите локальный IP-адрес вашего Wi-Fi принтера
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="port">Порт</Label>
          <Input
            id="port"
            placeholder="9100"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            type="number"
          />
          <p className="text-xs text-muted-foreground">
            Обычно используется порт 9100 для ESC/POS принтеров
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSaveConfig} className="flex-1">
            Сохранить настройки
          </Button>
          <Button
            onClick={handleTestConnection}
            variant="outline"
            disabled={!isConnected || isTesting}
            className="flex-1"
          >
            <Printer className="h-4 w-4 mr-2" />
            {isTesting ? 'Проверка...' : 'Тест печати'}
          </Button>
        </div>

        <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
          <p className="font-medium">Инструкция по настройке:</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Убедитесь, что принтер подключен к той же Wi-Fi сети</li>
            <li>Найдите IP-адрес принтера (обычно в настройках сети принтера)</li>
            <li>Введите IP-адрес и порт (обычно 9100)</li>
            <li>Нажмите "Сохранить настройки"</li>
            <li>Проверьте подключение кнопкой "Тест печати"</li>
          </ol>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg text-sm">
          <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">
            Автоматическая печать штрих-кодов
          </p>
          <p className="text-blue-700 dark:text-blue-300">
            При добавлении товара с существующим штрих-кодом система автоматически 
            сгенерирует новые уникальные коды и отправит их на печать. Количество 
            напечатанных этикеток будет соответствовать количеству товара.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
