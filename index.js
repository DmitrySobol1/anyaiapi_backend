import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import crypto from 'crypto';

dotenv.config();

import UserModel from './models/user.js';
import AiModel from './models/aimodels.js';
import UserChoosedModel from './models/userChoosedModels.js';
import RequestModel from './models/request.js';
import OurKoefficientModel from './models/ourKoefficient.js';

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

// Routes
app.get('/api', (req, res) => {
  console.log('rqst from bot done');
  res.json({
    message: 'Welcome to the API',
    status: 'Server is running',
  });
});

// вход пользователя в аппку
app.post('/enter', async (req, res) => {
  try {
    const { tlgid } = req.body;

    const user = await UserModel.findOne({ tlgid: tlgid });

    //создание юзера
    if (!user) {
      const createresponse = await createNewUser(tlgid);

      // if (!createresponse) {
      //   throw new Error('ошибка в функции createNewUser');
      // }

      if (createresponse.status == 'created') {
        const userData = {};
        console.log('showOnboarding');
        userData.result = 'showOnboarding';
        return res.json({ userData });
      }
    }

    // извлечь инфо о юзере из БД и передать на фронт действие
    const { _id, ...userData } = user._doc;
    userData.result = 'showIndexPage';
    console.log('showIndexPage');
    return res.json({ userData });
  } catch (err) {
    // logger.error({
    //       title: 'Error in endpoint /system/enter',
    //       message: err.message,
    //       dataFromServer: err.response?.data,
    //       statusFromServer: err.response?.status,
    //     });
  }
  return res.json({ statusBE: 'notOk' });
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
    return false;
  }
}

