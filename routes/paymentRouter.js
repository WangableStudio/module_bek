// routes/paymentRoutes.js
const Router = require('express');
const router = new Router();
const paymentController = require('../controllers/paymentController');

router.post('/init', paymentController.init);
router.post('/notification', paymentController.notification);
router.post('/confirm', paymentController.confirm);
router.post('/payout', paymentController.payout);
router.post('/GetSbpMembers', paymentController.GetSbpMembers);
router.get('/:orderId', paymentController.getPaymentByOrderId)
router.get('/state/:paymentId/:type', paymentController.getState);

module.exports = router;