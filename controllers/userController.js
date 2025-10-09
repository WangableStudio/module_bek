const ApiError = require("../error/ApiError");
const { User, Contractors, Payment } = require("../models/models");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const axios = require("axios");
const TINKOFF_TERMINAL_KEY = "1759332525322";
const TINKOFF_TERMINAL_KEY_E2C = "1759332525322E2C"; // для выплат
const TINKOFF_PASSWORD = "gP3PIYw*xe5L#$9G";

const generateJwt = (id, name, login) => {
  const payload = { id, name, login };
  return jwt.sign(payload, process.env.SECRET_KEY, { expiresIn: "24h" });
};
function createTinkoffToken(payload, password) {
  const filtered = {};
  for (const key in payload) {
    if (typeof payload[key] !== "object") {
      filtered[key] = payload[key];
    }
  }

  filtered.Password = password;

  // 3️⃣ Сортируем по ключам в алфавитном порядке
  const sortedKeys = Object.keys(filtered).sort();

  // 4️⃣ Склеиваем значения в одну строку
  const concatenated = sortedKeys.map((key) => String(filtered[key])).join("");
  console.log(concatenated);
  // 5️⃣ Вычисляем SHA-256 хеш
  const token = crypto
    .createHash("sha256")
    .update(concatenated, "utf8")
    .digest("hex");

  return token;
}

class UserController {
  async create(req, res, next) {
    try {
      const { name, login, password } = req.body;

      if (!name || !login || !password) {
        return next(ApiError.badRequest("Заполните все поля"));
      }

      let id = Math.floor(100000 + Math.random() * 900000);
      const hashPassword = await bcrypt.hash(password, 5);

      const user = await User.create({
        id: id,
        name,
        login,
        password: hashPassword,
      });

      return res.json(user);
    } catch (err) {
      next(ApiError.internal("Ошибка при создании пользователя"));
    }
  }

