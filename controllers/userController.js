const ApiError = require("../error/ApiError");
const { User } = require("../models/models");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const axios = require("axios");
const TINKOFF_TERMINAL_KEY = "1759332525322";
const TINKOFF_PASSWORD = "gP3PIYw*xe5L#$9G";

const generateJwt = (id, name, login) => {
  const payload = { id, name, login };
  return jwt.sign(payload, process.env.SECRET_KEY, { expiresIn: "24h" });
};

function generateTinkoffToken(params, password) {
  const filtered = Object.entries(params)
    .filter(
      ([key, val]) => key !== "Token" && val !== undefined && val !== null
    )
    .reduce((acc, [key, val]) => {
      if (typeof val === "object" && !Array.isArray(val)) {
        Object.entries(val).forEach(([subKey, subVal]) => {
          acc[subKey] = subVal;
        });
      } else acc[key] = val;
      return acc;
    }, {});

  const sorted = Object.keys(filtered).sort();
  const concatenated = sorted.map((k) => filtered[k]).join("") + password;

  return crypto.createHash("sha256").update(concatenated).digest("hex");
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
      const orderId = `order-${Date.now()}`;
      const amountInKopecks = totalAmount * 100;
      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY,
        Amount: amountInKopecks,
        OrderId: orderId,
        Description: `Оплата услуг: ${contractor.name}`,
        CreateDealWithType: "NN",
        DATA: {
          companyAmount,
          contractorAmount,
          commission,
        },
      };
      const token = generateTinkoffToken(payload, TINKOFF_PASSWORD);
      payload.Token = token;
      const { data } = await axios.post(
        "https://rest-api-test.tinkoff.ru/v2/Init",
        payload
      );
      console.log('====================');
      console.log(data);
      console.log('====================');
      
      if (data.Success) {
        return res.json({
          success: true,
          paymentUrl: data.PaymentURL,
          dealId: data.Deal?.DealId || null,
          orderId,
        });
      } else {
        console.error("Ошибка от Tinkoff:", data);
        return res.status(400).json({ success: false, data });
      }
    } catch (err) {
      console.log(err);
      next(ApiError.internal("Ошибка при создании ссылки"));
    }
  }

  async login(req, res, next) {
    try {
      const { login, password } = req.body;
      console.log(login, password);

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
