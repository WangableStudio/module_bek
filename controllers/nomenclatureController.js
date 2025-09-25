const ApiError = require("../error/ApiError");
const { Nomenclature, User } = require("../models/models");

class NomenclatureController {
  async create(req, res, next) {
    try {
      const { name, price, description } = req.body;

      if (!name || !price) {
        return next(ApiError.badRequest("Заполните все обязательные поля"));
      }

      const user = await User.findByPk(req?.user?.id);
      if (!user) {
        return next(
          ApiError.unauthorized("Пользователь не найден или не авторизован")
        );
      }

      const nomenclature = await Nomenclature.create({
        name,
        price,
        description,
      });

      return res.json(nomenclature);
    } catch (err) {
      console.log(err);
      next(ApiError.internal("Ошибка при создании номенклатуры"));
    }
  }

  async getAll(req, res, next) {
    try {
      const nomenclatures = await Nomenclature.findAll();
      return res.json(nomenclatures);
    } catch (err) {
      next(ApiError.internal("Ошибка при получении номенклатуры"));
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const nomenclature = await Nomenclature.findOne({ where: { id } });
      if (!nomenclature) {
        return next(ApiError.notFound("Номенклатура не найдена"));
      }
      return res.json(nomenclature);
    } catch (err) {
      next(ApiError.internal("Ошибка при получении номенклатуры"));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const nomenclature = await Nomenclature.findOne({ where: { id } });
      if (!nomenclature) {
        return next(ApiError.notFound("Номенклатура не найдена"));
      }

      const { name, price, description } = req.body;

      await nomenclature.update({
        name: name ?? nomenclature.name,
        price: price ?? nomenclature.price,
        description: description ?? nomenclature.description,
      });

      return res.json(nomenclature);
    } catch (err) {
      next(ApiError.internal("Ошибка при обновлении номенклатуры"));
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await Nomenclature.destroy({ where: { id } });
      if (!deleted) {
        return next(ApiError.notFound("Номенклатура не найдена"));
      }
      return res.json({ message: "Номенклатура удалена" });
    } catch (err) {
      next(ApiError.internal("Ошибка при удалении номенклатуры"));
    }
  }
}

module.exports = new NomenclatureController();