  async paymentUrl(req, res, next) {
    try {
      const {
        contractor,
        commission,
        companyAmount,
        contractorAmount,
        items,
        totalAmount,
      } = req.body;

      if (!contractor?.id) {
        return next(ApiError.badRequest("Подрядчик не указан"));
      }

      const contractorRecord = await Contractors.findByPk(contractor.id);
      if (!contractorRecord) {
        return next(ApiError.badRequest("Подрядчик не найден"));
      }

      const cleanedPhone = contractorRecord.phone.replace(/[^\d+]/g, "");
      const orderId = `order-${Date.now()}`;
      const amountInKopecks = Math.round(totalAmount * 100);

      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY,
        Amount: amountInKopecks,
        OrderId: orderId,
        Description: `Оплата услуг: ${contractor.name}`,
        CreateDealWithType: "NN",
        PaymentRecipientId: cleanedPhone,
        NotificationURL: `${process.env.BACKEND_URL}/api/v1/user/notification`,
        DATA: {
          companyAmount,
          contractorAmount,
          commission,
        },
      };

      // Добавляем токен
      payload.Token = createTinkoffToken(payload, TINKOFF_PASSWORD);

      console.log("[TINKOFF] Payload:", payload);

      const response = await axios.post(
        "https://rest-api-test.tinkoff.ru/v2/Init",
        payload,
        { headers: { "Content-Type": "application/json" } }
      );

      const data = response.data;
      console.log("[TINKOFF RESPONSE]", data);

      if (!data.Success) {
        console.error("[TINKOFF ERROR]", data);
        return res.status(400).json({ success: false, data });
      }

      const payment = await Payment.create({
        id: data.PaymentId,
        orderId,
        paymentUrl: data.PaymentURL,
        status: data.Status,
        contractorId: contractorRecord.id,
        commission,
        companyAmount,
        contractorAmount,
        totalAmount,
        items,
        responseData: data,
        dealId: data.SpAccumulationId || null,
      });

      console.log("[PAYMENT SAVED]", payment);

      return res.json({
        success: true,
        paymentUrl: data.PaymentURL,
        orderId,
        status: data.Status,
        paymentId: data.PaymentId,
      });
    } catch (err) {
      console.error("[TINKOFF EXCEPTION]", err);
      return next(ApiError.internal("Ошибка при создании платёжной ссылки"));
    }
  }

  async handleNotification(req, res, next) {
    try {
      const notification = req.body;
      console.log("[NOTIFICATION RECEIVED]", notification);

      // Проверяем подпись
      const receivedToken = notification.Token;
      delete notification.Token;
      const expectedToken = createTinkoffToken(notification, TINKOFF_PASSWORD);

      if (receivedToken !== expectedToken) {
        console.error("[NOTIFICATION] Invalid token!");
        return res.status(400).send("Invalid token");
      }

      // Находим платеж
      const payment = await Payment.findByPk(notification.PaymentId);
      if (!payment) {
        console.error(
          "[NOTIFICATION] Payment not found:",
          notification.PaymentId
        );
        return res.status(404).send("Payment not found");
      }

      // Обновляем статус
      payment.status = notification.Status;

      // Сохраняем DealId (SpAccumulationId) - ОН ОЧЕНЬ ВАЖЕН! (если есть, для будущих splits)
      if (notification.SpAccumulationId) {
        payment.dealId = notification.SpAccumulationId;
      }

      await payment.save();

      console.log(
        "[NOTIFICATION] Payment updated:",
        payment.id,
        payment.status
      );

      // Обрабатываем статусы (только логи для теста)
      switch (notification.Status) {
        case "AUTHORIZED":
          console.log("[NOTIFICATION] Payment authorized (test: no confirm)");
          // await confirmPayment(payment); // Закомментировано для теста
          break;

        case "CONFIRMED":
          console.log("[NOTIFICATION] Payment confirmed (test: no payouts)");
          // await initiatePayouts(payment); // Закомментировано для теста
          break;

        case "REJECTED":
          console.error("[NOTIFICATION] Payment rejected!");
          break;
      }

      return res.send("OK");
    } catch (err) {
      console.error("[NOTIFICATION ERROR]", err);
      return res.status(500).send("Internal error");
    }
  }

  async login(req, res, next) {
    try {
      const { login, password } = req.body;

      if (!login || !password) {
        return next(ApiError.badRequest("Введите логин и пароль"));
      }

      const user = await User.findOne({ where: { login } });
      if (!user) {
        return next(ApiError.badRequest("Пользователь не найден"));
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return next(ApiError.badRequest("Неверный пароль"));
      }

      const token = generateJwt(user.id, user.name, user.login);

      return res.json({ token });
    } catch (err) {
      console.log(err);

      next(ApiError.internal("Ошибка при входе"));
    }
  }

  async auth(req, res, next) {
    try {
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return ApiError.badRequest("Пользователь не авторизован");
      }

      return res.json("Пользователь авторизован");
    } catch (err) {
      next(ApiError.internal("Ошибка при аутентификации"));
    }
  }

  async getAll(req, res, next) {
    try {
      const users = await User.findAll();
      return res.json(users);
    } catch (err) {
      next(ApiError.internal("Ошибка при получении пользователей"));
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const user = await User.findOne({ where: { id } });

      if (!user) {
        return next(ApiError.notFound("Пользователь не найден"));
      }

      return res.json(user);
    } catch (err) {
      next(ApiError.internal("Ошибка при получении пользователя"));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { name, login, password } = req.body;

      const user = await User.findOne({ where: { id } });
      if (!user) {
        return next(ApiError.notFound("Пользователь не найден"));
      }

      user.name = name || user.name;
      user.login = login || user.login;
      user.password = password || user.password;
      await user.save();

      return res.json(user);
    } catch (err) {
      next(ApiError.internal("Ошибка при обновлении пользователя"));
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await User.destroy({ where: { id } });

      if (!deleted) {
        return next(ApiError.notFound("Пользователь не найден"));
      }

      return res.json({ message: "Пользователь удален" });
    } catch (err) {
      next(ApiError.internal("Ошибка при удалении пользователя"));
    }
  }
}

module.exports = new UserController();
