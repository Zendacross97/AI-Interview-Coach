const cron = require('node-cron');
const interviewSessionService = require('../services/interviewService');

cron.schedule('0 * * * *', async () => {
    console.log('[CRON EXECUTION] Starting automated cleanup for stale ghost sessions...');
    try {
        const modifiedCount = await interviewSessionService.cleanupAbandonedSessions(2); 
        console.log(`[CRON SUCCESS] Successfully swept and marked ${modifiedCount} dead sessions as abandoned.`);
    } catch (error) {
        console.error("[CRON ERROR] Clean sweep operation failed:", error.message);
    }
});

cron.schedule('0 0 * * *', async () => {
    console.log('[CRON EXECUTION] Running daily 7-day retention database purge sequence...');
    
    try {
        const retentionDays = 7;
        const deletedCount = await interviewSessionService.purgeSessionsOlderThanDays(retentionDays);
        
        console.log(`[CRON SUCCESS] Database maintenance complete. Permanently cleared ${deletedCount} sessions older than 7 days.`);
    } catch (error) {
        console.error('[CRON ERROR] High-priority 7-day session retention purge failed:', error.message);
    }
});