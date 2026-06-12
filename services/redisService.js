const Redis = require('ioredis');

// Connects to local Redis by default, or uses the environment variable if present
const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => console.log('Redis Cache Engine Connected Successfully'));
redis.on('error', (err) => console.error('Redis Cache Layer Offline or Refused Connection:', err.message));

module.exports = {
    // Save the user's active socket room/state mapping
    setActiveSession: async (userId, sessionId) => {
        try {
            // Set an expiration of 2 hours (7200 seconds) so old dead sessions clean up automatically
            await redis.set(`active_session:${userId}`, sessionId, 'EX', 7200);
        } catch (err) {
            // Log the error but don't crash the user's current session handshake
            console.error(`Failed to commit active session state map to Redis for user ${userId}:`, err.message);
        }
    },

    // Check if the user is already mid-interview
    getActiveSession: async (userId) => {
        try {
            return await redis.get(`active_session:${userId}`);
        } catch (err) {
            console.error(`Redis read operation failed for user ${userId}:`, err.message);
            return null; // Fallback to safe state assumptions
        }
    },

    // Remove session when they disconnect or finish
    removeActiveSession: async (userId) => {
       try {
            await redis.del(`active_session:${userId}`);
        } catch (err) {
            console.error(`Failed to clear active session state key from Redis for user ${userId}:`, err.message);
        }
    }
};