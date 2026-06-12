const AwsServices = require('../services/awsServices');
const resumeService = require('../services/resumeService');
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
         // Instead of waiting for a file buffer, we just need a name context.
        // We create a unique name using the user's database ID.
        const filename = `resumes/${req.user._id}/resume.pdf`;
        
        // Get our secure temporary uploading instructions from the service
        const { presignedUrl, s3FileUrl } = await AwsServices.getPresignedUploadUrl(filename);

        // Send both back to the client. 
        // The client uses 'presignedUrl' to upload, and your app tracks 's3FileUrl' in MongoDB
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