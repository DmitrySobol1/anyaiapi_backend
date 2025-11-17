# План интеграции с ЮMoney Wallet API (API кошелька)

## 🎯 Общая информация

**ЮMoney Wallet API** — это API для работы с электронными кошельками физических лиц. Позволяет:
- Принимать переводы на кошелек
- Отправлять переводы другим пользователям (P2P)
- Запрашивать баланс и историю операций
- Получать уведомления о входящих переводах

**Важно:** Через API кошелька нельзя принимать деньги на банковский счет компании, только в кошелек физлица.

**Технологии:**
- Backend: Node.js + Express
- Frontend: React + TypeScript
- База данных: MongoDB
- Авторизация: OAuth 2.0

---

## 📋 Предварительные требования

### 1. Создание и настройка кошелька ЮMoney

```
ЗАДАЧА 1: Подготовить кошелек

1. Зарегистрировать кошелек на https://yoomoney.ru
2. Пройти идентификацию (статус должен быть "именной" или "идентифицированный")
   - С анонимным кошельком нельзя принимать платежи!
3. Запомнить номер кошелька (например: 410011234567890)
```

### 2. Регистрация приложения

```
ЗАДАЧА 2: Зарегистрировать приложение

1. Перейти на https://yoomoney.ru/myservices/new
2. Заполнить данные:
   - Название приложения: "NC-Solutions Payment System"
   - Адрес сайта: https://nc-solutions.ru (или ваш домен)
   - Redirect URI: https://nc-solutions.ru/oauth/callback
   - Почта для связи: ваша почта
   - ✅ Поставить галочку "Проверять подлинность приложения (OAuth2 client_secret)"
3. Подтвердить регистрацию через SMS
4. Сохранить полученные данные:
   - client_id (идентификатор приложения)
   - client_secret (секретное слово)
```

### 3. Установка зависимостей

```bash
# Backend
npm install axios uuid crypto --save
npm install dotenv --save

# Для работы с MongoDB
npm install mongoose --save
```

---

## 🔧 Структура реализации

### Этап 1: Backend - OAuth авторизация

#### Файл 1: `/backend/.env`

```env
# ЮMoney OAuth
YOOMONEY_CLIENT_ID=your_client_id_here
YOOMONEY_CLIENT_SECRET=your_client_secret_here
YOOMONEY_REDIRECT_URI=https://nc-solutions.ru/oauth/callback
YOOMONEY_WALLET_NUMBER=410011234567890

# Секретное слово для проверки уведомлений
YOOMONEY_NOTIFICATION_SECRET=your_secret_word_here

# URLs
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000
```

#### Файл 2: `/backend/config/yoomoney.js`

```javascript
// ЗАДАЧА: Конфигурация для работы с ЮMoney API

const axios = require('axios');

const YOOMONEY_AUTH_URL = 'https://yoomoney.ru/oauth/authorize';
const YOOMONEY_TOKEN_URL = 'https://yoomoney.ru/oauth/token';
const YOOMONEY_API_URL = 'https://yoomoney.ru/api';

class YooMoneyAPI {
  constructor(accessToken = null) {
    this.accessToken = accessToken;
    this.clientId = process.env.YOOMONEY_CLIENT_ID;
    this.clientSecret = process.env.YOOMONEY_CLIENT_SECRET;
    this.redirectUri = process.env.YOOMONEY_REDIRECT_URI;
  }

  // Генерация URL для авторизации пользователя
  getAuthorizationUrl(scope) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: scope.join(' ')
    });
    
    return `${YOOMONEY_AUTH_URL}?${params.toString()}`;
  }

  // Обмен временного кода на access_token
  async getAccessToken(code) {
    try {
      const response = await axios.post(YOOMONEY_TOKEN_URL, 
        new URLSearchParams({
          code: code,
          client_id: this.clientId,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
          client_secret: this.clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      return response.data.access_token;
    } catch (error) {
      console.error('Error getting access token:', error.response?.data);
      throw error;
    }
  }

  // Получение информации о кошельке
  async getAccountInfo() {
    try {
      const response = await axios.post(
        `${YOOMONEY_API_URL}/account-info`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error getting account info:', error.response?.data);
      throw error;
    }
  }

  // Получение истории операций
  async getOperationHistory(params = {}) {
    try {
      const response = await axios.post(
        `${YOOMONEY_API_URL}/operation-history`,
        new URLSearchParams(params),
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error getting operation history:', error.response?.data);
      throw error;
    }
  }

  // Создание платежа (подготовка)
  async requestPayment(params) {
    try {
      const response = await axios.post(
        `${YOOMONEY_API_URL}/request-payment`,
        new URLSearchParams(params),
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error requesting payment:', error.response?.data);
      throw error;
    }
  }

  // Подтверждение платежа
  async processPayment(requestId, moneySource = 'wallet', csc = null) {
    try {
      const params = {
        request_id: requestId
      };
      
      if (moneySource === 'wallet') {
        params.money_source = 'wallet';
      } else {
        params.money_source = moneySource;
        if (csc) {
          params.csc = csc;
        }
      }
      
      const response = await axios.post(
        `${YOOMONEY_API_URL}/process-payment`,
        new URLSearchParams(params),
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error processing payment:', error.response?.data);
      throw error;
    }
  }
}

module.exports = YooMoneyAPI;
```

