import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import crypto from 'crypto';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';


dotenv.config();

// Получаем __dirname для ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import UserModel from './models/user.js';
import AiModel from './models/aimodels.js';
import UserChoosedModel from './models/userChoosedModels.js';
import RequestModel from './models/request.js';
import OurKoefficientModel from './models/ourKoefficient.js';
import PromocodeModel from './models/promocode.js';
import UsersWhoUsedPromocodeModel from './models/usersWhoUsedPromocode.js';

const app = express();
const PORT = process.env.PORT || 4444;

// MongoDB connection
mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Раздача статических файлов из папки uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Функция валидации Telegram initData
function validateTelegramInitData(initData, botToken) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');

    if (!hash) return { valid: false, user: null };

    urlParams.delete('hash');

    // Сортируем параметры и создаём строку для проверки
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Создаём секретный ключ
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Вычисляем хеш
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false, user: null };
    }

    // Извлекаем данные пользователя
    const userString = urlParams.get('user');
    const user = userString ? JSON.parse(userString) : null;

    return { valid: true, user };
  } catch (err) {
    console.error('Error validating Telegram initData:', err);
    return { valid: false, user: null };
  }
}

// Функция для сохранения base64 изображения
function saveBase64Image(base64Data) {
  try {
    // Извлекаем чистый base64 из data URL (убираем "data:image/png;base64,")
    const base64Match = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);

    if (!base64Match) {
      throw new Error('Invalid base64 image format');
    }

    const imageType = base64Match[1]; // png, jpeg, etc.
    const base64Image = base64Match[2];

    // Декодируем base64 в Buffer
    const imageBuffer = Buffer.from(base64Image, 'base64');

    // Генерируем уникальное имя файла
    const fileName = `${uuidv4()}.${imageType}`;
    const uploadsDir = path.join(__dirname, 'uploads', 'images');
    const filePath = path.join(uploadsDir, fileName);

    // Создаем директорию если не существует
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Сохраняем файл
    fs.writeFileSync(filePath, imageBuffer);

    // Возвращаем относительный путь для URL
    return `/uploads/images/${fileName}`;
  } catch (err) {
    console.error('Error saving base64 image:', err);
    throw err;
  }
}

// Middleware для проверки Telegram авторизации
function telegramAuthMiddleware(req, res, next) {
  // В dev-режиме пропускаем проверку (УБРАТЬ В ПРОДАКШЕНЕ!)
  if (process.env.NODE_ENV === 'development') {
    console.log('[DEV] Skipping Telegram auth validation');
    req.telegramUser = { id: req.query.tlgid || req.body.tlgid };
    return next();
  }

  const initData = req.headers['x-telegram-init-data'];

  if (!initData) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized: initData required',
    });
  }

  const { valid, user } = validateTelegramInitData(
    initData,
    process.env.BOT_TOKEN
  );

  if (!valid) {
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized: invalid signature',
    });
  }

  // Проверяем, что tlgid в запросе совпадает с user.id из initData
  const requestTlgid = req.query.tlgid || req.body.tlgid;
  if (requestTlgid && String(requestTlgid) !== String(user.id)) {
    return res.status(403).json({
      status: 'error',
      message: 'Forbidden: tlgid mismatch',
    });
  }

  req.telegramUser = user;
  next();
}

// Routes
app.get('/api', (req, res) => {
  console.log('rqst from bot done');
  res.json({
    message: 'Welcome to the API',
    status: 'Server is running',
  });
});

// вход пользователя в аппку
app.post('/api/enter', async (req, res) => {
  try {
    const { tlgid } = req.body;

    // Проверка наличия tlgid
    if (!tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'tlgid is required',
      });
    }

    const user = await UserModel.findOne({ tlgid: tlgid });

    //создание юзера
    if (!user) {
      const createresponse = await createNewUser(tlgid);

      // Проверка на ошибку создания пользователя
      if (!createresponse || createresponse.status !== 'created') {
        return res.status(500).json({
          status: 'error',
          message: 'Failed to create user',
        });
      }

      const userData = {};
      console.log('showOnboarding');
      userData.result = 'showOnboarding';
      return res.json({ status: 'success', userData });
    }

    // извлечь инфо о юзере из БД и передать на фронт действие
    const { _id, ...userData } = user._doc;
    userData.result = 'showIndexPage';
    console.log('showIndexPage');
    return res.json({ status: 'success', userData });
  } catch (err) {
    console.error('Error in /api/enter:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
});

