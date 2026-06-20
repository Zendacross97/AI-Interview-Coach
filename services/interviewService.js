const InterviewSession = require('../model/interview');
const redisService = require('./redisService');
const geminiService = require('./geminiService');

exports.getSessionById = async (_id) => {
    try {
        return InterviewSession.findById(_id);
    } catch (error) {
        console.error("Error fetching session:", error.message);
        throw error;
    }
}

exports.initializeSession = async (userId, resumeId, roleType, difficulty) => {
    if (!resumeId) {
        throw new Error("Missing resume reference parameter link.");
    }

    const currentSession = await InterviewSession.create({
        userId,
        resumeId, 
        roleType,
        difficulty,
        status: "active",
        transcript: []
    });
    
    await redisService.setActiveSession(userId.toString(), currentSession._id.toString());
    return currentSession;
};

exports.logMessageToTranscript = async (sessionId, sender, text) => {
    try {
        return await InterviewSession.findByIdAndUpdate(
            sessionId,
            { 
                $push: { transcript: { sender, text } } 
            },
            { returnDocument: 'after' } 
        );
    } catch (error) {
        console.error("Error logging message to transcript:", error.message);
        throw error;
    }
};

exports.finalizeSession = async (sessionId, userId, sessionFailed) => {
    await redisService.removeActiveSession(userId.toString());
    
    if (!sessionId) return null;
    try {
        const session = await InterviewSession.findById(sessionId);
        if (!session) return null;

        let technicalScore = 0;
        let communicationScore = 0;
        let aiSummaryFeedback = "Interview got terminated early. Evaluation metrics could not be accurately calculated.";

        const candidateAnswers = session.transcript.filter(turn => turn.sender === 'candidate');

        if (candidateAnswers.length >= 1 && sessionFailed === false) {
            try {
                const evaluation = await geminiService.generateScorecard(session.transcript);
                
                technicalScore = evaluation.technicalScore;
                communicationScore = evaluation.communicationScore;
                aiSummaryFeedback = evaluation.aiSummaryFeedback;
            } catch (aiError) {
                console.error("Gemini scorecard synthesis loop aborted:", aiError.message);
                aiSummaryFeedback = "Failed to compile analytical performance summary due to an internal upstream engine error.";
            }
        }

        
        session.status = sessionFailed?'abandoned':'completed';
        session.endedAt = new Date();
        session.overallScorecard = {
            technicalScore,
            communicationScore,
            aiSummaryFeedback
        };

        return await session.save();
    } catch (dbError) {
        console.error("Database tracking write failure during finalization:", dbError.message);
        throw dbError;
    }
};

exports.cleanupAbandonedSessions = async (num) => {
    const safetyThreshold = new Date(Date.now() - num * 60 * 60 * 1000);
    try {
        const result = await InterviewSession.updateMany(
            {
                status: 'active',
                updatedAt: { $lt: safetyThreshold }
            },
            {
                $set: {
                    status: 'abandoned',
                    endedAt: new Date(),
                    'overallScorecard.aiSummaryFeedback': "Session expired due to candidate prolonged inactivity."
                }
            }
        );
        return result.modifiedCount;
    } catch (error) {
        console.error("Error cleaning up abandoned sessions:", error.message);
        throw error;
    }
};

exports.purgeSessionsOlderThanDays = async (daysOld) => {
    const boundaryDate = new Date();
    boundaryDate.setDate(boundaryDate.getDate() - daysOld);

    try {
        const result = await InterviewSession.deleteMany({
            createdAt: { $lt: boundaryDate }
        });
        
        return result.deletedCount;
    } catch (error) {
        console.error(`[PURGE SERVICE ERROR] Failed to drop sessions older than ${daysOld} days:`, error.message);
        throw error;
    }
};

exports.getLatestSevenCompletedSessions = async (userId) => {
    try {
        return await InterviewSession.find({
            userId,
            status: 'completed'
        })
        .sort({ endedAt: -1, createdAt: -1 })
        .limit(7)
        .lean();
    } catch (error) {
        console.error(`Error getting latest completed sessionss:`, error.message);
        throw error;
    }
};