// получение баланса пользователя
app.get('/getBalance', async (req, res) => {
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

    return res.json({
      status: 'success',
      balance: user.balance,
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
app.get('/getAiModels', async (req, res) => {
  try {
    const { tlgid } = req.query;

    // Получаем все доступные модели
    const models = await AiModel.find();

    // Если tlgid не передан, возвращаем модели без поля isChoosed
    if (!tlgid) {
      return res.json({ models });
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

    return res.json({ models: modelsWithChoosedFlag });
  } catch (err) {
    console.error('Error fetching AI models:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch AI models',
    });
  }
});

// Функция для генерации случайной строки
function generateRandomString(length = 15) {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// получение выбранных моделей пользователя
app.get('/getUserChosenModels', async (req, res) => {
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
});

// выбор AI модели пользователем
app.post('/chooseAiModel', async (req, res) => {
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
    const token = generateRandomString(15);

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
app.delete('/deleteChosenModel', async (req, res) => {
  try {
    const { chosenModelId } = req.body;

    if (!chosenModelId) {
      return res.status(400).json({
        status: 'error',
        message: 'chosenModelId is required',
      });
    }

    // Удаляем запись из БД
    const deletedModel = await UserChoosedModel.findByIdAndDelete(chosenModelId);

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



// новый запрос
app.post('/request', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    const findToken = await UserChoosedModel.findOne({
      token,
    });

    const aiModelLink = findToken.aiModelLink;
    const ownerId = findToken.userLink;
    const ownerTlg = findToken.tlgid;

    // TODO: возвращать ошибку
    // if (!findToken){
    //   // вернуть ошибку
    // }

    const checkBalance = await UserModel.findOne({
      tlgid: findToken.tlgid,
    });

    const balance = checkBalance.balance;

    console.log('Balance=', balance);

    // если баланс <20 руб, написать юзеру (владельцу сообшщеение, чтобы пополнил баланс)
    // и не выполнять запросы?

    const { input } = req.body;

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
    });

    await doc.save();

    // TODO: создать функцию запроса к ИИ от разных компаний
    const responseFromAi = await rqstToAi(doc._id, aiModelLink, input, ownerTlg);

    console.log('responseFromAi', responseFromAi);

    return res.status(201).json({
      status: 'success',
      message: responseFromAi,
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



// Webhook об оплате
app.post('/webhook_payment', async (req, res) => {
  try {

    const {paydUser, paydSum} = req.body

    console.log('=== WEBHOOK: Получены данные от платеже из бота ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('=== END WEBHOOK 2 ===');


    const updatedUser = await UserModel.findOneAndUpdate(
      { tlgid: paydUser },
      {
        $inc: {
          balance: paydSum
        }
      },
      { new: true }
    );

    // Отправляем ответ платежной системе (обычно требуется 200 OK)
    return res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully',
      balance: updatedUser.balance
    });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({
      status: 'error'
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

async function rqstToAi(rqstNumber, aiModelLink, input, ownerTlg) {
  try {
    const aiModelData = await AiModel.findOne({
      _id: aiModelLink,
    });

    if (!aiModelData) {
      throw new Error('AI Model not found');
    }

    const ourAiToken = aiModelData.ourToken;
    const modelName = aiModelData.nameForRequest;

    const input_token_priceBasicUsd = aiModelData.input_token_priceBasicUsd;
    const output_token_priceBasicUsd = aiModelData.output_token_priceBasicUsd;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ourAiToken}`,
      },
      body: JSON.stringify({
        model: modelName,
        input: input,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    const input_tokens = data?.usage?.input_tokens;
    const output_tokens = data?.usage?.output_tokens;

    const calculate_priceBasicForInputTokensUsd =
      (input_tokens * input_token_priceBasicUsd) / 1000000;
    const calculate_priceBasicForOutputTokensUsd =
      (output_tokens * output_token_priceBasicUsd) / 1000000;

    const calculate_priceBasicAllRqstUsd =
      calculate_priceBasicForInputTokensUsd +
      calculate_priceBasicForOutputTokensUsd;

    const rate = await getRate_Rub_Usd();

    // FIXME: мой коэф увеличения цены. Сейчас = 2
    // Сделать отдельную БД для каждой компании (open Ai, Антропик, ...)
    const ourKoefficient = 2;

    const calculate_priceBasicAllRqstRub =
      calculate_priceBasicAllRqstUsd * rate;

    const priceOurTotalAllRqstRub = Number((calculate_priceBasicAllRqstRub * ourKoefficient).toFixed(3))

    const updatedOwner = await UserModel.findOneAndUpdate(
      { tlgid: ownerTlg },
      {
        $inc: {
          balance: -priceOurTotalAllRqstRub
        }
      },
      { new: true }
    );

    console.log(`Баланс обновлен. Новый баланс: ${updatedOwner.balance} RUB`);



    //input_tokens - входяшие токены за запрос
    //output_tokens - output токены за запрос

    // input_token_priceBasicUsd - базовая цена от openAi за 1млн input
    // output_token_priceBasicUsd - базовая цена от openAi за 1млн output

    // calculate_priceBasicForInputTokensUsd - цена input токенов текущего запроса (по цена openAi)
    // calculate_priceBasicForOutputTokensUsd - цена output токенов текущего запроса (по цена openAi)

    // rate - ставка 1 usd = X rub (по ЦБ РФ)
    // ourKoefficient - мой коэффициент повышения цены

    // calculate_priceBasicAllRqstRub - стоимость всего запроса в Руб (по базовой цене openAi)
    // priceOurTotalAllRqstRub - стоимость запроса в Руб, с учетом моего коэф повышения цены
    

    console.log(`1 usd= ${rate} rub`);
    console.log('цена запрос в USD =', calculate_priceBasicAllRqstUsd);
    console.log('цена запрос в RUB =', calculate_priceBasicAllRqstRub);



    const updateRqst = await RequestModel.findOneAndUpdate(
      { _id: rqstNumber },
      {
        $set: {
          inputTokens: input_tokens,
          outputTokens: output_tokens,
          priceBasicForInputTokensUsd: calculate_priceBasicForInputTokensUsd,
          priceBasicForOutputTokensUsd: calculate_priceBasicForOutputTokensUsd,
          isRqstOperated: true,
          rate: rate,
          priceOurTotalAllRqstRub: priceOurTotalAllRqstRub
        },
      },
      { new: true }
    );





    // Извлечение ответа от AI
    const replyFromAi = data?.output?.[0]?.content?.[0]?.text || '';

    if (!replyFromAi) {
      console.warn('No reply text found in AI response');
    }

    return replyFromAi;
  } catch (err) {
    console.error('Error in rqstToAi:', err);
    throw err;
  }
}

// для создания новых моделей
app.post('/createAiModel', async (req, res) => {
  try {
    const doc = new AiModel({
      nameForUser: 'gpt-4.1-nano',
      nameForRequest: 'gpt-4.1-nano', 
      input_token_priceBasicUsd: 0.1 ,
      output_token_priceBasicUsd: 0.4 ,
      input_token_priceOurRub: 16.6,
      output_token_priceOurRub: 66.4
    });

    await doc.save(); // Сохранение в БД

    return res.status(201).json({ status: 'created', model: doc });
  } catch (err) {
    console.error('Error creating AI model:', err);
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