async function createNewUser(tlgid) {
  try {
    const doc = new UserModel({
      tlgid: tlgid,
    });

    const user = await doc.save();

    if (!user) {
      throw new Error('ошибка при создании пользователя в бд UserModel');
    }

    return { status: 'created' };
  } catch (err) {
    console.error('Error in createNewUser:', err);
    return { status: 'error', message: err.message };
  }
}

// получение баланса пользователя
app.get('/api/getBalance', async (req, res) => {
  try {
    const { tlgid } = req.query;

    if (!tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'tlgid is required',
      });
    }

    const user = await UserModel.findOne({ tlgid: tlgid });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    const fixedBalance = user.balance.toFixed(2);

    return res.json({
      status: 'success',
      balance: fixedBalance,
    });
  } catch (err) {
    console.error('Error fetching balance:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch balance',
    });
  }
});

// получение всех AI моделей
app.get('/api/getAiModels', async (req, res) => {
  try {
    const { tlgid } = req.query;

    // Получаем все доступные модели
    const models = await AiModel.find();

    // Если tlgid не передан, возвращаем модели без поля isChoosed
    if (!tlgid) {
      return res.json({ status: 'success', models });
    }

    // Получаем модели, выбранные пользователем
    const userChoosedModels = await UserChoosedModel.find({ tlgid: tlgid });

    // Создаем Set с ID выбранных моделей
    const choosedModelIds = new Set(
      userChoosedModels.map((choice) => choice.aiModelLink.toString())
    );

    // Добавляем поле isChoosed к каждой модели
    const modelsWithChoosedFlag = models.map((model) => ({
      ...model._doc,
      isChoosed: choosedModelIds.has(model._id.toString()),
    }));

    return res.json({ status: 'success', models: modelsWithChoosedFlag });
  } catch (err) {
    console.error('Error fetching AI models:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch AI models',
    });
  }
});

// Функция для генерации случайной строки
function generateRandomString(length = 25) {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// получение выбранных моделей пользователя (защищено telegramAuthMiddleware)
app.get(
  '/api/getUserChosenModels',
  telegramAuthMiddleware,
  async (req, res) => {
    try {
      const { tlgid } = req.query;

      if (!tlgid) {
        return res.status(400).json({
          status: 'error',
          message: 'tlgid is required',
        });
      }

      // Находим все выбранные модели пользователя с populate
      const chosenModels = await UserChoosedModel.find({ tlgid: tlgid })
        .populate('aiModelLink')
        .populate('userLink');

      return res.json({
        status: 'success',
        models: chosenModels,
      });
    } catch (err) {
      console.error('Error fetching user chosen models:', err);
      return res.status(500).json({
        status: 'error',
        message: 'Failed to fetch chosen models',
        error: err.message,
      });
    }
  }
);

// выбор AI модели пользователем
app.post('/api/chooseAiModel', async (req, res) => {
  try {
    const { modelId, tlgid } = req.body;

    if (!tlgid || !modelId) {
      return res.status(400).json({
        status: 'error',
        message: 'tlgid and modelId are required',
      });
    }

    // Находим пользователя по tlgid
    const user = await UserModel.findOne({ tlgid: tlgid });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Проверяем, существует ли уже такая запись
    const existingChoice = await UserChoosedModel.findOne({
      userLink: user._id,
      aiModelLink: modelId,
    });

    if (existingChoice) {
      return res.json({
        status: 'already_exists',
        choice: existingChoice,
      });
    }

    // Генерируем случайный токен
    const token = generateRandomString(25);

    // Создаем новую запись
    const doc = new UserChoosedModel({
      userLink: user._id,
      aiModelLink: modelId,
      tlgid: tlgid,
      token: token,
    });

    await doc.save();

    return res.status(201).json({
      status: 'created',
      choice: doc,
    });
  } catch (err) {
    console.error('Error choosing AI model:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to save choice',
      error: err.message,
    });
  }
});

