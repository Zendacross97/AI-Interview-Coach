const jwt = require('jsonwebtoken');
const User = require('../model/user');
const InterviewSession = require('../model/interview');

exports.authenticateSocketUpgrade = async (request, socket) => {
  try {
    // Extract token from the subprotocol header sent by the client browser
    const token = request.headers['sec-websocket-protocol'];
    if (!token) {
      console.log("Socket Upgrade Blocked: Missing subprotocol JWT payload.");
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return null;
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);

    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return null;
    }

    if (user.order.status !== 'SUCCESS') { 
      const completedSessionsCount = await InterviewSession.countDocuments({ 
        userId: user._id, 
        status: 'completed' 
      });

      const FREE_LIMIT = 2;
      if (completedSessionsCount >= FREE_LIMIT) {
        console.log(`Handshake Aborted: ${user.name} has exhausted free limits.`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return null;
      }
    }

    // Return user context if all safety checkpoints pass successfully
    return { user, token };
  } catch (err) {
    console.error('Socket Handshake Auth error:', err.message);
    socket.write('HTTP/1.1 401 Unauthorized\r\nContent-Type: text/plain\r\n\r\nInvalid or expired token.\r\n');
    socket.destroy();
    return null;
  }
};