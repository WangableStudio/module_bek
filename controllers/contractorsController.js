const ApiError = require("../error/ApiError");
const { Contractors, User, Members } = require("../models/models");

function validateINN(inn) {
  if (!inn) return false;
  const innStr = inn.toString().trim();
  if (innStr.length === 10 || innStr.length === 12) {
    return /^\d+$/.test(innStr);
  }
  return false;
}

function validateBankDetails(accountNumber, bik) {
  return accountNumber && accountNumber.length >= 20 && bik && bik.length === 9;
}
class ContractorsController {
  async create(req, res, next) {
    try {
      const {
        // Основные данные
        type,
        name,
        fullName,
        billingDescriptor,
        inn,
        ogrn,
        kpp,
        okved,
        email,
        phone,
        siteUrl,
        regDepartment,
        regDate,
        assets,
        primaryActivities,
        comment,

        // Адреса
        legalAddress,
        actualAddress,
        postalAddress,
        zip,
        city,
        country,

        // Банковские реквизиты
        bankName,
        bankAccount,
        bankBik,
        bankCorrespondentAccount,
        bankKbk,
        bankOktmo,

        // Руководитель
        ceoFirstName,
        ceoLastName,
        ceoMiddleName,
        ceoBirthDate,
        ceoBirthPlace,
        ceoDocType,
        ceoDocNumber,
        ceoIssueDate,
        ceoIssuedBy,
        ceoAddress,
        ceoPhone,
        ceoCountry,
      } = req.body;

      // Проверка обязательных полей
      const requiredFields = [
        "type",
        "name",
        "fullName",
        "billingDescriptor",
        "inn",
        "ogrn",
        "email",
        "phone",
        "siteUrl",
        "legalAddress",
        "zip",
        "city",
        "country",
        "bankName",
        "bankAccount",
        "bankBik",
        "ceoFirstName",
        "ceoLastName",
        "ceoAddress",
        "ceoPhone",
        "ceoCountry",
      ];

      const missingFields = requiredFields.filter((field) => !req.body[field]);
      if (missingFields.length > 0) {
        return next(
          ApiError.badRequest(
            `Заполните обязательные поля: ${missingFields.join(", ")}`
          )
        );
      }

      // Валидация ИНН
      if (!validateINN(inn)) {
        return next(ApiError.badRequest("Некорректный ИНН"));
      }

      // Валидация банковских реквизитов
      if (!validateBankDetails(bankAccount, bankBik)) {
        return next(ApiError.badRequest("Некорректные банковские реквизиты"));
      }

      const user = await User.findByPk(req?.user?.id);
      console.log(user);

      // Создаем подрядчика со всеми полями
      const contractor = await Contractors.create({
        // Основные данные
        type,
        name,
        fullName,
        billingDescriptor,
        inn,
        ogrn,
        kpp: kpp || "000000000",
        okved,
        email,
        phone,
        siteUrl,
        regDepartment,
        regDate,
        assets,
        primaryActivities,
        comment,

        // Адреса
        legalAddress,
        actualAddress,
        postalAddress,
        zip,
        city,
        country: country || "RUS",

        // Банковские реквизиты
        bankName,
        bankAccount,
        bankBik,
        bankCorrespondentAccount,
        bankKbk,
        bankOktmo,

        // Руководитель
        ceoFirstName,
        ceoLastName,
        ceoMiddleName,
        ceoBirthDate,
        ceoBirthPlace,
        ceoDocType,
        ceoDocNumber,
        ceoIssueDate,
        ceoIssuedBy,
        ceoAddress,
        ceoPhone,
        ceoCountry: ceoCountry || "RUS",
      });

      return res.json(contractor);
    } catch (err) {
      console.log(err);
      next(ApiError.internal("Ошибка при создании подрядчика"));
    }
  }

