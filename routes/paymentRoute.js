const express = require('express');
const paymentController = require('../controllers/paymentController');
const userAuthentication = require('../middlewares/auth');

const router = express.Router();

router.post('/pay', userAuthentication.authenticate, paymentController.createOrder);
router.get('/payment-status/:Id', paymentController.paymentStatus);

module.exports = router;