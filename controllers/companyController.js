const ApiError = require("../error/ApiError");
const { Company } = require("../models/models");

class CompanyController {
  async create(req, res, next) {
    try {
      const {
        company_name,
        inn,
        kpp,
        ogrn,
        legal_address,
        actual_address,
        bank_name,
        account_number,
        bik,
        correspondent_account,
        phone,
        email,
        website,
        director,
      } = req.body;

      if (!company_name || !inn || !legal_address || !bank_name || !account_number || !bik || !phone || !email) {
        return next(ApiError.badRequest("Заполните все обязательные поля"));
      }

      const company = await Company.create({
        company_name,
        inn,
        kpp,
        ogrn,
        legal_address,
        actual_address,
        bank_name,
        account_number,
        bik,
        correspondent_account,
        phone,
        email,
        website,
        director,
      });

      return res.json(company);
    } catch (err) {
      console.error(err);
      next(ApiError.internal("Ошибка при создании компании"));
    }
  }

  async getAll(req, res, next) {
    try {
      const companies = await Company.findAll();
      return res.json(companies);
    } catch (err) {
      next(ApiError.internal("Ошибка при получении компаний"));
    }
  }


  async getOne(req, res, next) {
    try {
      const { id } = req.params;
      const company = await Company.findOne({ where: { id } });

      if (!company) {
        return next(ApiError.notFound("Компания не найдена"));
      }

      return res.json(company);
    } catch (err) {
      next(ApiError.internal("Ошибка при получении компании"));
    }
  }


  async update(req, res, next) {
    try {
      const { id } = req.params;
      const company = await Company.findOne({ where: { id } });

      if (!company) {
        return next(ApiError.notFound("Компания не найдена"));
      }

      const {
        company_name,
        inn,
        kpp,
        ogrn,
        legal_address,
        actual_address,
        bank_name,
        account_number,
        bik,
        correspondent_account,
        phone,
        email,
        website,
        director,
      } = req.body;

      await company.update({
        company_name: company_name ?? company.name,
        inn: inn ?? company.inn,
        kpp: kpp ?? company.kpp,
        ogrn: ogrn ?? company.ogrn,
        legal_address: legal_address ?? company.legal_address,
        actual_address: actual_address ?? company.actual_address,
        bank_name: bank_name ?? company.bank_name,
        account_number: account_number ?? company.account_number,
        bik: bik ?? company.bik,
        correspondent_account: correspondent_account ?? company.correspondent_account,
        phone: phone ?? company.phone,
        email: email ?? company.email,
        website: website ?? company.website,
        director: director ?? company.director,
      });

      return res.json(company);
    } catch (err) {
      next(ApiError.internal("Ошибка при обновлении компании"));
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await Company.destroy({ where: { id } });

      if (!deleted) {
        return next(ApiError.notFound("Компания не найдена"));
      }

      return res.json({ message: "Компания удалена" });
    } catch (err) {
      next(ApiError.internal("Ошибка при удалении компании"));
    }
  }
}

module.exports = new CompanyController();
