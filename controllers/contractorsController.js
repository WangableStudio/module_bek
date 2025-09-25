const ApiError = require("../error/ApiError");
const { Contractors, User } = require("../models/models");

class ContractorsController {
  async create(req, res, next) {
    try {
      const {
        type,
        name,
        inn,
        email,
        phone,
        name_bank,
        curr_acc,
        bik,
        city,
        corr_acc,
        comment,
      } = req.body;

      if (!type || !name || !inn || !name_bank || !curr_acc || !bik) {
        return next(ApiError.badRequest("Заполните все необходимые поля"));
      }

      const user = await User.findByPk(req?.user?.id);

      console.log(user);

      const contractor = await Contractors.create({
        type,
        name,
        inn,
        email,
        phone,
        name_bank,
        curr_acc,
        bik,
        city,
        corr_acc,
        comment,
      });

      return res.json(contractor);
    } catch (err) {
      console.log(err);

      next(ApiError.internal("Ошибка при создании подрядчика"));
    }
  }

  async getAll(req, res, next) {
    try {
      const contractors = await Contractors.findAll();
      return res.json(contractors);
    } catch (err) {
      next(ApiError.internal("Ошибка при получении подрядчиков"));
    }
  }

  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const contractor = await Contractors.findOne({ where: { id } });
      if (!contractor) {
        return next(ApiError.notFound("Подрядчик не найден"));
      }
      return res.json(contractor);
    } catch (err) {
      next(ApiError.internal("Ошибка при получении подрядчика"));
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const contractor = await Contractors.findOne({ where: { id } });
      if (!contractor) {
        return next(ApiError.notFound("Подрядчик не найден"));
      }

      const {
        type,
        name,
        inn,
        email,
        phone,
        name_bank,
        curr_acc,
        bik,
        city,
        corr_acc,
        comment,
      } = req.body;

      await contractor.update({
        type: type ?? contractor.type,
        name: name ?? contractor.name,
        inn: inn ?? contractor.inn,
        email: email ?? contractor.email,
        phone: phone ?? contractor.phone,
        name_bank: name_bank ?? contractor.name_bank,
        curr_acc: curr_acc ?? contractor.curr_acc,
        bik: bik ?? contractor.bik,
        city: city ?? contractor.city,
        corr_acc: corr_acc ?? contractor.corr_acc,
        comment: comment ?? contractor.comment,
      });

      return res.json(contractor);
    } catch (err) {
      next(ApiError.internal("Ошибка при обновлении подрядчика"));
    }
  }

  // Удаление подрядчика
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await Contractors.destroy({ where: { id } });
      if (!deleted) {
        return next(ApiError.notFound("Подрядчик не найден"));
      }
      return res.json({ message: "Подрядчик удален" });
    } catch (err) {
      next(ApiError.internal("Ошибка при удалении подрядчика"));
    }
  }
}

module.exports = new ContractorsController();