// удаление выбранной модели пользователем
app.delete('/api/deleteChosenModel', async (req, res) => {
  try {
    const { chosenModelId } = req.body;

    if (!chosenModelId) {
      return res.status(400).json({
        status: 'error',
        message: 'chosenModelId is required',
      });
    }

    // Удаляем запись из БД
    const deletedModel = await UserChoosedModel.findByIdAndDelete(
      chosenModelId
    );

    if (!deletedModel) {
      return res.status(404).json({
        status: 'error',
        message: 'Chosen model not found',
      });
    }

    return res.json({
      status: 'deleted',
      deletedModel: deletedModel,
    });
  } catch (err) {
    console.error('Error deleting chosen model:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to delete chosen model',
      error: err.message,
    });
  }
});



// единый endpoint для всех запросов
app.post('/api/request', async (req, res) => {
  try {


    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    

    const findToken = await UserChoosedModel.findOne({
      token,
    });

    if (!authHeader || !findToken) {
      return res.status(400).json({
        status: 'error',
        message: 'передайте верный токен'
      });
    }



    const aiModelLink = findToken.aiModelLink;
    const ownerId = findToken.userLink;
    const ownerTlg = findToken.tlgid;

    

    const checkBalance = await UserModel.findOne({
      tlgid: findToken.tlgid,
    });

    if (!checkBalance) {
      return res.status(400).json({
        status: 'error',
        message: 'пользователь не найден'
      });
    }

    const balance = checkBalance.balance;

    console.log('Balance=', balance);

    // если баланс <20 руб, написать юзеру (владельцу сообшщеение, чтобы пополнил баланс)
    // и не выполнять запросы?


    // text_to_text - text to text
    // text_to_image
    // image_to_image

    const { input, type = 'text_to_text', photo_url, format } = req.body;

    // Валидация типов параметров
    if (!input) {
      return res.status(400).json({
        status: 'error',
        message: 'Поле input обязательно'
      });
    }

    if (typeof input !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Поле input должно быть строкой'
      });
    }

    if (typeof type !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Поле type должно быть строкой'
      });
    }

    if (photo_url !== undefined && typeof photo_url !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Поле photo_url должно быть строкой'
      });
    }

    if (format !== undefined && typeof format !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Поле format должно быть строкой'
      });
    }

    if (balance < 20) {
      console.log('баланс меньше 20');
      return res.status(201).json({
        status: 'lowbalance',
      });
    }

    // Создаем новую запись rqst
    const doc = new RequestModel({
      aiModelLink: aiModelLink,
      ownerId: ownerId,
      ownerTlg: ownerTlg,
      inputFromRequest: input,
      isAuthorised: true,
      inputTokens: null,
      outputTokens: null,
      isRqstOperated: false,
      type: type,
    });

    await doc.save();

    // TODO: создать функцию запроса к ИИ от разных компаний
    const responseFromAi = await rqstToAi(
      doc._id,
      aiModelLink,
      input,
      ownerTlg,
      type,
      req
    );

    console.log('responseFromAi', responseFromAi);

    // Проверяем, вернулась ли ошибка из функции
    if (responseFromAi?.error) {
      return res.status(400).json({
        status: 'error',
        message: responseFromAi.message,
      });
    }

    return res.status(201).json({
      status: 'success',
      message: responseFromAi,
    });
  } catch (err) {
    console.error('Error choosing AI model:', err);
    return res.status(500).json({
      status: 'error',
    });
  }
});



