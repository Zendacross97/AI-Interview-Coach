const mongoose = require('mongoose');

const InterviewSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  resumeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resume', required: true },
  roleType: { type: String, required: true },
  difficulty: { 
    type: String, 
    enum: ['Junior', 'Mid', 'Senior/Staff'], 
    default: 'Junior' 
  },
  status: { 
    type: String, 
    enum: ['active', 'completed', 'abandoned'], 
    default: 'active' 
  },
  transcript: [
    {
      sender: { type: String, enum: ['ai', 'candidate'], required: true },
      text: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
      aiFeedback: { type: String, default: null }
    }
  ],
  overallScorecard: {
    technicalScore: { type: Number, min: 0, max: 100, default: 0 },
    communicationScore: { type: Number, min: 0, max: 100, default: 0 },
    aiSummaryFeedback: { type: String, default: null }
  },
  endedAt: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('InterviewSession', InterviewSessionSchema);