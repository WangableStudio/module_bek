const axios = require("axios");
const https = require("https");
const fs = require("fs");
const ApiError = require("../error/ApiError");
const {
  Contractors,
  User,
  Members,
  CONTRACTOR_TYPES,
} = require("../models/models");

const httpsAgent = new https.Agent({
  cert: fs.readFileSync(__dirname + "/../ssl/open-api-cert.pem"),
  key: fs.readFileSync(__dirname + "/../ssl/private.key"),
});

const {
  BACKEND_URL,
  NODE_ENV,
  SERVICE_PROVIDER_EMAIL,
  MCC_CODE,
  TINKOFF_REG_LOGIN,
  TINKOFF_REG_PASSWORD,
} = process.env;

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

const TINKOFF_API_REG_URL =
  NODE_ENV === "production"
    ? "https://acqapi.tinkoff.ru"
    : "https://acqapi-test.tinkoff.ru";

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
        comment,

        // Адреса
        legalAddress,
        actualAddress,
        postalAddress,
        zip,
        city,
        country,
        street,

        // Банковские реквизиты
        bankName,
        bankAccount,
        bankBik,
        bankCorrespondentAccount,

        // Руководитель
        ceoFirstName,
        ceoLastName,
        ceoPhone,
        ceoCountry,
        memberId,
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
        "zip",
        "city",
        "country",
        "street",
        "bankName",
        "bankAccount",
        "bankBik",
        "ceoFirstName",
        "ceoLastName",
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
        comment,

        // Адреса
        legalAddress,
        actualAddress,
        postalAddress,
        zip,
        city,
        country: country || "RUS",
        street,

        // Банковские реквизиты
        bankName,
        bankAccount,
        bankBik,
        bankCorrespondentAccount,

        // Руководитель
        ceoFirstName,
        ceoLastName,
        ceoPhone,
        memberId,
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
        inn,
        ogrn,
        kpp,
        okved,
        email,
        phone,
        siteUrl,
        comment,
        billingDescriptor,
        // Адреса
        legalAddress,
        actualAddress,
        postalAddress,
        zip,
        city,
        country,
        street,

        // Банковские реквизиты
        bankName,
        bankAccount,
        bankBik,
        bankCorrespondentAccount,

        // Руководитель
        ceoFirstName,
        ceoLastName,
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
        comment: comment ?? contractor.comment,

        // Адреса
        legalAddress: legalAddress ?? contractor.legalAddress,
        actualAddress: actualAddress ?? contractor.actualAddress,
        postalAddress: postalAddress ?? contractor.postalAddress,
        zip: zip ?? contractor.zip,
        city: city ?? contractor.city,
        country: country ?? contractor.country,
        street: street ?? contractor.street,

        // Банковские реквизиты
        bankName: bankName ?? contractor.bankName,
        bankAccount: bankAccount ?? contractor.bankAccount,
        bankBik: bankBik ?? contractor.bankBik,
        bankCorrespondentAccount:
          bankCorrespondentAccount ?? contractor.bankCorrespondentAccount,

        // Руководитель
        ceoFirstName: ceoFirstName ?? contractor.ceoFirstName,
        ceoLastName: ceoLastName ?? contractor.ceoLastName,
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

  async getTinkoffToken() {
    const TOKEN_URL = `${TINKOFF_API_REG_URL}/oauth/token`;
    console.log(TOKEN_URL);
    const login = TINKOFF_REG_LOGIN;
    const password = TINKOFF_REG_PASSWORD;

    const basicAuth = Buffer.from("partner:partner").toString("base64");

    const body = new URLSearchParams({
      grant_type: "password",
      username: login,
      password: password,
    });

    try {
      const { data } = await axios.post(TOKEN_URL, body, {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        httpsAgent,
      });

      console.log("[TINKOFF TOKEN] ✅ Успешно получен токен");
      return data.access_token;
    } catch (err) {
      console.error("[TINKOFF TOKEN ERROR]", err.response?.data || err.message);
      throw new Error("Ошибка при получении токена Tinkoff");
    }
  }

  // 👥 Регистрация подрядчика с полными данными
  async registerContractor(contractor) {
    try {
      if (!contractor || !contractor.id) {
        throw ApiError.badRequest("Некорректные данные подрядчика");
      }

      console.log("regggg", TINKOFF_API_REG_URL);

      const accessToken = await controller.getTinkoffToken();

      if (!accessToken) {
        throw ApiError.badRequest("Не удалось получить токен");
      }

      const payload = {
        serviceProviderEmail: SERVICE_PROVIDER_EMAIL,
        billingDescriptor: contractor.name,
        fullName: contractor.fullName || contractor.name,
        name: contractor.name,
        inn: contractor.inn,
        kpp: contractor.kpp || "000000000",
        okved: contractor.okved,
        ogrn: parseInt(contractor.ogrn) || 0,
        email: contractor.email,
        siteUrl: BACKEND_URL,
      };

      if (MCC_CODE) {
        payload.mcc = parseInt(MCC_CODE);
      }

      payload.addresses = controller.formatAddresses(contractor);
      payload.ceo = controller.formatCEO(contractor);
      payload.bankAccount = controller.formatBankAccount(contractor);

      controller.cleanPayload(payload);

      // payload.token = createTinkoffToken(payload);

      console.log(
        "[TINKOFF REGISTER PARTNER] 📤 Запрос:",
        JSON.stringify(payload, null, 2)
      );

      const { data } = await axios.post(
        `${TINKOFF_API_REG_URL}/sm-register/register`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          httpsAgent,
        }
      );

      console.log(
        "[TINKOFF REGISTER PARTNER] 📥 Ответ:",
        JSON.stringify(data, null, 2)
      );
      
      if (!data.success) {
        console.error("[TINKOFF PARTNER ERROR]", data);
        throw ApiError.badRequest(
          data.message || "Ошибка регистрации партнёра в Tinkoff"
        );
      }

      await contractor.update({ partnerId: data.partnerId });
      console.log(
        `[TINKOFF PARTNER] ✅ Подрядчик ${contractor.id} успешно зарегистрирован (PartnerId: ${data.partnerId})`
      );

      return {
        success: true,
        partnerId: data.partnerId,
        message: "Партнёр успешно зарегистрирован",
      };
    } catch (err) {
      console.error(err);
      throw ApiError.internal("Ошибка при регистрации подрядчика");
    }
  }

  // 🧾 Ручная регистрация подрядчика
  async registerPartner(req, res, next) {
    try {
      const { contractorId } = req.body;

      if (!contractorId) {
        return next(ApiError.badRequest("ID подрядчика не указан"));
      }

      const contractor = await Contractors.findByPk(contractorId);
      if (!contractor) {
        return next(ApiError.badRequest("Подрядчик не найден"));
      }

      if (
        ![
          CONTRACTOR_TYPES.IP,
          CONTRACTOR_TYPES.OOO,
          CONTRACTOR_TYPES.LEGAL_ENTITY,
        ].includes(contractor.type)
      ) {
        return next(
          ApiError.badRequest("Подрядчик должен быть юрлицом для регистратции")
        );
      }

      const result = await controller.registerContractor(contractor);

      return res.json({
        success: true,
        partnerId: result.partnerId,
        contractor: {
          id: contractor.id,
          name: contractor.name,
        },
      });
    } catch (err) {
      console.error("[PARTNER REGISTER ERROR]", err);
      return next(ApiError.internal("Ошибка при регистрации подрядчика"));
    }
  }
  async getBankName(req, res, next) {
    try {
      const members = await Members.findAll();

      return res.json(members);
    } catch (err) {
      console.error(err);
      return next(ApiError.badRequest("Ошибка при получении банков"));
    }
  }

  // 🏠 Форматирование адресов
  formatAddresses(contractor) {
    const addresses = [];

    // Юридический адрес
    if (contractor.legalAddress) {
      addresses.push({
        type: "legal",
        zip: contractor.zip || "000000",
        country: contractor.country || "RUS",
        city: contractor.city || "Москва",
        street: contractor.legalAddress,
        description: "Юридический адрес",
      });
    }

    // Фактический адрес
    if (contractor.actualAddress) {
      addresses.push({
        type: "actual",
        zip: contractor.zip || "000000",
        country: contractor.country || "RUS",
        city: contractor.city || "Москва",
        street: contractor.actualAddress,
        description: "Фактический адрес",
      });
    }

    // Почтовый адрес
    if (contractor.postalAddress) {
      addresses.push({
        type: "postal",
        zip: contractor.zip || "000000",
        country: contractor.country || "RUS",
        city: contractor.city || "Москва",
        street: contractor.postalAddress,
        description: "Почтовый адрес",
      });
    }

    return addresses.length > 0
      ? addresses
      : [
          {
            type: "legal",
            zip: contractor.zip || "000000",
            country: contractor.country || "RUS",
            city: contractor.city || "Москва",
            street: contractor.legalAddress || "не указан",
            description: "Адрес",
          },
        ];
  }

  // 📞 Форматирование телефонов
  formatPhones(contractor) {
    const phones = [];

    if (contractor.phone) {
      phones.push({
        type: "common",
        phone: contractor.phone.replace(/[^\d+]/g, ""),
        description: "Основной телефон",
      });
    }

    return phones;
  }

  // 👨‍💼 Форматирование данных руководителя
  formatCEO(contractor) {
    if (!contractor.ceoFirstName || !contractor.ceoLastName) {
      return null;
    }

    return {
      firstName: contractor.ceoFirstName,
      lastName: contractor.ceoLastName,
      middleName: contractor.ceoMiddleName,
      birthDate: contractor.ceoBirthDate,
      birthPlace: contractor.ceoBirthPlace,
      docType: contractor.ceoDocType,
      docNumber: contractor.ceoDocNumber,
      issueDate: contractor.ceoIssueDate,
      issuedBy: contractor.ceoIssuedBy,
      address: contractor.ceoAddress,
      phone: contractor.ceoPhone,
      country: contractor.ceoCountry || "RUS",
    };
  }

  // 🏦 Форматирование банковских реквизитов
  formatBankAccount(contractor) {
    const bankAccount = {
      account: contractor.bankAccount,
      bankName: contractor.bankName,
      bik: contractor.bankBik,
      details: "Перевод средств по договору",
    };

    // Добавляем корреспондентский счет если есть
    if (contractor.bankCorrespondentAccount) {
      bankAccount.korAccount = contractor.bankCorrespondentAccount;
    }

    // КБК и ОКТМО должны быть указаны вместе
    if (contractor.bankKbk && contractor.bankOktmo) {
      bankAccount.kbk = contractor.bankKbk;
      bankAccount.oktmo = contractor.bankOktmo;
    }

    return bankAccount;
  }

  // 👥 Форматирование учредителей (для юрлиц)
  formatFounders(contractor) {
    // В реальном приложении здесь должна быть логика получения данных об учредителях
    // Возвращаем пустой объект, так как у нас нет этих данных в модели
    return {
      individuals: [],
    };
  }

  // 🧹 Очистка payload от пустых полей
  cleanPayload(payload) {
    const cleanObject = (obj) => {
      Object.keys(obj).forEach((key) => {
        if (obj[key] === null || obj[key] === undefined || obj[key] === "") {
          delete obj[key];
        } else if (typeof obj[key] === "object") {
          cleanObject(obj[key]);
          if (Object.keys(obj[key]).length === 0) {
            delete obj[key];
          }
        }
      });
    };

    cleanObject(payload);
  }
}

module.exports = new ContractorsController();
const controller = module.exports;
