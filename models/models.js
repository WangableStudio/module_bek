const sequelize = require("../db");
const { DataTypes } = require("sequelize");

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

const Contractors = sequelize.define("contractors", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  inn: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true,
    },
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  name_bank: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  curr_acc: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  bik: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  city: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  corr_acc: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
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
};