#### Файл 3: `/backend/models/YooMoneyToken.js`

```javascript
// ЗАДАЧА: Модель для хранения OAuth токенов

const mongoose = require('mongoose');

const YooMoneyTokenSchema = new mongoose.Schema({
  // Идентификатор пользователя (владельца кошелька)
  userId: {
    type: String,
    required: true,
    unique: true,
    default: 'admin' // Для NC-Solutions будет один основной аккаунт
  },
  
  // Access token для работы с API
  accessToken: {
    type: String,
    required: true
  },
  
  // Номер кошелька
  walletNumber: String,
  
  // Scope (разрешения)
  scope: [String],
  
  // Дата получения токена
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Последнее использование
  lastUsedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('YooMoneyToken', YooMoneyTokenSchema);
```

#### Файл 4: `/backend/models/IncomingTransfer.js`

```javascript
// ЗАДАЧА: Модель для хранения входящих переводов

const mongoose = require('mongoose');

const IncomingTransferSchema = new mongoose.Schema({
  // ID операции от ЮMoney
  operationId: {
    type: String,
    required: true,
    unique: true
  },
  
  // Тип уведомления
  notificationType: {
    type: String,
    default: 'p2p-incoming'
  },
  
  // Сумма перевода
  amount: {
    type: Number,
    required: true
  },
  
  // Сумма списания у отправителя (с комиссией)
  withdrawAmount: Number,
  
  // Валюта (643 = RUB)
  currency: {
    type: String,
    default: '643'
  },
  
  // Дата и время операции
  datetime: {
    type: Date,
    required: true
  },
  
  // Отправитель
  sender: String,
  
  // Защита кодом
  codepro: {
    type: Boolean,
    default: false
  },
  
  // Метка платежа (label)
  label: String,
  
  // Данные отправителя
  senderData: {
    lastname: String,
    firstname: String,
    fathersname: String,
    email: String,
    phone: String,
    city: String,
    street: String,
    building: String,
    suite: String,
    flat: String,
    zip: String
  },
  
  // Статус обработки
  processed: {
    type: Boolean,
    default: false
  },
  
  // Уведомление отправлено в Telegram
  telegramNotified: {
    type: Boolean,
    default: false
  },
  
  // Дата создания записи
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('IncomingTransfer', IncomingTransferSchema);
```

#### Файл 5: `/backend/routes/yoomoney.js`

