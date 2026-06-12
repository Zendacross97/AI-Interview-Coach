const express = require('express');
const userController = require('../controllers/userController');
const authenticator = require('../middlewares/auth');

const router = express.Router();

router.post('/login', userController.logInUser);
router.get('/signup', userController.getSignUpPage);
router.post('/signup', userController.signUpUser);
router.get('/forgotpassword', userController.getForgotPasswordPage);
router.get('/forgotpassword/:email', userController.forgotUser);
router.get('/resetpassword/:uuid', userController.resetPassword);
router.post('/updatepassword/:uuid', userController.updatePassword);
router.get('/profile-status', authenticator.authenticate, userController.getUserprofileStatus);

module.exports = router;