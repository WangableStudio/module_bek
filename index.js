require("dotenv").config();
const express = require("express");
const sequelize = require("./db");
const cors = require("cors");
const models = require("./models/models");
const router = require("./routes/index");
const errorHeandler = require('./middleware/ErrorHandlingMiddleware')

const PORT = process.env.PORT || 5000;

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/v1", router);

app.use(errorHeandler);

app.get("/", (req, res) => {
  res.send("Server is running!");
});

const start = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (err) {
    console.log("Error connecting to the database:", err);
  }
};

start()