```javascript
// ЗАДАЧА: API endpoints для работы с ЮMoney

const express = require('express');
const router = express.Router();
const YooMoneyAPI = require('../config/yoomoney');
const YooMoneyToken = require('../models/YooMoneyToken');
const IncomingTransfer = require('../models/IncomingTransfer');
const crypto = require('crypto');

// GET /api/yoomoney/auth - Начало OAuth авторизации
router.get('/auth', (req, res) => {
  const yoomoney = new YooMoneyAPI();
  
  // Запрашиваемые права (scope)
  const scope = [
    'account-info',           // Информация о счете
    'operation-history',      // История операций
    'operation-details',      // Детали операции
    'incoming-transfers',     // Входящие переводы
    'payment-p2p'            // P2P переводы (если нужно отправлять)
  ];
  
  const authUrl = yoomoney.getAuthorizationUrl(scope);
  
  // Перенаправляем пользователя на страницу авторизации ЮMoney
  res.redirect(authUrl);
});

// GET /api/yoomoney/callback - Обработка callback после авторизации
router.get('/callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Authorization denied'
      });
    }
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'No authorization code received'
      });
    }
    
    // Обмениваем временный код на access_token
    const yoomoney = new YooMoneyAPI();
    const accessToken = await yoomoney.getAccessToken(code);
    
    // Получаем информацию о кошельке
    const apiWithToken = new YooMoneyAPI(accessToken);
    const accountInfo = await apiWithToken.getAccountInfo();
    
    // Сохраняем токен в базу данных
    await YooMoneyToken.findOneAndUpdate(
      { userId: 'admin' },
      {
        accessToken: accessToken,
        walletNumber: accountInfo.account,
        scope: ['account-info', 'operation-history', 'operation-details', 'incoming-transfers', 'payment-p2p'],
        lastUsedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    // Перенаправляем на фронтенд с успешным результатом
    res.redirect(`${process.env.FRONTEND_URL}/admin/yoomoney-success`);
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/yoomoney/balance - Получить баланс кошелька
router.get('/balance', async (req, res) => {
  try {
    const tokenData = await YooMoneyToken.findOne({ userId: 'admin' });
    
    if (!tokenData) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized. Please authorize first.'
      });
    }
    
    const yoomoney = new YooMoneyAPI(tokenData.accessToken);
    const accountInfo = await yoomoney.getAccountInfo();
    
    res.json({
      success: true,
      account: accountInfo.account,
      balance: accountInfo.balance,
      currency: accountInfo.currency,
      accountStatus: accountInfo.account_status,
      accountType: accountInfo.account_type
    });
    
  } catch (error) {
    console.error('Balance error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// GET /api/yoomoney/history - Получить историю операций
router.get('/history', async (req, res) => {
  try {
    const tokenData = await YooMoneyToken.findOne({ userId: 'admin' });
    
    if (!tokenData) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized'
      });
    }
    
    const yoomoney = new YooMoneyAPI(tokenData.accessToken);
    const history = await yoomoney.getOperationHistory({
      records: req.query.records || 30,
      type: req.query.type || undefined, // 'deposition', 'payment', 'incoming-transfers-unaccepted'
      label: req.query.label || undefined
    });
    
    res.json({
      success: true,
      operations: history.operations,
      nextRecord: history.next_record
    });
    
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/yoomoney/webhook - Webhook для входящих переводов
router.post('/webhook', async (req, res) => {
  try {
    const notification = req.body;
    
    // Проверка подлинности уведомления
    const isValid = verifyNotification(notification);
    
    if (!isValid) {
      return res.status(403).json({ error: 'Invalid notification signature' });
    }
    
    // Сохранение входящего перевода
    const transfer = new IncomingTransfer({
      operationId: notification.operation_id,
      notificationType: notification.notification_type,
      amount: parseFloat(notification.amount),
      withdrawAmount: parseFloat(notification.withdraw_amount),
      currency: notification.currency,
      datetime: new Date(notification.datetime),
      sender: notification.sender,
      codepro: notification.codepro === 'true',
      label: notification.label,
      senderData: {
        lastname: notification.lastname,
        firstname: notification.firstname,
        fathersname: notification.fathersname,
        email: notification.email,
        phone: notification.phone,
        city: notification.city,
        street: notification.street,
        building: notification.building,
        suite: notification.suite,
        flat: notification.flat,
        zip: notification.zip
      }
    });
    
    await transfer.save();
    
    // Здесь можно отправить уведомление в Telegram
    // await sendTelegramNotification(transfer);
    
    // Отправляем HTTP 200 OK для подтверждения получения
    res.status(200).send('OK');
    
  } catch (error) {
    // Если это дубликат (уже есть в базе), все равно отвечаем 200
    if (error.code === 11000) {
      return res.status(200).send('OK');
    }
    
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Функция проверки подлинности уведомления
function verifyNotification(notification) {
  const {
    notification_type,
    operation_id,
    amount,
    currency,
    datetime,
    sender,
    codepro,
    label
  } = notification;
  
  const sha1Hash = notification.sha1_hash;
  const secret = process.env.YOOMONEY_NOTIFICATION_SECRET;
  
  // Формируем строку для проверки
  let str = `${notification_type}&${operation_id}&${amount}&${currency}&${datetime}&${sender}&${codepro}&${secret}&`;
  
  if (label) {
    str += label;
  }
  
  // Вычисляем SHA-1 хеш
  const hash = crypto.createHash('sha1').update(str).digest('hex');
  
  return hash === sha1Hash;
}

module.exports = router;
```

