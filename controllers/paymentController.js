const mongoose = require('mongoose');
const UserService = require('../services/userServices');
const CashfreeService = require('../services/cashfreeService');

exports.createOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {

        const userId = req.user._id;

        const payment = await CashfreeService.createOrder(userId);
        const paymentSessionId = payment.payment_session_id;
        const paymentOrderId = payment.order_id;

        await UserService.updateOrder(userId, paymentOrderId, 'PENDING', session);
        await session.commitTransaction();
        session.endSession();
        res.status(200).json({paymentSessionId});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.paymentStatus = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const userId = req.params.Id;

        const { orderId } = await UserService.getOrderDetails(userId, session);
        if (!orderId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ error: 'Order not found' });
        }

        const orderStatus = await CashfreeService.getPaymentStatus(orderId);

        await UserService.updateOrder(userId, orderId, orderStatus, session);

        await session.commitTransaction();
        session.endSession();
        res.redirect('/interview');
        res.status(200).json({ orderStatus });
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.log(error);
        res.status(500).json({ error: error.message });
    }
};