// Webhook об оплате
app.post('/api/webhook_payment', async (req, res) => {
  try {
    const { paydUser, paydSum } = req.body;

    console.log('=== WEBHOOK: Получены данные от платеже из бота ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('=== END WEBHOOK 2 ===');

    const updatedUser = await UserModel.findOneAndUpdate(
      { tlgid: paydUser },
      {
        $inc: {
          balance: paydSum,
        },
      },
      { new: true }
    );

    // Отправляем ответ платежной системе (обычно требуется 200 OK)
    return res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully',
      balance: updatedUser.balance,
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({
      status: 'error',
    });
  }
});

// Получение курса USD к RUB из ЦБ РФ
async function getRate_Rub_Usd() {
  try {
    const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');

    if (!response.ok) {
      throw new Error(`ЦБ РФ API error: ${response.status}`);
    }

    const data = await response.json();
    const usdRate = data?.Valute?.USD?.Value;

    if (!usdRate) {
      throw new Error('USD rate not found in response');
    }

    console.log(`Текущий курс: 1 USD = ${usdRate} RUB`);
    return usdRate;
  } catch (err) {
    console.error('Error fetching USD/RUB rate:', err);
    //FIXME:  Возвращаем резервный курс, если API недоступен
    const fallbackRate = 100;
    console.warn(`Using fallback rate: ${fallbackRate} RUB`);
    return fallbackRate;
  }
}




// ============ Вспомогательные функции для rqstToAi_new ============

/**
 * Создаёт OpenAI клиент для OpenRouter
 */
function createOpenRouterClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

/**
 * Получает коэффициент наценки из БД (с fallback на значение по умолчанию)
 */
async function getOurCoefficient() {
  const config = await OurKoefficientModel.findOne();
  if (!config?.value) {
    console.warn('Коэффициент наценки не найден в БД, используется значение по умолчанию: 2');
    return 2;
  }
  return config.value;
}

/**
 * Выполняет биллинг: расчёт стоимости, списание баланса, обновление запроса
 */
async function processBilling({
  rqstNumber,
  inputTokens,
  outputTokens,
  inputTokenPriceUsd,
  outputTokenPriceUsd,
  ownerTlg,
}) {
  // Проверка наличия данных о токенах
  const hasUsageData = inputTokens > 0 || outputTokens > 0;
  if (!hasUsageData) {
    console.warn('⚠️ API не вернул данные о токенах. Биллинг пропущен.');
    await RequestModel.findOneAndUpdate(
      { _id: rqstNumber },
      { $set: { isRqstOperated: true, billingSkipped: true } }
    );
    return { billingSkipped: true };
  }

  // Получаем коэффициент из БД
  const ourCoefficient = await getOurCoefficient();

  // Расчёт стоимости токенов в USD (цена за 1 млн токенов)
  const inputCostUsd = (inputTokens * inputTokenPriceUsd) / 1_000_000;
  const outputCostUsd = (outputTokens * outputTokenPriceUsd) / 1_000_000;
  const totalCostUsd = inputCostUsd + outputCostUsd;

  // Конвертация в рубли
  const rate = await getRate_Rub_Usd();
  const totalCostRub = totalCostUsd * rate;
  const finalPriceRub = Number((totalCostRub * ourCoefficient).toFixed(3));

  // Списание с баланса
  const updatedOwner = await UserModel.findOneAndUpdate(
    { tlgid: ownerTlg },
    { $inc: { balance: -finalPriceRub } },
    { new: true }
  );

  if (!updatedOwner) {
    throw new Error('Пользователь не найден');
  }

  // Обновление запроса в БД
  await RequestModel.findOneAndUpdate(
    { _id: rqstNumber },
    {
      $set: {
        inputTokens,
        outputTokens,
        priceBasicForInputTokensUsd: inputCostUsd,
        priceBasicForOutputTokensUsd: outputCostUsd,
        isRqstOperated: true,
        rate,
        priceOurTotalAllRqstRub: finalPriceRub,
      },
    }
  );

  console.log(`✅ Баланс обновлен. Новый баланс: ${updatedOwner.balance} RUB`);
  console.log(`   Коэффициент: ${ourCoefficient} | Курс: 1 USD = ${rate} RUB`);
  console.log(`   Стоимость: ${totalCostUsd.toFixed(6)} USD = ${finalPriceRub} RUB`);

  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
    rate,
    finalPriceRub,
    ourCoefficient,
  };
}

// ============ Обработчики для разных типов моделей (Strategy Pattern) ============

/**
 * Обработчик для text_to_text моделей
 */
async function handleTextToText({ openai, modelName, input }) {
  const completion = await openai.chat.completions.create({
    model: modelName,
    messages: [{ role: 'user', content: input }],
  });

  console.log('Full API response:', JSON.stringify(completion, null, 2));

  const replyFromAi = completion.choices[0]?.message?.content || '';
  if (!replyFromAi) {
    console.warn('No reply text found in AI response');
  }
  console.log('Reply from AI:', replyFromAi);

  return {
    result: replyFromAi,
    inputTokens: completion.usage?.prompt_tokens || 0,
    outputTokens: completion.usage?.completion_tokens || 0,
  };
}

/**
 * Извлекает base64 изображение из ответа API (поддержка разных форматов)
 */