#### Файл 6: `/backend/server.js` (обновление)

```javascript
// ЗАДАЧА: Добавить yoomoney routes в главный файл сервера

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const yoomoneyRoutes = require('./routes/yoomoney');
app.use('/api/yoomoney', yoomoneyRoutes);

// Остальные routes...

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

### Этап 2: Frontend - Интерфейс для администратора

#### Файл 7: `/src/pages/admin/YooMoneyDashboard.tsx`

```typescript
// ЗАДАЧА: Админ панель для управления ЮMoney

import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface AccountInfo {
  account: string;
  balance: number;
  currency: string;
  accountStatus: string;
  accountType: string;
}

interface Operation {
  operation_id: string;
  title: string;
  amount: number;
  direction: 'in' | 'out';
  datetime: string;
  status: string;
  type: string;
}

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const YooMoneyDashboard: React.FC = () => {
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBalance();
    loadHistory();
  }, []);

  const loadBalance = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/yoomoney/balance`);
      if (response.data.success) {
        setAccountInfo(response.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Ошибка загрузки баланса');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/yoomoney/history?records=20`);
      if (response.data.success) {
        setOperations(response.data.operations);
      }
    } catch (err: any) {
      console.error('Error loading history:', err);
    }
  };

  const handleAuthorize = () => {
    // Перенаправляем на endpoint авторизации
    window.location.href = `${API_URL}/api/yoomoney/auth`;
  };

  if (loading) {
    return <div className="loading">Загрузка...</div>;
  }

  if (error && error.includes('Not authorized')) {
    return (
      <div className="yoomoney-dashboard">
        <h1>ЮMoney - Требуется авторизация</h1>
        <p>Для работы с кошельком необходимо авторизоваться</p>
        <button onClick={handleAuthorize} className="btn-primary">
          Авторизоваться в ЮMoney
        </button>
      </div>
    );
  }

  return (
    <div className="yoomoney-dashboard">
      <h1>ЮMoney Кошелек</h1>

      {accountInfo && (
        <div className="account-info">
          <h2>Информация о кошельке</h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Номер кошелька:</label>
              <span>{accountInfo.account}</span>
            </div>
            <div className="info-item">
              <label>Баланс:</label>
              <span className="balance">{accountInfo.balance} ₽</span>
            </div>
            <div className="info-item">
              <label>Статус:</label>
              <span>{accountInfo.accountStatus}</span>
            </div>
            <div className="info-item">
              <label>Тип:</label>
              <span>{accountInfo.accountType}</span>
            </div>
          </div>
        </div>
      )}

      <div className="operations-history">
        <h2>История операций</h2>
        <button onClick={loadHistory} className="btn-secondary">
          Обновить
        </button>
        
        {operations.length > 0 ? (
          <table className="operations-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Описание</th>
                <th>Сумма</th>
                <th>Направление</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((op) => (
                <tr key={op.operation_id}>
                  <td>{new Date(op.datetime).toLocaleString('ru-RU')}</td>
                  <td>{op.title}</td>
                  <td className={op.direction === 'in' ? 'amount-in' : 'amount-out'}>
                    {op.direction === 'in' ? '+' : '-'}{op.amount} ₽
                  </td>
                  <td>{op.direction === 'in' ? 'Входящий' : 'Исходящий'}</td>
                  <td>{op.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>Нет операций</p>
        )}
      </div>
    </div>
  );
};
```

#### Файл 8: `/src/pages/admin/YooMoneyDashboard.css`

```css
/* ЗАДАЧА: Стили для админ панели ЮMoney */

.yoomoney-dashboard {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.yoomoney-dashboard h1 {
  font-size: 32px;
  margin-bottom: 30px;
  color: #333;
}

.account-info {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
}

.account-info h2 {
  font-size: 24px;
  margin-bottom: 20px;
  color: #333;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-item label {
  font-weight: 600;
  color: #666;
  font-size: 14px;
}

.info-item span {
  font-size: 18px;
  color: #333;
}

.info-item .balance {
  font-size: 28px;
  font-weight: 700;
  color: #28a745;
}

.operations-history {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.operations-history h2 {
  font-size: 24px;
  margin-bottom: 20px;
  color: #333;
}

.operations-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 20px;
}

.operations-table thead {
  background: #f8f9fa;
}

.operations-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #666;
  border-bottom: 2px solid #dee2e6;
}

.operations-table td {
  padding: 12px;
  border-bottom: 1px solid #dee2e6;
}

.operations-table tr:hover {
  background: #f8f9fa;
}

.amount-in {
  color: #28a745;
  font-weight: 600;
}

.amount-out {
  color: #dc3545;
  font-weight: 600;
}

.btn-primary {
  background: #8b3ffd;
  color: white;
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary:hover {
  background: #7a35e0;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(139, 63, 253, 0.3);
}

.btn-secondary {
  background: #6c757d;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-secondary:hover {
  background: #5a6268;
}

.loading {
  text-align: center;
  padding: 40px;
  font-size: 18px;
  color: #666;
}
```

---

### Этап 3: Форма оплаты для клиентов

#### Файл 9: `/src/components/YooMoneyPaymentForm.tsx`

```typescript
// ЗАДАЧА: Простая форма для переводов на кошелек

import React from 'react';
import './YooMoneyPaymentForm.css';

interface YooMoneyPaymentFormProps {
  walletNumber: string; // Номер вашего кошелька
  amount?: number;
  description: string;
}

export const YooMoneyPaymentForm: React.FC<YooMoneyPaymentFormProps> = ({
  walletNumber,
  amount,
  description
}) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Скопировано!');
  };

  return (
    <div className="yoomoney-payment-form">
      <h3>Оплата через ЮMoney</h3>
      <p>Переведите деньги на кошелек:</p>
      
      <div className="payment-details">
        <div className="detail-item">
          <strong>Номер кошелька:</strong>
          <span className="wallet-number">{walletNumber}</span>
          <button 
            onClick={() => copyToClipboard(walletNumber)}
            className="btn-copy"
          >
            📋 Скопировать
          </button>
        </div>
        
        {amount && (
          <div className="detail-item">
            <strong>Сумма:</strong>
            <span className="amount">{amount} ₽</span>
          </div>
        )}
        
        <div className="detail-item">
          <strong>Назначение платежа:</strong>
          <span className="description">{description}</span>
        </div>
      </div>

      <div className="payment-instructions">
        <h4>Инструкция по оплате:</h4>
        <ol>
          <li>Войдите в ваш кошелек ЮMoney</li>
          <li>Выберите "Перевести"</li>
          <li>Введите номер кошелька: <code>{walletNumber}</code></li>
          {amount && <li>Укажите сумму: <strong>{amount} ₽</strong></li>}
          <li>В комментарии укажите: {description}</li>
          <li>Подтвердите перевод</li>
        </ol>
      </div>

      <a 
        href={`https://yoomoney.ru/to/${walletNumber}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary btn-pay"
      >
        💳 Оплатить через ЮMoney
      </a>
    </div>
  );
};
```

#### Файл 10: `/src/components/YooMoneyPaymentForm.css`

```css
/* ЗАДАЧА: Стили для формы оплаты */

.yoomoney-payment-form {
  max-width: 600px;
  margin: 0 auto;
  padding: 30px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.yoomoney-payment-form h3 {
  font-size: 24px;
  margin-bottom: 10px;
  color: #333;
}

.yoomoney-payment-form > p {
  color: #666;
  margin-bottom: 20px;
}

.payment-details {
  background: #f8f9fa;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 30px;
}

.detail-item {
  margin-bottom: 15px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-item:last-child {
  margin-bottom: 0;
}

.detail-item strong {
  color: #666;
  font-size: 14px;
}

.wallet-number {
  font-family: 'Courier New', monospace;
  font-size: 20px;
  font-weight: 700;
  color: #8b3ffd;
  letter-spacing: 1px;
}

.amount {
  font-size: 28px;
  font-weight: 700;
  color: #28a745;
}

.description {
  color: #333;
  font-size: 16px;
}

.btn-copy {
  background: #6c757d;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.3s;
  width: fit-content;
}

.btn-copy:hover {
  background: #5a6268;
}

.payment-instructions {
  margin-bottom: 30px;
}

.payment-instructions h4 {
  font-size: 18px;
  margin-bottom: 15px;
  color: #333;
}

.payment-instructions ol {
  padding-left: 20px;
}

.payment-instructions li {
  margin-bottom: 10px;
  color: #666;
  line-height: 1.6;
}

.payment-instructions code {
  background: #f8f9fa;
  padding: 2px 8px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  color: #8b3ffd;
}

.btn-pay {
  display: block;
  width: 100%;
  text-align: center;
  background: #8b3ffd;
  color: white;
  padding: 16px 24px;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-pay:hover {
  background: #7a35e0;
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(139, 63, 253, 0.3);
}
```

---

## 🔐 Настройка Webhook уведомлений

### Задача: Настроить HTTP-уведомления в ЮMoney

```
1. Войти в кошелек ЮMoney
2. Перейти в "Настройки" → "HTTP-уведомления"
3. Указать URL: https://nc-solutions.ru/api/yoomoney/webhook
4. Указать секретное слово (то же, что в .env YOOMONEY_NOTIFICATION_SECRET)
5. Выбрать события:
   ✅ p2p-incoming (входящий P2P перевод)
6. Сохранить настройки
```

---

## 🧪 Тестирование

### Чек-лист для тестирования

```bash
# 1. Проверка OAuth авторизации
✅ Открыть /api/yoomoney/auth
✅ Авторизоваться в ЮMoney
✅ Проверить сохранение токена в БД

# 2. Проверка получения баланса
✅ Открыть админ панель
✅ Проверить отображение баланса

# 3. Тестовый перевод
✅ Отправить тестовый перевод на свой кошелек
✅ Проверить получение webhook
✅ Проверить сохранение в БД
✅ Проверить уведомление в Telegram

# 4. История операций
✅ Проверить загрузку истории
✅ Фильтрация по типу операций
```

---

## 📊 Схема работы системы

### ВАРИАНТ 1: Прием переводов (простой)

```
1. Клиент видит номер вашего кошелька на сайте
   ↓
2. Клиент переводит деньги вручную через ЮMoney
   ↓
3. ЮMoney отправляет webhook на ваш сервер
   ↓
4. Сервер сохраняет информацию о переводе в БД
   ↓
5. Отправляется уведомление в Telegram
   ↓
6. Вы вручную подтверждаете получение оплаты
```

### ВАРИАНТ 2: OAuth + Автоматизация (сложный)

```
1. Администратор авторизуется через OAuth (один раз)
   ↓
2. Сервер получает access_token
   ↓
3. Периодически проверяет историю операций через API
   ↓
4. Автоматически сопоставляет входящие переводы с заказами
   ↓
5. Отправляет уведомления клиентам
   ↓
6. Может автоматически отправлять возвраты при необходимости
```

---

## ⚠️ Важные ограничения ЮMoney Wallet API

### Лимиты для кошельков:

```
Анонимный кошелек:
- Баланс: до 15,000 ₽
- Пополнение: до 15,000 ₽ в месяц
- ❌ Нельзя принимать переводы!

Именной кошелек:
- Баланс: до 60,000 ₽
- Пополнение: до 200,000 ₽ в месяц

Идентифицированный кошелек:
- Баланс: до 500,000 ₽
- Пополнение: до 600,000 ₽ в месяц
```

### Комиссии:

```
P2P переводы:
- С кошелька на кошелек: 0.5% (мин. 0 ₽)
- С банковской карты: от 2% + 30 ₽
```

---

## 🚀 Порядок внедрения

### День 1: Подготовка
1. ✅ Создать кошелек ЮMoney
2. ✅ Пройти идентификацию
3. ✅ Зарегистрировать приложение
4. ✅ Получить client_id и client_secret
5. ✅ Установить зависимости

### День 2: Backend
1. ✅ Создать конфигурацию YooMoneyAPI
2. ✅ Создать модели для БД (YooMoneyToken, IncomingTransfer)
3. ✅ Создать routes для OAuth и API
4. ✅ Протестировать авторизацию через Postman

### День 3: Webhook и интеграция
1. ✅ Настроить webhook endpoint
2. ✅ Настроить HTTP-уведомления в ЮMoney
3. ✅ Протестировать получение уведомлений
4. ✅ Интегрировать с Telegram для уведомлений

### День 4: Frontend
1. ✅ Создать админ панель (YooMoneyDashboard)
2. ✅ Создать форму оплаты для клиентов (YooMoneyPaymentForm)
3. ✅ Добавить стили
4. ✅ Протестировать весь flow

### День 5: Тестирование и запуск
1. ✅ Провести полное тестирование
2. ✅ Проверить безопасность (проверка signature в webhook)
3. ✅ Деплой на production
4. ✅ Финальное тестирование на production

---

## ✅ Итоговые выводы

### ЮMoney Wallet API подходит для:
- ✅ Приема P2P переводов от физлиц
- ✅ Небольших объемов платежей (до 600,000 ₽/мес)
- ✅ Ручного или полуавтоматического учета
- ✅ Простых схем оплаты без чеков

### НЕ подходит для:
- ❌ Приема платежей на банковский счет компании
- ❌ Больших объемов (нужна ЮKassa)
- ❌ Полностью автоматизированных платежей с чеками
- ❌ Юридических лиц (нужна ЮKassa)

### Рекомендация для NC-Solutions:

**Если вы работаете как ИП или юрлицо и нужны:**
- Чеки для налоговой (54-ФЗ)
- Прием на расчетный счет
- Полная автоматизация
- Большие объемы платежей

**→ Используйте ЮKassa вместо ЮMoney Wallet API**

**Если вы физлицо и принимаете небольшие платежи от друзей/знакомых:**
- До 600,000 ₽ в месяц
- Без чеков
- Простая схема

**→ ЮMoney Wallet API отлично подойдет**

---

## 📚 Полезные ссылки

- [Документация ЮMoney Wallet API](https://yoomoney.ru/docs/wallet)
- [Регистрация приложения](https://yoomoney.ru/myservices/new)
- [OAuth авторизация](https://yoomoney.ru/docs/wallet/using-api/authorization/basics)
- [HTTP-уведомления](https://yoomoney.ru/docs/wallet/using-api/notification-p2p-incoming)
- [Методы API](https://yoomoney.ru/docs/wallet/user-account/account-info)

---

## 🎯 Финальный чеклист перед запуском

```
✅ Кошелек создан и идентифицирован
✅ Приложение зарегистрировано
✅ client_id и client_secret получены
✅ Backend написан и протестирован
✅ OAuth авторизация работает
✅ Webhook настроен и проверен
✅ Frontend создан
✅ Интеграция с Telegram работает
✅ Все протестировано на dev окружении
✅ Деплой на production выполнен
✅ Финальное тестирование пройдено
```

---

**Удачи с интеграцией! 🚀**