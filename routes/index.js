const Router = require("express");
const router = new Router();
const userRouter = require("./userRouter");
const contractorsRouter = require("./contractorsRouter");
const nomenclatureRouter = require("./nomenclatureRouter");
const companyRouter = require("./companyRouter");
const paymentRouter = require("./paymentRouter");
const partnerRouter = require("./partnerRouter");

router.use("/user", userRouter);
router.use("/contractors", contractorsRouter);
router.use("/nomenclature", nomenclatureRouter);
router.use("/company", companyRouter);
router.use("/payment", paymentRouter);
router.use('/partners', partnerRouter);

module.exports = router;