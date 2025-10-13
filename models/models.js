const sequelize = require("../db");
const { DataTypes } = require("sequelize");

const CONTRACTOR_TYPES = {
  INDIVIDUAL: "individual",
  LEGAL_ENTITY: "legal_entity",
  SELF_EMPLOYED: "self_employed",
  IP: "ip",
  OOO: "ooo",
};

const User = sequelize.define("user", {
  id: {
    type: DataTypes.BIGINT,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  login: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

const Members = sequelize.define("members", {
  MemberId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  MemberName: {
    type: DataTypes.STRING,
  },
  MemberNameRus: {
    type: DataTypes.STRING,
  },
});

const Contractors = sequelize.define("contractors", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: { type: DataTypes.STRING, allowNull: false },
  type: {
    type: DataTypes.ENUM(Object.values(CONTRACTOR_TYPES)),
    allowNull: false,
    defaultValue: CONTRACTOR_TYPES.INDIVIDUAL,
  },

  // Основные реквизиты
  inn: { type: DataTypes.STRING },
  kpp: { type: DataTypes.STRING, defaultValue: "000000000" },
  ogrn: { type: DataTypes.STRING },
  okved: { type: DataTypes.STRING },

  // Контактная информация
  phone: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  siteUrl: { type: DataTypes.STRING },

  // Адреса
  legalAddress: { type: DataTypes.TEXT },
  actualAddress: { type: DataTypes.TEXT },
  postalAddress: { type: DataTypes.TEXT },
  zip: { type: DataTypes.STRING },
  city: { type: DataTypes.STRING },
  country: { type: DataTypes.STRING, defaultValue: "RUS" },
  street: { type: DataTypes.STRING },

  // Банковские реквизиты
  bankAccount: { type: DataTypes.STRING },
  bankName: { type: DataTypes.STRING },
  bankBik: { type: DataTypes.STRING },

  // Дополнительные поля для регистрации
  fullName: { type: DataTypes.STRING }, // Полное наименование
  billingDescriptor: { type: DataTypes.STRING },
  comment: { type: DataTypes.TEXT },

  // Руководитель
  ceoFirstName: { type: DataTypes.STRING },
  ceoLastName: { type: DataTypes.STRING },
  ceoPhone: { type: DataTypes.STRING },
  ceoCountry: { type: DataTypes.STRING, defaultValue: "RUS" },

  partnerId: { type: DataTypes.STRING },
  memberId: {
    type: DataTypes.STRING,
    references: {
      model: Members,
      key: "MemberId",
    },
    allowNull: false,
  },
});

const Payment = sequelize.define("payment", {
  id: { type: DataTypes.BIGINT, primaryKey: true },
  orderId: { type: DataTypes.STRING, allowNull: false },
  paymentUrl: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING },
  commission: { type: DataTypes.DECIMAL(15, 2) },
  companyAmount: { type: DataTypes.DECIMAL(15, 2) },
  contractorAmount: { type: DataTypes.DECIMAL(15, 2) },
  totalAmount: { type: DataTypes.DECIMAL(15, 2) },
  items: { type: DataTypes.JSON },
  responseData: { type: DataTypes.JSON },
  dealId: { type: DataTypes.STRING },
  isConfirmed: { type: DataTypes.BOOLEAN, defaultValue: false },
  isPaidOut: { type: DataTypes.BOOLEAN, defaultValue: false },
  paymentMethod: { type: DataTypes.STRING, defaultValue: "SBP" },
  contractorId: {
    type: DataTypes.UUID,
    references: {
      model: Contractors,
      key: "id",
    },
    allowNull: false,
  },
});

const Payout = sequelize.define("payout", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  paymentId: { type: DataTypes.BIGINT, allowNull: false },
  partnerId: { type: DataTypes.STRING, allowNull: false },
  amount: { type: DataTypes.DECIMAL(15, 2) },
  payoutId: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING },
  type: { type: DataTypes.ENUM("contractor", "company") },
  responseData: { type: DataTypes.JSON },
});

const Nomenclature = sequelize.define("nomenclature", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  price: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

const Company = sequelize.define("company", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  company_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  inn: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  kpp: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ogrn: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  legal_address: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  actual_address: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  bank_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  account_number: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  bik: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  correspondent_account: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  website: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  director: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

Members.hasMany(Contractors, {
  foreignKey: "memberId",
  as: "contractors",
});
Contractors.belongsTo(Members, {
  foreignKey: "memberId",
  as: "member",
});

Contractors.hasMany(Payment, { as: "payments", foreignKey: "contractorId" });
Payment.belongsTo(Contractors, {
  as: "contractor",
  foreignKey: "contractorId",
});

module.exports = {
  User,
  Contractors,
  Nomenclature,
  Company,
  Payment,
  Payout,
  Members,
  CONTRACTOR_TYPES,
};
