const mongoose = require('mongoose');

const ResumeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  s3Key: { type: String, required: true },       
  s3Url: { type: String, required: true },       
  parsedText: { type: String, required: false },  
  skillsTracked: [{ type: String }],         
  uploadedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Resume', ResumeSchema);