const UserServices = require('../services/userServices');
const BrevoService = require('../services/brevoService');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const logInUser = async (req, res) => {  
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Login credentials are incomplete' });
        }
        const user = await UserServices.getUserByEmail(email); 
         if (!user) {
            return res.status(404).json({ error: 'User not found' });
         }

        const match = await bcrypt.compare(password, user.password.hash);

        if (!match) {
            return res.status(401).json({ error: 'User not authorized' });
        }

        const accessToken = token(user._id);

        res.status(200).json({
            message: 'User login successful',
            token: accessToken,
        });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

const getSignUpPage = (req, res) => {
    res.sendFile(path.join(__dirname, '../views/signUp.html'));
};

const signUpUser = async (req, res) => {  
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
             return res.status(400).json({ error: 'Sign-up credentials are incomplete' });
        }

        const existingUser = await UserServices.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const hash = await bcrypt.hash(password, 10);

        await UserServices.createUser(name, email, hash);

        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

function token(id) {
  return jwt.sign({ userId: id }, process.env.JWT_SECRET);
}

const getForgotPasswordPage = (req, res) => {
    res.sendFile(path.join(__dirname, '../views/forgot.html'));
};

const forgotUser = async (req, res) => {
    try {
        const { email } = req.params;
        if(!email) {
            return res.status(400).json({ error: 'Email credential is incomplete'})
        }
        const uuid = uuidv4();

        const user = await UserServices.getUserByEmail(email);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        await UserServices.createUuid(uuid, user._id);

        await BrevoService.sendResetPasswordEmail(email, uuid); 
        res.status(200).json({ message: 'Password reset link has been sent on your email' });

    } catch (error) {
        res.status(500).json({error: error});
    }
}

const resetPassword = async (req, res) => {
    try {
        const { uuid } = req.params;
        const resetDetails = await UserServices.getUuid(uuid); 

         if (!resetDetails) {
            return res.status(404).send('User not found or reset link invalid');
        }
         res.status(200).sendFile(path.join(__dirname, '../views/resetPassword.html'));
    } catch(error) {
        res.status(500).json({error: error.message});
    }
}

const updatePassword = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;
        const { uuid } = req.params;
        if (!password || !confirmPassword) {
            return res.status(400).json({ error: 'Password credential is incomplete' });
        }
        if (password !== confirmPassword) { //confirm password
            return res.status(400).json({ error: 'Password and confirm password do not match' });
        }
        const resetDetails = await UserServices.getUuid(uuid); // Using the service to fetch UUID details
        
        // Check if user exists
        if (!resetDetails) {
            return res.status(404).json({ error: 'User not found or reset link invalid' });
        }

        // hash new password
        const hash = await bcrypt.hash(password, 10);

        // update user password
        await UserServices.updateUserPassword(hash, resetDetails._id);

        // clear/reset UUID status
        await UserServices.updateUuidStatus(uuid);

        res.status(200).json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

const getUserprofileStatus = async (req, res) => {
    try {
        const user = await UserServices.getuserById(req.user._id);
        if (!user) {
            return res.status(404).json({ error: "User profile record not found." });
        }
        const isPremium = user.order && user.order.status === 'SUCCESS';
        const totalInterviewsCount = user.interviewCount;
        res.status(200).json({isPremium, totalInterviewsCount})
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

module.exports = {
    getSignUpPage,
    signUpUser,
    logInUser,
    getForgotPasswordPage,
    forgotUser,
    resetPassword,
    updatePassword,
    getUserprofileStatus
};