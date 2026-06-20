const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => console.log('Redis Cache Engine Connected Successfully'));
redis.on('error', (err) => console.error('Redis Cache Layer Offline or Refused Connection:', err.message));

module.exports = {
    setActiveSession: async (userId, sessionId) => {
        try {
            await redis.set(`active_session:${userId}`, sessionId, 'EX', 7200);
        } catch (err) {
            console.error(`Failed to commit active session state map to Redis for user ${userId}:`, err.message);
        }
    },

    getActiveSession: async (userId) => {
        try {
            return await redis.get(`active_session:${userId}`);
        } catch (err) {
            console.error(`Redis read operation failed for user ${userId}:`, err.message);
            return null;
        }
    },

    removeActiveSession: async (userId) => {
       try {
            await redis.del(`active_session:${userId}`);
        } catch (err) {
            console.error(`Failed to clear active session state key from Redis for user ${userId}:`, err.message);
        }
    }
};