  async getAll(req, res, next) {
    try {
      const contractors = await Contractors.findAll({
        attributes: [
          "id",
          "type",
          "name",
          "fullName",
          "inn",
          "ogrn",
          "kpp",
          "email",
          "phone",
          "bankName",
          "bankAccount",
          "partnerId",
          "createdAt",
          "updatedAt",
        ],
      });
      return res.json(contractors);
    } catch (err) {
      console.log(err);
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
      console.log(err);
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
        // Основные данные
        type,
        name,
        fullName,
        billingDescriptor,
        inn,
        ogrn,
        kpp,
        okved,
        email,
        phone,
        siteUrl,
        regDepartment,
        regDate,
        assets,
        primaryActivities,
        comment,

        // Адреса
        legalAddress,
        actualAddress,
        postalAddress,
        zip,
        city,
        country,

        // Банковские реквизиты
        bankName,
        bankAccount,
        bankBik,
        bankCorrespondentAccount,
        bankKbk,
        bankOktmo,

        // Руководитель
        ceoFirstName,
        ceoLastName,
        ceoMiddleName,
        ceoBirthDate,
        ceoBirthPlace,
        ceoDocType,
        ceoDocNumber,
        ceoIssueDate,
        ceoIssuedBy,
        ceoAddress,
        ceoPhone,
        ceoCountry,
      } = req.body;

      // Валидация ИНН если передан
      if (inn && !validateINN(inn)) {
        return next(ApiError.badRequest("Некорректный ИНН"));
      }

      // Валидация банковских реквизитов если переданы
      if (
        (bankAccount || bankBik) &&
        !validateBankDetails(
          bankAccount || contractor.bankAccount,
          bankBik || contractor.bankBik
        )
      ) {
        return next(ApiError.badRequest("Некорректные банковские реквизиты"));
      }

      // Обновляем все поля
      await contractor.update({
        // Основные данные
        type: type ?? contractor.type,
        name: name ?? contractor.name,
        fullName: fullName ?? contractor.fullName,
        billingDescriptor: billingDescriptor ?? contractor.billingDescriptor,
        inn: inn ?? contractor.inn,
        ogrn: ogrn ?? contractor.ogrn,
        kpp: kpp ?? contractor.kpp,
        okved: okved ?? contractor.okved,
        email: email ?? contractor.email,
        phone: phone ?? contractor.phone,
        siteUrl: siteUrl ?? contractor.siteUrl,
        regDepartment: regDepartment ?? contractor.regDepartment,
        regDate: regDate ?? contractor.regDate,
        assets: assets ?? contractor.assets,
        primaryActivities: primaryActivities ?? contractor.primaryActivities,
        comment: comment ?? contractor.comment,

        // Адреса
        legalAddress: legalAddress ?? contractor.legalAddress,
        actualAddress: actualAddress ?? contractor.actualAddress,
        postalAddress: postalAddress ?? contractor.postalAddress,
        zip: zip ?? contractor.zip,
        city: city ?? contractor.city,
        country: country ?? contractor.country,

        // Банковские реквизиты
        bankName: bankName ?? contractor.bankName,
        bankAccount: bankAccount ?? contractor.bankAccount,
        bankBik: bankBik ?? contractor.bankBik,
        bankCorrespondentAccount:
          bankCorrespondentAccount ?? contractor.bankCorrespondentAccount,
        bankKbk: bankKbk ?? contractor.bankKbk,
        bankOktmo: bankOktmo ?? contractor.bankOktmo,

        // Руководитель
        ceoFirstName: ceoFirstName ?? contractor.ceoFirstName,
        ceoLastName: ceoLastName ?? contractor.ceoLastName,
        ceoMiddleName: ceoMiddleName ?? contractor.ceoMiddleName,
        ceoBirthDate: ceoBirthDate ?? contractor.ceoBirthDate,
        ceoBirthPlace: ceoBirthPlace ?? contractor.ceoBirthPlace,
        ceoDocType: ceoDocType ?? contractor.ceoDocType,
        ceoDocNumber: ceoDocNumber ?? contractor.ceoDocNumber,
        ceoIssueDate: ceoIssueDate ?? contractor.ceoIssueDate,
        ceoIssuedBy: ceoIssuedBy ?? contractor.ceoIssuedBy,
        ceoAddress: ceoAddress ?? contractor.ceoAddress,
        ceoPhone: ceoPhone ?? contractor.ceoPhone,
        ceoCountry: ceoCountry ?? contractor.ceoCountry,
      });

      // Перезагружаем обновленные данные
      await contractor.reload();

      return res.json(contractor);
    } catch (err) {
      console.log(err);
      next(ApiError.internal("Ошибка при обновлении подрядчика"));
    }
  }

  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const deleted = await Contractors.destroy({ where: { id } });
      if (!deleted) {
        return next(ApiError.notFound("Подрядчик не найден"));
      }
      return res.json({ message: "Подрядчик удален" });
    } catch (err) {
      console.log(err);
      next(ApiError.internal("Ошибка при удалении подрядчика"));
    }
  }

  // Вспомогательные методы
}

module.exports = new ContractorsController();
