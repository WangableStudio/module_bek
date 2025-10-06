const Router = require("express");
const userController = require("../controllers/userController");
const authMiddleware = require("../middleware/middleware");
const router = new Router();

router.post("/create", userController.create);
router.post("/login", userController.login);
router.post("/split-payment", authMiddleware, userController.paymentUrl);
router.post("/auth", authMiddleware, userController.auth);
router.get("/", userController.getAll);
router.get("/:id", userController.getOne);
router.put("/:id", userController.update);
router.delete("/:id", userController.delete);

module.exports = router;
