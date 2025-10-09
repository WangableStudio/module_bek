const Router = require('express');
const router = new Router();
const paymentController = require('../controllers/paymentController');

router.post('/register', paymentController.registerPartner);

module.exports = router;