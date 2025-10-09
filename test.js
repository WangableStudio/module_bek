const crypto = require("crypto");
const axios = require("axios");
const { Payment, Contractors, Payout } = require("../models"); // ваши модели
const ApiError = require("../error/ApiError");

const TINKOFF_TERMINAL_KEY = "1759332525322";
const TINKOFF_TERMINAL_KEY_E2C = "1759332525322E2C"; // для выплат
const TINKOFF_PASSWORD = "gP3PIYw*xe5L#$9G";

// ========================================
// 🔐 ГЕНЕРАЦИЯ ТОКЕНА
// ========================================
function createTinkoffToken(payload, password) {
  const filtered = {};
  for (const key in payload) {
    // Исключаем объекты (DATA, senderAccountInfo и т.д.) из токена
    if (typeof payload[key] !== "object") {
      filtered[key] = payload[key];
    }
  }
  filtered.Password = password;

  // Сортируем по ключам
  const sortedKeys = Object.keys(filtered).sort();

  // Конкатенируем значения
  const concatenated = sortedKeys.map((key) => String(filtered[key])).join("");

  console.log("[TOKEN] Concatenated string:", concatenated);

  // SHA-256
  const token = crypto
    .createHash("sha256")
    .update(concatenated, "utf8")
    .digest("hex");

  return token;
}

// ========================================
// 📝 1. СОЗДАНИЕ ПЛАТЕЖНОЙ ССЫЛКИ (Init)
// ========================================
async function paymentUrl(req, res, next) {
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
      CreateDealWithType: "NN", // создаем сделку
      PaymentRecipientId: cleanedPhone,
      NotificationURL: `${process.env.BACKEND_URL}/api/payment/notification`, // ⚠️ важно!
      DATA: {
        companyAmount: Math.round(companyAmount * 100),
        contractorAmount: Math.round(contractorAmount * 100),
        commission: Math.round(commission * 100),
      },
    };

    payload.Token = createTinkoffToken(payload, TINKOFF_PASSWORD);

    console.log("[TINKOFF] Init Payload:", payload);

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

    // Сохраняем платеж
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
      dealId: null, // будет заполнен из нотификации
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
    console.error("[TINKOFF EXCEPTION]", err.response?.data || err);
    return next(ApiError.internal("Ошибка при создании платёжной ссылки"));
  }
}