function extractImageFromResponse(completion) {
  const message = completion.choices?.[0]?.message;
  if (!message) return null;

  // Формат 1: message.images[].image_url.url (Gemini)
  if (message.images?.[0]?.image_url?.url) {
    return message.images[0].image_url.url;
  }

  // Формат 2: message.content как массив с image_url (OpenAI Vision style)
  if (Array.isArray(message.content)) {
    const imageContent = message.content.find(
      (item) => item.type === 'image_url' || item.type === 'image'
    );
    if (imageContent?.image_url?.url) {
      return imageContent.image_url.url;
    }
    if (imageContent?.url) {
      return imageContent.url;
    }
  }

  // Формат 3: data[].b64_json (DALL-E style)
  if (completion.data?.[0]?.b64_json) {
    return `data:image/png;base64,${completion.data[0].b64_json}`;
  }

  // Формат 4: data[].url (URL вместо base64)
  if (completion.data?.[0]?.url) {
    return completion.data[0].url;
  }

  return null;
}

/**
 * Обработчик для text_to_image моделей
 */
const ALLOWED_FORMATS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

async function handleTextToImage({ openai, modelName, input, req }) {
  if (req.body.format && !ALLOWED_FORMATS.includes(req.body.format)) {
    return {
      error: true,
      message: `Неверный format. Допустимые значения: ${ALLOWED_FORMATS.join(', ')}`,
    };
  }

  const completion = await openai.chat.completions.create({
    model: modelName,
    messages: [{ role: 'user', content: input }],
    image_config: {
      aspect_ratio: req.body.format || '1:1'
    },
  });

  // Логирование структуры ответа (без base64 данных)
  const responseForLog = JSON.parse(JSON.stringify(completion));
  const truncateBase64 = (obj) => {
    if (typeof obj === 'string' && obj.startsWith('data:image')) {
      const imageType = obj.match(/^data:image\/(\w+);base64,/)?.[1] || 'unknown';
      return `[BASE64_IMAGE_${imageType.toUpperCase()}_${obj.length}_bytes]`;
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = truncateBase64(obj[key]);
      }
    }
    return obj;
  };
  console.log('Full response:', JSON.stringify(truncateBase64(responseForLog), null, 2));

  // Извлекаем изображение из ответа
  const base64ImageUrl = extractImageFromResponse(completion);

  if (!base64ImageUrl) {
    const textContent = completion.choices?.[0]?.message?.content;
    console.error('❌ Не удалось найти изображение. Структура message:',
      JSON.stringify(completion.choices?.[0]?.message, null, 2)?.substring(0, 500));

    return {
      error: true,
      message: 'поменяйте запрос в input',
    };
  }

  // Если это URL (не base64) — нужно скачать
  if (base64ImageUrl.startsWith('http')) {
    console.log('Image URL received:', base64ImageUrl);
    return {
      result: base64ImageUrl,
      inputTokens: completion.usage?.prompt_tokens || 0,
      outputTokens: completion.usage?.completion_tokens || 0,
    };
  }

  // Сохраняем base64 изображение
  const savedImagePath = saveBase64Image(base64ImageUrl);
  const fullImageUrl = `${req.protocol}://${req.get('host')}${savedImagePath}`;

  console.log('Image saved at:', fullImageUrl);

  return {
    result: fullImageUrl,
    inputTokens: completion.usage?.prompt_tokens || 0,
    outputTokens: completion.usage?.completion_tokens || 0,
  };
}


