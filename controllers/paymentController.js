const crypto = require("crypto");
const axios = require("axios");
const {
  Payment,
  Contractors,
  Payout,
  CONTRACTOR_TYPES,
  Members,
} = require("../models/models");
const ApiError = require("../error/ApiError");

const {
  TINKOFF_TERMINAL_KEY,
  TINKOFF_TERMINAL_KEY_E2C,
  BACKEND_URL,
  COMPANY_PARTNER_ID,
  NODE_ENV,
  SERVICE_PROVIDER_EMAIL,
  MCC_CODE,
} = process.env;
const TINKOFF_PASSWORD = "gP3PIYw*xe5L#$9G";

const TINKOFF_API_URL =
  NODE_ENV === "production"
    ? "https://securepay.tinkoff.ru"
    : "https://rest-api-test.tinkoff.ru";

function createTinkoffToken(payload, password = TINKOFF_PASSWORD) {
  const filtered = {};
  for (const key in payload) {
    if (
      typeof payload[key] !== "object" &&
      payload[key] !== undefined &&
      payload[key] !== null
    ) {
      filtered[key] = payload[key];
    }
  }

  filtered.Password = password;
  const sortedKeys = Object.keys(filtered).sort();
  const concatenated = sortedKeys.map((k) => String(filtered[k])).join("");
  return crypto.createHash("sha256").update(concatenated, "utf8").digest("hex");
}
class PaymentController {
  // 🧩 Создание платёжной ссылки
  async init(req, res, next) {
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

      // Для СБП регистрируем подрядчика только если нужно (не требуется для физлиц)
      //   if (
      //     !contractorRecord.partnerId &&
      //     contractorRecord.type !== CONTRACTOR_TYPES.INDIVIDUAL
      //   ) {
      //     await this.registerContractor(contractorRecord);
      //     await contractorRecord.reload();
      //   }

      const cleanedPhone = contractorRecord.phone.replace(/[^\d+]/g, "");
      const orderId = `order-${Date.now()}`;
      const amountInKopecks = Math.round(totalAmount * 100);

      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY,
        Amount: amountInKopecks,
        OrderId: orderId,
        Description: `Оплата услуг: ${contractorRecord.name}${
          contractorRecord.inn ? ` (ИНН ${contractorRecord.inn})` : ""
        }`,
        CreateDealWithType: "NN",
        PaymentRecipientId: cleanedPhone,
        NotificationURL: `${BACKEND_URL}/api/v1/payment/notification`,
        DATA: {
          Phone: cleanedPhone,
          Email: contractorRecord.email || "",
        },
      };

      payload.Token = createTinkoffToken(payload);

      console.log("[TINKOFF INIT] Request:", JSON.stringify(payload, null, 2));

