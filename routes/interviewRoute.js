const express = require('express');
const router = express.Router();
const authenticator = require('../middlewares/auth');
const interviewController = require('../controllers/interviewController');

router.get('/', interviewController.getInterviewPage);
router.get('/check-resume', authenticator.authenticate, interviewController.checkExistingResume);
router.get('/upload-resume-url', authenticator.authenticate, interviewController.uploadresume);
router.post('/save-resume-metadata', authenticator.authenticate, interviewController.saveResumeMetadata);
router.get('/premium-history', authenticator.authenticate, interviewController.getPreviousSessions);
router.post('/validate-session', authenticator.authenticate, interviewController.validateSession);
router.post('/abandon-session', authenticator.authenticate, interviewController.abandonSession);

module.exports = router;