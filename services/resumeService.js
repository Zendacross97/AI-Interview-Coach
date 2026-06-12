const Resume = require('../model/resume');
const geminiService = require('./geminiService');
const awsService = require('./awsServices');

exports.getResumeData = async (userId) => {
    return await Resume.findOne({ userId });
};

exports.updateResume = async (userId, s3Key, s3Url) => {
    try {
        console.log(`[Ingestion Core] Commencing resume process sync pipeline for User: ${userId}`);
        // 1. Fetch the PDF from S3 immediately
        const buffer = await awsService.getResumeBuffer(s3Key);

        // 2. Extract Text and Skills via Gemini
        const { markdown, skills } = await geminiService.parseResumeDirectly(buffer);
        
        // 3. Upsert to DB with the REAL data
        const updatedRecord = await Resume.findOneAndUpdate(
            { userId },
            {
                s3Key,
                s3Url,
                parsedText: markdown, // Will be parsed later via Gemini
                skillsTracked: skills
            },
            { upsert: true, returnDocument: 'after' }
        );
        console.log(`[Ingestion Core] Database mapping successful for Record Reference: ${updatedRecord._id}`);
        return updatedRecord;
    } catch (error) {
        console.error('Error in updateResume ingestion:' + error);
        throw error;
    }
};

exports.getResumeContextForAI = async (userId) => {
    try {
        const resumeData = await Resume.findOne({ userId });
        if (resumeData && resumeData.parsedText) {
        return resumeData.parsedText;
    }
    
    return "No resume context available.";
    } catch (err) {
        console.error("Error in getResumeContextForAI:", err.message);
        return "Internal error retrieving resume context.";
    }
};