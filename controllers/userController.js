const ApiError = require("../error/ApiError");
const {
  User,
  Contractors,
  Payment,
  Nomenclature,
} = require("../models/models");
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

  async dashboard(req, res, next) {
    try {
      const payment = await Payment.findAll({ where: { isPaidOut: true } });

      const totalAmount = payment.reduce(
        (acc, item) => acc + Number(item.totalAmount),
        0
      );

      const contractors = await Contractors.findAll();

      const nomenclatures = await Nomenclature.findAll();

      return res.json({
        payments: payment,
        total: totalAmount,
        contractors,
        nomenclatures,
      });
    } catch (err) {
      next(ApiError.internal("Ошибка при получении платежей"));
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
