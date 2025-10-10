const sequelize = require("../db");
const { DataTypes } = require("sequelize");

const CONTRACTOR_TYPES = {
  INDIVIDUAL: "individual",
  LEGAL_ENTITY: "legal_entity",
  SELF_EMPLOYED: "self_employed",
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

// models.js
const Contractors = sequelize.define("contractors", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
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
  regDepartment: { type: DataTypes.STRING },
  regDate: { type: DataTypes.STRING },

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

  // Банковские реквизиты
  bankAccount: { type: DataTypes.STRING },
  bankName: { type: DataTypes.STRING },
  bankBik: { type: DataTypes.STRING },
  bankCorrespondentAccount: { type: DataTypes.STRING },
  bankKbk: { type: DataTypes.STRING },
  bankOktmo: { type: DataTypes.STRING },

  // Дополнительные поля для регистрации
  fullName: { type: DataTypes.STRING }, // Полное наименование
  billingDescriptor: { type: DataTypes.STRING },
  assets: { type: DataTypes.STRING },
  primaryActivities: { type: DataTypes.TEXT },
  comment: { type: DataTypes.TEXT },

  // Руководитель
  ceoFirstName: { type: DataTypes.STRING },
  ceoLastName: { type: DataTypes.STRING },
  ceoMiddleName: { type: DataTypes.STRING },
  ceoBirthDate: { type: DataTypes.STRING },
  ceoBirthPlace: { type: DataTypes.STRING },
  ceoDocType: { type: DataTypes.STRING },
  ceoDocNumber: { type: DataTypes.STRING },
  ceoIssueDate: { type: DataTypes.STRING },
  ceoIssuedBy: { type: DataTypes.STRING },
  ceoAddress: { type: DataTypes.TEXT },
  ceoPhone: { type: DataTypes.STRING },
  ceoCountry: { type: DataTypes.STRING, defaultValue: "RUS" },

  partnerId: { type: DataTypes.STRING },
});

const Payment = sequelize.define("payment", {
  id: { type: DataTypes.BIGINT, primaryKey: true },
  orderId: { type: DataTypes.STRING, allowNull: false },
  paymentUrl: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING },
  contractorId: { type: DataTypes.INTEGER, allowNull: false },
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

module.exports = {
  User,
  Contractors,
  Nomenclature,
  Company,
  Payment,
  Payout,
  CONTRACTOR_TYPES,
};
