const Router = require('express');
const router = new Router();
const paymentController = require('../controllers/paymentController');

router.post('/register', paymentController.registerPartner);
router.get('/GetSbpMembers', paymentController.getBankName);

module.exports = router;