      const response = await axios.post(`${TINKOFF_API_URL}/v2/Init`, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });

      const data = response.data;
      console.log("[TINKOFF INIT] Response:", JSON.stringify(data, null, 2));

      if (!data.Success) {
        console.error("[TINKOFF INIT ERROR]", data);
        return next(
          ApiError.badRequest(data.Message || "Ошибка при создании платежа")
        );
      }

      await Payment.create({
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
        isConfirmed: false,
        isPaidOut: false,
      });

      return res.json({
        success: true,
        paymentUrl: data.PaymentURL,
        orderId,
        status: data.Status,
        paymentId: data.PaymentId,
        dealId: data.SpAccumulationId,
      });
    } catch (err) {
      console.error("[TINKOFF INIT ERROR]", err.response?.data || err.message);
      return next(ApiError.internal("Ошибка при создании платёжной ссылки"));
    }
  }

  // 👥 Регистрация подрядчика с полными данными
  async registerContractor(contractor) {
    try {
      if (!contractor || !contractor.id) {
        throw ApiError.badRequest("Некорректные данные подрядчика");
      }

      const payload = {
        terminalKey: TINKOFF_TERMINAL_KEY,
        serviceProviderEmail: SERVICE_PROVIDER_EMAIL,
        shopArticleId: `contractor_${contractor.id}`,
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

      payload.token = createTinkoffToken(payload);

      console.log(
        "[TINKOFF REGISTER PARTNER] 📤 Запрос:",
        JSON.stringify(payload, null, 2)
      );

      const { data } = await axios.post(
        "https://acqapi-test.tinkoff.ru/sm-register/register",
        payload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
          validateStatus: (status) => status < 500, // не кидает 4xx
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
      console.error(
        "[TINKOFF PARTNER EXCEPTION] 🚨",
        err.response?.data || err.message
      );
      throw ApiError.internal("Ошибка при регистрации подрядчика");
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

  // 🔔 Обработчик вебхуков (без изменений)
  async notification(req, res, next) {
    try {
      const notification = { ...req.body };
      console.log(
        "[TINKOFF WEBHOOK] Получено уведомление:",
        JSON.stringify(notification, null, 2)
      );

      const receivedToken = notification.Token;
      delete notification.Token;
      const expectedToken = createTinkoffToken(notification);
      if (receivedToken !== expectedToken) {
        console.error("[TINKOFF WEBHOOK] Неверный токен");
        return res.status(400).send("ERROR: Invalid token");
      }

      const { PaymentId, Status, SpAccumulationId, Success } = notification;
      if (!Success) {
        console.warn(
          `[TINKOFF WEBHOOK] Игнорирую уведомление с Success=false для ${PaymentId}`
        );
        return res.send("OK");
      }

      const payment = await Payment.findByPk(PaymentId);
      if (!payment) {
        console.error("[TINKOFF WEBHOOK] Платёж не найден:", PaymentId);
        return res.status(404).send("ERROR: Payment not found");
      }

      const statusPriority = {
        NEW: 0,
        AUTHORIZED: 1,
        CONFIRMED: 2,
        REJECTED: 3,
        REFUNDED: 4,
        CANCELED: 5,
        PAYOUTS_COMPLETED: 6,
      };

      if (
        payment.responseData?.notifications?.some(
          (n) => n.Status === Status && n.PaymentId === PaymentId
        )
      ) {
        console.log(
          `[TINKOFF WEBHOOK] Дубликат уведомления ${Status} для ${PaymentId} — игнорирую`
        );
        return res.send("OK");
      }

      // защита от отката статуса
      const currentStatus = payment.status || "NEW";
      const newStatus = Status;
      if (statusPriority[newStatus] < statusPriority[currentStatus]) {
        console.log(
          `[TINKOFF WEBHOOK] Обнаружен возможный откат ${currentStatus} → ${newStatus} для ${PaymentId}. Проверяю через GetState...`
        );
        const stateData = await controller.getState(PaymentId);
        console.log(stateData);
        console.log("=================");
        const verifiedStatus = stateData?.status;
        if (verifiedStatus) {
          console.log(
            `[CHECK STATE] Tinkoff вернул статус ${verifiedStatus} для ${PaymentId}`
          );
          if (statusPriority[verifiedStatus] >= statusPriority[currentStatus]) {
            await payment.update({
              status: verifiedStatus,
              dealId: SpAccumulationId || payment.dealId,
              responseData: {
                ...payment.responseData,
                verifiedState: verifiedStatus,
                notifications: [
                  ...(payment.responseData?.notifications || []),
                  notification,
                ],
              },
            });
          } else {
            console.log(
              `[TINKOFF WEBHOOK] Откат подтверждён локально — игнорирую изменение статуса для ${PaymentId}`
            );
          }
        } else {
          console.warn(
            `[TINKOFF WEBHOOK] Не удалось проверить статус через GetState для ${PaymentId} — игнорирую откат`
          );
        }
        return res.send("OK");
      }

      // обычное обновление
      await payment.update({
        status: newStatus,
        dealId: SpAccumulationId || payment.dealId,
        responseData: {
          ...payment.responseData,
          notifications: [
            ...(payment.responseData?.notifications || []),
            notification,
          ],
        },
        isConfirmed: payment.isConfirmed || newStatus === "CONFIRMED",
      });

      console.log(
        `[TINKOFF WEBHOOK] Платёж ${PaymentId} обновлён до статуса: ${newStatus}`
      );

      if (newStatus === "AUTHORIZED") {
        try {
          await controller.confirmPayment(PaymentId);
        } catch (err) {
          console.error("[TINKOFF CONFIRM] Ошибка в confirmPayment:", err);
        }
      } else if (newStatus === "CONFIRMED") {
        try {
          await controller.executePayouts(PaymentId);
        } catch (err) {
          console.error("[TINKOFF PAYOUTS] Ошибка в executePayouts:", err);
        }
      }

      return res.send("OK");
    } catch (err) {
      console.error("[TINKOFF WEBHOOK ERROR]", err);
      return res.status(500).send("ERROR");
    }
  }

  // ✅ Подтверждение платежа
  async confirmPayment(paymentId) {
    try {
      const payment = await Payment.findByPk(paymentId);
      if (!payment) throw ApiError.badRequest(`Платеж ${paymentId} не найден`);

      if (payment.isConfirmed) {
        console.log(`[TINKOFF CONFIRM] 💡 Платеж ${paymentId} уже подтвержден`);
        return { success: true, alreadyConfirmed: true };
      }

      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY,
        PaymentId: paymentId,
        Amount: Math.round(payment.totalAmount * 100),
      };
      payload.Token = createTinkoffToken(payload);

      const { data } = await axios.post(
        `${TINKOFF_API_URL}/v2/Confirm`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        }
      );

      if (!data.Success) {
        console.error("[TINKOFF CONFIRM ERROR] ❌", data);
        throw ApiError.badRequest(
          data.Message || "Ошибка при подтверждении платежа"
        );
      }

      await payment.update({
        status: "CONFIRMED",
        isConfirmed: true,
        responseData: { ...payment.responseData, confirm: data },
      });

      console.log(
        `[TINKOFF CONFIRM] ✅ Платеж ${paymentId} успешно подтвержден`
      );

      // Выплаты
      try {
        await controller.executePayouts(paymentId);
      } catch (payoutErr) {
        console.error(
          `[TINKOFF PAYOUT ERROR] Ошибка при выплате:`,
          payoutErr.message
        );
      }

      return { success: true, status: data.Status };
    } catch (err) {
      console.error(
        "[TINKOFF CONFIRM ERROR] 🚨",
        err.response?.data || err.message
      );
      throw ApiError.internal("Ошибка при подтверждении платежа");
    }
  }

  // ✅ Выполнение выплат
  async executePayouts(paymentId) {
    try {
      const payment = await Payment.findByPk(paymentId, {
        include: {
          model: Contractors,
          as: "contractor",
        },
      });

      if (!payment) {
        throw ApiError.badRequest(`Платеж с ID ${paymentId} не найден`);
      }

      if (payment.isPaidOut) {
        console.log(`[TINKOFF PAYOUTS] 💡 Платеж ${paymentId} уже выплачен`);
        return { success: true, alreadyPaidOut: true };
      }

      if (!payment.dealId) {
        throw ApiError.badRequest(
          `DealId отсутствует для платежа ${paymentId}`
        );
      }

      const contractor = payment.contractor;
      if (!contractor) {
        throw ApiError.badRequest(
          `Подрядчик не найден для платежа ${paymentId}`
        );
      }

      const partnerId = contractor.partnerId;

      if (
        !partnerId &&
        [
          CONTRACTOR_TYPES.IP,
          CONTRACTOR_TYPES.OOO,
          CONTRACTOR_TYPES.LEGAL_ENTITY,
        ].includes(contractor.type)
      ) {
        throw ApiError.badRequest(
          `PartnerId отсутствует для подрядчика ${contractor.id} (${contractor.type})`
        );
      }

      const results = { contractor: null, company: null };

      // Выплата подрядчику
      if (payment.contractorAmount > 0) {
        try {
          const payoutPayload = {
            paymentId: payment.id,
            dealId: payment.dealId,
            amount: payment.contractorAmount,
            type: "contractor",
            finalPayout: true,
          };

          if (contractor.type !== CONTRACTOR_TYPES.INDIVIDUAL) {
            payoutPayload.partnerId = contractor.partnerId;
          }

          if (
            ![
              CONTRACTOR_TYPES.IP,
              CONTRACTOR_TYPES.OOO,
              CONTRACTOR_TYPES.LEGAL_ENTITY,
            ].includes(contractor.type)
          ) {
            payoutPayload.memberId = "100000000012";
            payoutPayload.phone = "79066589133";
            // payoutPayload.memberId = contractor.memberId || "100000000012";
            // payoutPayload.phone =
            //   contractor.phone?.replace(/\D/g, "") || "79066589133";
          }

          results.contractor = await controller.sendPayout(payoutPayload);
          console.log(
            `[TINKOFF PAYOUT] ✅ Выплата подрядчику завершена (paymentId: ${paymentId})`
          );
        } catch (err) {
          console.error(
            `[TINKOFF PAYOUT ERROR] ❌ Ошибка выплаты подрядчику:`,
            err.message
          );
          throw ApiError.internal("Ошибка при выплате подрядчику");
        }
      }

      // // Выплата компании
      // if (payment.companyAmount > 0) {
      //   try {
      //     results.company = await this.sendPayout({
      //       paymentId: payment.id,
      //       dealId: payment.dealId,
      //       partnerId: COMPANY_PARTNER_ID,
      //       amount: payment.companyAmount,
      //       type: "company",
      //       finalPayout: true,
      //     });
      //     console.log(
      //       `[TINKOFF PAYOUT] ✅ Выплата компании завершена (paymentId: ${paymentId})`
      //     );
      //   } catch (err) {
      //     console.error(
      //       `[TINKOFF PAYOUT ERROR] ❌ Ошибка выплаты компании:`,
      //       err.message
      //     );
      //     throw ApiError.internal("Ошибка при выплате компании");
      //   }
      // }

      await payment.update({
        isPaidOut: true,
      });

      console.log(
        `[TINKOFF PAYOUTS] 🎉 Все выплаты завершены для платежа ${paymentId}`
      );

      return { success: true, results };
    } catch (err) {
      console.log(err);
      console.log("===================");

      console.error(
        `[TINKOFF PAYOUTS ERROR] 🚨`,
        err.response?.data || err.message
      );
      throw ApiError.internal("Внутренняя ошибка при выполнении выплат");
    }
  }

  // ✅ Отправка выплаты
  async sendPayout({
    paymentId,
    dealId,
    partnerId,
    amount,
    type,
    phone,
    memberId,
    finalPayout = false,
  }) {
    try {
      if (!dealId || !amount) {
        throw ApiError.badRequest(
          "Отсутствуют обязательные параметры для выплаты"
        );
      }

      const amountInKopecks = Math.round(amount * 100);
      const orderId = `payout-${Date.now()}-${type || "unknown"}`;

      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY_E2C,
        DealId: dealId,
        Amount: amountInKopecks,
        OrderId: orderId,
        PaymentRecipientId: "",
      };

      if (partnerId) payload.PartnerId = partnerId;
      if (phone) {
        payload.Phone = phone;
        payload.PaymentRecipientId = phone;
      }
      if (memberId) payload.SbpMemberId = memberId;

      if (finalPayout) payload.FinalPayout = true;
      payload.Token = createTinkoffToken(payload);

      console.log("[TINKOFF PAYOUT] 📤 Запрос:", payload);

      const { data } = await axios.post(
        `${TINKOFF_API_URL}/e2c/v2/Init`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      console.log("[TINKOFF PAYOUT] 📥 Ответ:", data);

      if (!data.Success) {
        console.error("[TINKOFF PAYOUT ERROR] ❌", data);
        throw ApiError.badRequest(
          data.Message || "Ошибка при выполнении выплаты"
        );
      }

      await Payout.create({
        id: data.PaymentId,
        partnerId,
        PaymentId: paymentId,
        amount: amount / 100,
        status: data.Status,
        type,
        responseData: data,
      });

      console.log(
        `[TINKOFF PAYOUT] ✅ Выплата успешно создана (paymentId: ${paymentId}, type: ${type})`
      );

      return {
        success: true,
        payoutId: data.PaymentId || data.PayoutId,
        status: data.Status,
        amount: amountInKopecks / 100,
        finalPayout,
      };
    } catch (err) {
      console.error(
        "[TINKOFF PAYOUT ERROR] 🚨",
        err.response?.data || err.message
      );
      throw ApiError.internal("Внутренняя ошибка при отправке выплаты");
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

  // 📊 Ручное подтверждение платежа
  async confirm(req, res, next) {
    try {
      const { paymentId } = req.body;
      console.log(paymentId);

      if (!paymentId) {
        return next(ApiError.badRequest("ID платежа не указан"));
      }

      await controller.confirmPayment(paymentId);

      return res.json({
        success: true,
        message: "Платеж подтвержден",
      });
    } catch (err) {
      console.error("[CONFIRM ERROR]", err);
      return next(ApiError.internal("Ошибка при подтверждении платежа"));
    }
  }

  // 💸 Ручной запуск выплат
  async payout(req, res, next) {
    try {
      const { paymentId } = req.body;

      if (!paymentId) {
        return next(ApiError.badRequest("ID платежа не указан"));
      }

      await controller.executePayouts(paymentId);

      return res.json({
        success: true,
        message: "Выплаты запущены",
      });
    } catch (err) {
      console.error("[PAYOUT ERROR]", err);
      return next(ApiError.internal("Ошибка при выполнении выплат"));
    }
  }

  // 📋 Получение статуса платежа
  async getState(req, res, next) {
    try {
      const { paymentId } = req.params;

      if (!paymentId) {
        return next(ApiError.badRequest("ID платежа не указан"));
      }

      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY,
        PaymentId: paymentId,
      };

      payload.Token = createTinkoffToken(payload);

      const response = await axios.post(
        `${TINKOFF_API_URL}/v2/GetState`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        }
      );

      const data = response.data;

      if (!data.Success) {
        return next(
          ApiError.badRequest(data.Message || "Ошибка получения статуса")
        );
      }

      return res.json({
        success: true,
        status: data.Status,
        orderId: data.OrderId,
        amount: data.Amount / 100,
        details: data,
      });
    } catch (err) {
      console.error("[GET STATE ERROR]", err.response?.data || err.message);
      return next(ApiError.internal("Ошибка при получении статуса платежа"));
    }
  }

  async GetSbpMembers(req, res, next) {
    try {
      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY,
      };

      payload.Token = createTinkoffToken(payload);

      console.log(payload);

      const response = await axios.post(
        "https://securepay.tinkoff.ru/a2c/sbp/GetSbpMembers",
        payload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        }
      );

      const data = response.data;

      if (!data.Success) {
        return next(ApiError.badRequest(data.Message));
      }

      console.log(data);

      for (const member of data.Members) {
        await Members.create({
          MemberId: member.MemberId,
          MemberName: member.MemberName,
          MemberNameRus: member.MemberNameRus,
        });
      }

      return res.json({ message: "Успешно" });
    } catch (err) {
      console.log(err);
      return next(
        ApiError.badRequest(
          "Ошибка при получение списка идентификаторов банков, участвующих в СБП."
        )
      );
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
}

module.exports = new PaymentController();
const controller = module.exports;