async function handleImageToImage({ openai, modelName, input, req }) {
  if (!req.body.photo_url) {
    return {
      error: true,
      message: 'Для image_to_image необходимо передать photo_url',
    };
  }

  if (req.body.format && !ALLOWED_FORMATS.includes(req.body.format)) {
    return {
      error: true,
      message: `Неверный format. Допустимые значения: ${ALLOWED_FORMATS.join(', ')}`,
    };
  }

  const completion = await openai.chat.completions.create({
    model: modelName,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: input
        },
        {
          type: 'image_url',
          image_url: {
            url: req.body.photo_url
          }
        }
      ]
    }],
    // Указываем, что хотим получить изображение в ответе (для Gemini)
    extra_body: {
      generation_config: {
        response_modalities: ['image', 'text']
      }
    },
    image_config: {
      aspect_ratio: req.body.format || '1:1'
    },
  });

  // Логирование структуры ответа (без base64 данных)
  const responseForLog = JSON.parse(JSON.stringify(completion));
  const truncateBase64 = (obj) => {
    if (typeof obj === 'string' && obj.startsWith('data:image')) {
      const imageType = obj.match(/^data:image\/(\w+);base64,/)?.[1] || 'unknown';
      return `[BASE64_IMAGE_${imageType.toUpperCase()}_${obj.length}_bytes]`;
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = truncateBase64(obj[key]);
      }
    }
    return obj;
  };
  console.log('Full response:', JSON.stringify(truncateBase64(responseForLog), null, 2));

  // Извлекаем изображение из ответа
  const base64ImageUrl = extractImageFromResponse(completion);

  if (!base64ImageUrl) {
    const textContent = completion.choices?.[0]?.message?.content;
    console.error('❌ Не удалось найти изображение. Структура message:',
      JSON.stringify(completion.choices?.[0]?.message, null, 2)?.substring(0, 500));

    return {
      error: true,
      message: 'поменяйте запрос в input',
    };
  }

  // Если это URL (не base64) — нужно скачать
  if (base64ImageUrl.startsWith('http')) {
    console.log('Image URL received:', base64ImageUrl);
    return {
      result: base64ImageUrl,
      inputTokens: completion.usage?.prompt_tokens || 0,
      outputTokens: completion.usage?.completion_tokens || 0,
    };
  }

  // Сохраняем base64 изображение
  const savedImagePath = saveBase64Image(base64ImageUrl);
  const fullImageUrl = `${req.protocol}://${req.get('host')}${savedImagePath}`;

  console.log('Image saved at:', fullImageUrl);

  return {
    result: fullImageUrl,
    inputTokens: completion.usage?.prompt_tokens || 0,
    outputTokens: completion.usage?.completion_tokens || 0,
  };
}


async function handleImageToText({ openai, modelName, input, req }) {
  if (!req.body.photo_url) {
    return {
      error: true,
      message: 'необходимо передать photo_url',
    };
  }

  // Формируем промпт для описания изображения
  const prompt = input || 'Опиши подробно, что изображено на этой картинке.';

  const completion = await openai.chat.completions.create({
    model: modelName,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: prompt
        },
        {
          type: 'image_url',
          image_url: {
            url: req.body.photo_url
          }
        }
      ]
    }],
  });

  console.log('Full API response:', JSON.stringify(completion, null, 2));

  // Извлекаем текстовый ответ
  const replyFromAi = completion.choices[0]?.message?.content || '';

  if (!replyFromAi) {
    console.warn('No text reply found in AI response');
    throw new Error('No text found in response');
  }

  console.log('Reply from AI:', replyFromAi);

  return {
    result: replyFromAi,
    inputTokens: completion.usage?.prompt_tokens || 0,
    outputTokens: completion.usage?.completion_tokens || 0,
  };
}


/**
 * Маппинг типов моделей на обработчики
 */
const modelTypeHandlers = {
  text_to_text: handleTextToText,
  text_to_image: handleTextToImage,
  image_to_image: handleImageToImage,
  image_to_text: handleImageToText
};

// ============ Основная функция ============

async function rqstToAi(rqstNumber, aiModelLink, input, ownerTlg, type, req) {
  try {
    const aiModelData = await AiModel.findOne({ _id: aiModelLink });

    if (!aiModelData) {
      throw new Error('AI Model not found'); 
    }

    const { type: modelTypes, nameForRequest: modelName } = aiModelData;
    const { input_token_priceBasicUsd, output_token_priceBasicUsd } = aiModelData;

    // Проверка соответствия типа модели и типа запроса
    // modelTypes теперь массив, например: ['text_to_text', 'text_to_image']
    const supportedTypes = Array.isArray(modelTypes) ? modelTypes : [modelTypes];
    const requestedType = type.toLowerCase();

    const isTypeSupported = supportedTypes.some(
      (t) => t && t.toLowerCase() === requestedType
    );

    if (!isTypeSupported) {
      return {
        error: true,
        message: `модель ${modelName} работает только с type = ${supportedTypes.join(', ')}`,
      };
    }

    // Получаем обработчик для запрошенного типа
    const handler = modelTypeHandlers[requestedType];
    if (!handler) {
      throw new Error(`Неподдерживаемый тип модели: ${requestedType}`);
    }

    const openai = createOpenRouterClient();

    // Выполняем запрос через соответствующий обработчик
    const handlerResult = await handler({
      openai,
      modelName,
      input,
      req,
    });

    // Проверяем, вернул ли обработчик ошибку
    if (handlerResult.error) {
      return handlerResult;
    }

    const { result, inputTokens, outputTokens } = handlerResult;

    // Обработка биллинга
    await processBilling({
      rqstNumber,
      inputTokens,
      outputTokens,
      inputTokenPriceUsd: input_token_priceBasicUsd,
      outputTokenPriceUsd: output_token_priceBasicUsd,
      ownerTlg,
    });

    return result;
  } catch (err) {
    console.error('Error in rqstToAi_new:', err);
    throw err;
  }
}

