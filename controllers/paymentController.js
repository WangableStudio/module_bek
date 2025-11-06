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
  NODE_ENV,
  CLOUDPAYMENTS_PUBLIC_ID,
  CLOUDPAYMENTS_API_SECRET,
  CLOUDPAYMENTS_EMAIL_FROM,
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
      const { commission, contractorAmount, items, totalAmount } = req.body;

      // if (!contractor?.id) {
      //   return next(ApiError.badRequest("Подрядчик не указан"));
      // }

      // const contractorRecord = await Contractors.findByPk(contractor.id);
      // if (!contractorRecord) {
      //   return next(ApiError.badRequest("Подрядчик не найден"));
      // }

      // // Для СБП регистрируем подрядчика только если нужно (не требуется для физлиц)
      // if (
      //   !contractorRecord.partnerId &&
      //   [
      //     CONTRACTOR_TYPES.IP,
      //     CONTRACTOR_TYPES.OOO,
      //     CONTRACTOR_TYPES.LEGAL_ENTITY,
      //   ].includes(contractorRecord.type)
      // ) {
      //   console.log("Проходим регистратцию");
      //   await axios.post(`${BACKEND_URL}/api/v1/contractors/register`, {
      //     contractorId: contractorRecord.id,
      //   });
      //   await contractorRecord.reload();
      // }

      const cleanedPhone = "+79606747611";
      const orderId = `order-${Date.now()}`;
      const amountInKopecks = Math.round(totalAmount * 100);

      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY,
        Amount: amountInKopecks,
        OrderId: orderId,
        CreateDealWithType: "NN",
        PaymentRecipientId: cleanedPhone,
        NotificationURL: `${BACKEND_URL}/api/v1/payment/notification`,
      };

      payload.Token = createTinkoffToken(payload);

      console.log("[TINKOFF INIT] Request:", JSON.stringify(payload, null, 2));

      const response = await axios.post(`${TINKOFF_API_URL}/v2/Init`, payload, {
        headers: { "Content-Type": "application/json" },
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
        commission,
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

  async getAll(req, res, next) {
    try {
      const payments = await Payment.findAll();
      return res.json(payments);
    } catch (err) {
      next(ApiError.internal("Ошибка при получении платежей"));
    }
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
        const stateData = await axios.get(
          `${BACKEND_URL}/api/v1/payment/state/${PaymentId}/default`
        );
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
      }
      //  if (newStatus === "CONFIRMED") {
      //   try {
      //     await controller.executePayouts(PaymentId);
      //     await controller.sendFiscalReceipt(PaymentId);
      //   } catch (err) {
      //     console.error("[TINKOFF PAYOUTS] Ошибка в executePayouts:", err);
      //   }
      // }

      return res.send("OK");
    } catch (err) {
      console.error("[TINKOFF WEBHOOK ERROR]", err);
      return res.status(500).send("ERROR");
    }
  }

  async sendFiscalReceipt(paymentId) {
    try {
      const payment = await Payment.findByPk(paymentId, {
        include: {
          model: Contractors,
          as: "contractor",
        },
      });

      if (!payment) {
        throw ApiError.badRequest(`Платёж с ID ${paymentId} не найден`);
      }

      const totalItems = payment.items.reduce(
        (sum, item) => sum + Number(item.amount),
        0
      );

      const companyAmount = Number(totalItems) + Number(payment.commission);
      const totalAmount =
        Number(companyAmount) + Number(payment.contractorAmount);
      // Авторизация (Basic Auth)
      const receipt = {
        Inn: "232910520874", // ИНН твоего юрлица
        Type: "Income", // Тип операции: Income = приход
        CustomerReceipt: {
          Items: [
            {
              label: "Компанию", // описание услуги
              price: Number(companyAmount),
              quantity: 1,
              amount: Number(companyAmount),
              vat: 0,
              method: 4,
              object: 4,
            },
            {
              label: "Подрядчику",
              price: Number(payment.contractorAmount),
              quantity: 1,
              amount: Number(payment.contractorAmount),
              vat: 0,
              method: 4,
              object: 4,
            },
          ],
          calculationPlace: "https://www.mbk.company",
          taxationSystem: 1, // 1 = УСН Доход
          email: payment.contractor.email, // кому отправить чек
          phone: payment.contractor.phone.replace(/[^\d+]/g, ""),
          amounts: {
            electronic: totalAmount,
          },
        },
        InvoiceId: payment.id,
        EmailCompany: CLOUDPAYMENTS_EMAIL_FROM,
      };

      const auth = Buffer.from(
        `${CLOUDPAYMENTS_PUBLIC_ID}:${CLOUDPAYMENTS_API_SECRET}`
      ).toString("base64");

      // Отправка запроса
      const response = await axios.post(
        "https://api.cloudpayments.ru/kkt/receipt",
        receipt,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("✅ Чек успешно отправлен:", response.data);

      if (!response.data.Success) {
        console.error("⚠️ Ошибка CloudKassir:", response.data.Message);
      }

      return response.data;
    } catch (error) {
      console.error(
        "❌ Ошибка при отправке чека:",
        error.response?.data || error.message
      );
      throw error;
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

      // // Выплаты
      // try {
      //   await controller.executePayouts(paymentId);
      //   await controller.sendFiscalReceipt(paymentId);
      // } catch (payoutErr) {
      //   console.error(
      //     `[TINKOFF PAYOUT ERROR] Ошибка при выплате:`,
      //     payoutErr.message
      //   );
      // }

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
  async executePayouts(paymentId, contractorId, payoutMethod) {
    try {
      const payment = await Payment.findByPk(paymentId);
      if (!payment) {
        throw ApiError.badRequest(`Платеж с ID ${paymentId} не найден`);
      }
      if (payment.isPaidOut) {
        return {
          success: true,
          alreadyPaidOut: true,
          message: `💡 Платеж ${paymentId} уже выплачен`,
        };
      }
      if (!payment.dealId) {
        throw ApiError.badRequest(
          `DealId отсутствует для платежа ${paymentId}`
        );
      }

      const contractor = await Contractors.findByPk(contractorId);
      if (!contractor) {
        throw ApiError.badRequest(
          `Подрядчик не найден для платежа ${paymentId}`
        );
      }

      const { partnerId, type } = contractor;

      if (
        !partnerId &&
        [
          CONTRACTOR_TYPES.IP,
          CONTRACTOR_TYPES.OOO,
          CONTRACTOR_TYPES.LEGAL_ENTITY,
        ].includes(type)
      ) {
        throw ApiError.badRequest(
          `PartnerId отсутствует для подрядчика ${contractor.id} (${type})`
        );
      }

      const results = {};

      if (payment.contractorAmount > 0) {
        const payoutPayload = {
          paymentId: payment.id,
          dealId: payment.dealId,
          amount: payment.contractorAmount,
          type: "contractor",
          finalPayout: true,
        };

        switch (payoutMethod) {
          case "partnerId":
            if (
              ![
                CONTRACTOR_TYPES.INDIVIDUAL,
                CONTRACTOR_TYPES.SELF_EMPLOYED,
              ].includes(type)
            ) {
              payoutPayload.partnerId = partnerId;
            }
            break;

          case "sbp":
            if (
              ![
                CONTRACTOR_TYPES.IP,
                CONTRACTOR_TYPES.OOO,
                CONTRACTOR_TYPES.LEGAL_ENTITY,
              ].includes(type)
            ) {
              payoutPayload.memberId = "100000000012";
              payoutPayload.phone = "79066589133";
              // payoutPayload.memberId = contractor.memberId;
              // payoutPayload.phone = contractor.phone?.replace(/\D/g, "");
            }
            break;

          case "card":
            // TODO: реализовать выплату на карту
            break;

          default:
            throw ApiError.badRequest(
              `Неизвестный метод выплаты: ${payoutMethod}`
            );
        }

        try {
          results.contractor = await controller.sendPayout(payoutPayload);
        } catch (err) {
          console.error(
            `[TINKOFF PAYOUT ERROR] ❌ Ошибка выплаты подрядчику:`,
            err.message
          );
          throw ApiError.internal("Ошибка при выплате подрядчику");
        }
      }

      await payment.update({
        isPaidOut: true,
        paymentMethod: payoutMethod,
        contractorId: contractor.id,
      });

      await controller.sendFiscalReceipt(paymentId);

      console.log(
        `[TINKOFF PAYOUTS] 🎉 Все выплаты завершены для платежа ${paymentId}`
      );

      return { success: true, results };
    } catch (err) {
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
        dealId,
        partnerId,
        amount,
        status: data.Status,
        type,
        responseData: data,
      });

      console.log(
        `[TINKOFF PAYOUT] ✅ Выплата успешно создана (paymentId: ${paymentId}, type: ${type})`
      );

      if (partnerId) {
        try {
          await controller.getPayment(data.PaymentId);
          console.log(
            `[TINKOFF PAYOUT] ✅ Выплата подрядчику завершена (paymentId: ${data.PaymentId})`
          );
        } catch (err) {
          console.error(
            "[TINKOFF PAYOUT ERROR] Ошибка при окончании выплаты",
            err
          );
        }
      }

      return {
        success: true,
        payoutId: data.PaymentId,
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

  async getPayment(payoutId) {
    try {
      const payout = await Payout.findByPk(payoutId);

      if (payout.status == "COMPLETED" || payout.status == "REJECTED") {
        return {
          success: true,
          message: `💡 Невозможно осуществить выплату ${payoutId}. Сделка закрыта статусом ${payout.status}.`,
        };
      }

      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY_E2C,
        PaymentId: payoutId,
      };
      payload.Token = createTinkoffToken(payload);
      console.log(payload);
      const { data } = await axios.post(
        `${TINKOFF_API_URL}/e2c/v2/Payment`,
        payload,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        }
      );

      console.log(data);

      if (!data.Success) {
        throw ApiError.badRequest(
          data.Message || "Ошибка при попалнении карты"
        );
      }

      await payout.update(
        {
          status: data.Status,
          responseData: { ...payout.responseData, complated: data },
        },
        { where: { id: payoutId } }
      );

      return data;
    } catch (err) {
      throw ApiError.internal("Внутренняя ошибка при попалнение карты");
    }
  }

  // 📋 Получение платежа
  async payment(req, res, next) {
    try {
      const { paymentId } = req.body;
      const payment = await controller.getPayment(paymentId);
      return res.json(payment);
    } catch (err) {
      console.error("[GET PAYMENT ERROR]", err);
      return next(ApiError.internal("Ошибка при получение платежа"));
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
      const { paymentId, contractorId, payoutMethod } = req.body;

      if (!paymentId) {
        return next(ApiError.badRequest("ID платежа не указан"));
      }

      const payout = await controller.executePayouts(
        paymentId,
        contractorId,
        payoutMethod
      );

      return res.json(payout);
    } catch (err) {
      console.error("[PAYOUT ERROR]", err);
      return next(ApiError.internal("Ошибка при выполнении выплат"));
    }
  }

  // 📋 Получение статуса платежа
  async getState(req, res, next) {
    try {
      const { paymentId, type } = req.params;

      if (!paymentId) {
        return next(ApiError.badRequest("ID платежа не указан"));
      }

      const payload = {
        TerminalKey: TINKOFF_TERMINAL_KEY,
        PaymentId: paymentId,
      };

      if (type === "payout") {
        payload.TerminalKey = TINKOFF_TERMINAL_KEY_E2C;
      }

      payload.Token = createTinkoffToken(payload);
      console.log(payload);

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

      const response = await axios.post(
        `${TINKOFF_API_URL}/a2c/sbp/GetSbpMembers`,
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
  async getPaymentByOrderId(req, res, next) {
    try {
      const { orderId } = req.params;
      const payment = await Payment.findOne({ where: { orderId: orderId } });
      return res.json(payment);
    } catch (err) {
      console.error(err);
      return next(ApiError.badRequest("Ошибка при получение платежа"));
    }
  }
}

module.exports = new PaymentController();
const controller = module.exports;
