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
    
    // Map active session to Redis for lightning-fast tracking
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
        // 1. Fetch the complete transcript history captured so far
        const session = await InterviewSession.findById(sessionId);
        if (!session) return null;

        // Fallback defaults if the session was killed instantly without technical depth
        let technicalScore = 0;
        let communicationScore = 0;
        let aiSummaryFeedback = "Interview terminated early by candidate. Evaluation metrics could not be accurately calculated.";

        // 2. Count candidate turns to avoid wasting API tokens on empty windows
        const candidateAnswers = session.transcript.filter(turn => turn.sender === 'candidate');

        if (candidateAnswers.length >= 1) {
            try {
                // 3. Request structured analytics directly from Gemini core
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

