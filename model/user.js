const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        hash: { type: String, required: true },
        uuid: { type: String, required: false},
        isactive: { type: Boolean, default: false }
    },
    order: {
        orderId: {type: String, required: false},
        status: { type: String, enum: ['SUCCESS', 'PENDING'], default: 'PENDING' }
    },
    interviewCount: {
        type: Number,
        min: 0,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);