// получение истории запросов пользователя
app.get('/api/getRequestHistory', async (req, res) => {
  try {
    const { tlgid } = req.query;

    if (!tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'tlgid is required',
      });
    }

    // Находим все запросы пользователя по tlgid
    const requests = await RequestModel.find({ ownerTlg: tlgid })
      .populate('aiModelLink')
      .sort({ createdAt: -1 }); // Сортировка по дате создания (новые сверху)

    // Форматируем даты для каждого запроса
    const formattedRequests = requests.map((request) => {
      const date = new Date(request.createdAt);
      const formattedDate = date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      return {
        ...request._doc,
        formattedDate: formattedDate,
      };
    });

    return res.json({
      status: 'success',
      requests: formattedRequests,
    });
  } catch (err) {
    console.error('Error fetching request history:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch request history',
      error: err.message,
    });
  }
});

// для создания новых моделей
app.post('/api/createAiModel', async (req, res) => {
  try {
    const doc = new AiModel({
      nameForUser: 'Gemini 3 (Nano Banana Pro)',
      nameForRequest: 'google/gemini-3-pro-image-preview',
      input_token_priceBasicUsd: 2,
      output_token_priceBasicUsd: 120,
      input_token_priceOurRub: 320,
      output_token_priceOurRub: 19200,
      type: ['text_to_image', 'image_to_image']
    });

    await doc.save(); // Сохранение в БД

    return res.status(201).json({ status: 'created', model: doc });
  } catch (err) {
    console.error('Error creating AI model:', err);
  }
});

// для создания новых промокодов
app.post('/api/createPromocode', async (req, res) => {
  try {
    const doc = new PromocodeModel({
      promocode: 'easydev',
      balance: 50,
      isActive: true,
    });

    await doc.save(); // Сохранение в БД

    return res.status(201).json({ status: 'created', promocode: doc });
  } catch (err) {
    console.error('Error creating new promocode', err);
  }
});

// проверка и применение промокода
app.post('/api/applyPromocode', async (req, res) => {
  try {
    const { promocode, tlgid } = req.body;

    if (!promocode || !tlgid) {
      return res.status(400).json({
        status: 'error',
        message: 'promocode and tlgid are required',
      });
    }

    // Проверяем существует ли промокод и активен ли он
    const promocodeData = await PromocodeModel.findOne({
      promocode: promocode,
      isActive: true,
    });

    // Если промокод не найден или не активен
    if (!promocodeData) {
      return res.json({
        status: 'notFound',
        message: 'Промокод не действует',
      });
    }

    // Проверяем существует ли пользователь
    const user = await UserModel.findOne({ tlgid: tlgid });

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Проверяем не использовал ли уже пользователь этот промокод
    const alreadyUsed = await UsersWhoUsedPromocodeModel.findOne({
      userLink: user._id,
      promocodeLink: promocodeData._id,
    });

    if (alreadyUsed) {
      return res.json({
        status: 'alreadyUsed',
        message: 'Вы уже использовали этот промокод',
      });
    }

    // Начисляем баланс пользователю
    const updatedUser = await UserModel.findOneAndUpdate(
      { tlgid: tlgid },
      {
        $inc: {
          balance: promocodeData.balance,
        },
      },
      { new: true }
    );

    // Записываем информацию об использовании промокода
    const usageRecord = new UsersWhoUsedPromocodeModel({
      userLink: user._id,
      userTlg: tlgid,
      promocodeLink: promocodeData._id,
      balanceWasPresented: promocodeData.balance,
    });

    await usageRecord.save();

    return res.json({
      status: 'success',
      message: 'Промокод успешно применен',
      balance: updatedUser.balance.toFixed(2),
      addedBalance: promocodeData.balance,
    });
  } catch (err) {
    console.error('Error applying promocode:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to apply promocode',
      error: err.message,
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT}`);
});