// ========================================
// 📬 2. ОБРАБОТЧИК НОТИФИКАЦИЙ (WEBHOOK)
// ========================================
async function handleNotification(req, res, next) {
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

    // Сохраняем DealId (SpAccumulationId) - ОН ОЧЕНЬ ВАЖЕН!
    if (notification.SpAccumulationId) {
      payment.dealId = notification.SpAccumulationId;
    }

    await payment.save();

    console.log("[NOTIFICATION] Payment updated:", payment.id, payment.status);

    // Обрабатываем статусы
    switch (notification.Status) {
      case "AUTHORIZED":
        console.log("[NOTIFICATION] Payment authorized, confirming...");
        // Автоматически подтверждаем платеж
        await confirmPayment(payment);
        break;

      case "CONFIRMED":
        console.log("[NOTIFICATION] Payment confirmed, initiating payouts...");
        // Делаем выплаты
        await initiatePayouts(payment);
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

// ========================================
// ✅ 3. ПОДТВЕРЖДЕНИЕ ПЛАТЕЖА (Confirm)
// ========================================
async function confirmPayment(payment) {
  try {
    const payload = {
      TerminalKey: TINKOFF_TERMINAL_KEY,
      PaymentId: payment.id,
    };

    payload.Token = createTinkoffToken(payload, TINKOFF_PASSWORD);

    console.log("[CONFIRM] Payload:", payload);

    const response = await axios.post(
      "https://rest-api-test.tinkoff.ru/v2/Confirm",
      payload,
      { headers: { "Content-Type": "application/json" } }
    );

    console.log("[CONFIRM] Response:", response.data);

    if (response.data.Success) {
      payment.status = response.data.Status;
      await payment.save();
    }

    return response.data;
  } catch (err) {
    console.error("[CONFIRM ERROR]", err.response?.data || err);
    throw err;
  }
}

// ========================================
// 💰 4. ВЫПЛАТЫ ПОДРЯДЧИКУ И КОМПАНИИ
// ========================================
async function initiatePayouts(payment) {
  try {
    if (!payment.dealId) {
      throw new Error("DealId not found for payment: " + payment.id);
    }

    const contractor = await Contractors.findByPk(payment.contractorId);

    // 4.1 Выплата подрядчику
    if (payment.contractorAmount > 0 && contractor.partnerId) {
      console.log("[PAYOUT] Initiating contractor payout...");
      await createPayout({
        dealId: payment.dealId,
        partnerId: contractor.partnerId, // ⚠️ должен быть зарегистрирован!
        amount: payment.contractorAmount,
        orderId: `payout-contractor-${payment.id}`,
        description: `Выплата подрядчику ${contractor.name}`,
        isFinal: false,
        paymentId: payment.id,
        recipientType: "contractor",
      });
    }

    // 4.2 Выплата компании (остаток)
    if (payment.companyAmount > 0) {
      console.log("[PAYOUT] Initiating company payout...");

      // ⚠️ У вас должен быть зарегистрирован PartnerId для вашей компании
      const COMPANY_PARTNER_ID = process.env.COMPANY_PARTNER_ID || "";

      await createPayout({
        dealId: payment.dealId,
        partnerId: COMPANY_PARTNER_ID,
        amount: payment.companyAmount,
        orderId: `payout-company-${payment.id}`,
        description: "Выплата компании",
        isFinal: true, // ПОСЛЕДНЯЯ выплата - закрываем сделку!
        paymentId: payment.id,
        recipientType: "company",
      });
    }

    console.log("[PAYOUT] All payouts initiated successfully");
  } catch (err) {
    console.error("[PAYOUT ERROR]", err);
    throw err;
  }
}

// ========================================
// 💸 5. СОЗДАНИЕ ВЫПЛАТЫ (Init E2C)
// ========================================
async function createPayout(options) {
  try {
    const {
      dealId,
      partnerId,
      amount,
      orderId,
      description,
      isFinal,
      paymentId,
      recipientType,
    } = options;

    const amountInKopecks = Math.round(amount * 100);

    const payload = {
      TerminalKey: TINKOFF_TERMINAL_KEY_E2C, // ⚠️ терминал ВЫПЛАТ!
      OrderId: orderId,
      Amount: amountInKopecks,
      PartnerId: partnerId, // ID зарегистрированного партнера
      DealId: dealId,
      FinalPayout: isFinal,
      PaymentRecipientId: partnerId, // можно дублировать
    };

    payload.Token = createTinkoffToken(payload, TINKOFF_PASSWORD);

    console.log("[PAYOUT INIT] Payload:", payload);

    // Инициализация выплаты
    const initResponse = await axios.post(
      "https://rest-api-test.tinkoff.ru/e2c/v2/Init",
      payload,
      { headers: { "Content-Type": "application/json" } }
    );

    console.log("[PAYOUT INIT] Response:", initResponse.data);

    if (!initResponse.data.Success) {
      throw new Error(
        "Payout init failed: " + JSON.stringify(initResponse.data)
      );
    }

    const payoutPaymentId = initResponse.data.PaymentId;

    // Сохраняем в БД
    const payout = await Payout.create({
      id: payoutPaymentId,
      paymentId,
      orderId,
      amount,
      status: initResponse.data.Status,
      recipientType,
      partnerId,
      dealId,
      isFinal,
    });

    // Выполняем выплату
    await executePayoutPayment(payoutPaymentId);

    return payout;
  } catch (err) {
    console.error("[PAYOUT");
  }
}
