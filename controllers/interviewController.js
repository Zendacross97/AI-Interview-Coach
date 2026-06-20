const AwsServices = require('../services/awsServices');
const resumeService = require('../services/resumeService');
const interviewService = require('../services/interviewService');
const redisService = require('../services/redisService');
const path = require('path');

exports.getInterviewPage = (req, res) => {
    res.sendFile(path.join(__dirname, '../views/interview.html'));
};

exports.checkExistingResume = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'User context missing. Authentication required.' });
        }
        
        const resumeRecord = await resumeService.getResumeData(req.user._id);
        
        if (resumeRecord) {
            return res.status(200).json({ 
                hasResume: true, 
                resumeId: resumeRecord._id,
                message: "Existing resume found." 
            });
        }
        
        return res.status(200).json({ hasResume: false, message: "No resume found for this user." });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.uploadresume = async (req, res) => {
    try {
        if (!req.user || !req.user._id) {
            return res.status(401).json({ error: 'User context missing. Authentication required.' });
        }

        const filename = `resumes/${req.user._id}/resume.pdf`;
        
        const { presignedUrl, s3FileUrl } = await AwsServices.getPresignedUploadUrl(filename);

        res.status(200).json({ 
            uploadInstructionsUrl: presignedUrl, 
            permanentFileUrl: s3FileUrl,
            s3Key: filename 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.saveResumeMetadata = async (req, res) => {
    try {
        const { s3Key, s3Url } = req.body;
        if (!s3Key || !s3Url) {
            return res.status(400).json({ error: 'Missing S3 metadata' });
        }

        const resumeRecord = await resumeService.updateResume(req.user._id, s3Key, s3Url);
        res.status(200).json({ message: 'Metadata logged successfully', resumeId: resumeRecord._id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getPreviousSessions = async (req, res) => {
    try {
        if (!req.user || req.user.order.status!=='SUCCESS') {
            return res.status(403).json({ error: "User doesn't have premium subscription." });
        }
        const sessions = await interviewService.getLatestSevenCompletedSessions(req.user._id);
        return res.status(200).json({ 
            success: true, 
            sessions: sessions 
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
    }
};

exports.validateSession = async (req, res) => {
    try {
        const { roleType, difficulty } = req.body;
        const activeSessionId = await redisService.getActiveSession(req.user._id.toString());
        if (!activeSessionId) {
            return res.status(200).json({ status: 'PROCEED_CLEAN' });
        }
        const session = await interviewService.getSessionById(activeSessionId);
        if (!session || session.status !== 'active') {
            return res.status(200).json({ status: 'PROCEED_CLEAN' });
        }
        if (session.roleType === roleType && session.difficulty === difficulty) {
            return res.status(200).json({ status: 'PROCEED_RESUME' });
        }
        return res.status(200).json({
            status: 'CONFLICT',
            previousRole: session.roleType,
            previousDifficulty: session.difficulty
        });
    } catch (error) {
        console.error("[VALIDATE SESSION API ERROR]:", error);
        return res.status(500).json({ error: "Pre-flight handshake parameters mapping collapsed." });
    }
};

exports.abandonSession = async (req, res) => {
    try {
        const activeSessionId = await redisService.getActiveSession(req.user._id.toString());
        if (activeSessionId) {
            await interviewService.finalizeSession(activeSessionId, req.user._id, true);
            return res.status(200).json({ success: true, message: "Stale execution pipeline dropped cleanly." });
        }
    } catch (error) {
        console.error("[ABANDON SESSION API ERROR]:", error);
        return res.status(500).json({ error: "Forced reset operations sequence failed." });
    }
};