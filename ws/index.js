const { WebSocketServer } = require('ws');
const url = require('url'); // Native Node utility
const { authenticateSocketUpgrade } = require('./middleware');
const { handleSocketConnection } = require('./handler');

let wss = null;

const ALLOWED_ROLES = ['Full Stack Engineer', 'Backend Developer', 'Frontend Developer', 'DevOps Engineer'];
const ALLOWED_DIFFICULTIES = ['Junior', 'Mid', 'Senior/Staff'];

exports.initWebSocketGateway = (httpServer) => {
    // Initialize the cluster attached directly onto our existing HTTP server instance
    wss = new WebSocketServer({ noServer: true });

    // Intercept standard HTTP network layer upgrade requests
    httpServer.on('upgrade', async (request, socket, head) => {
        const authContext = await authenticateSocketUpgrade(request, socket);
        if (!authContext) return; 

        const { user, token } = authContext;

        // Parse query parameter strings from incoming request target URL references
        const parsedUrl = url.parse(request.url, true);
        const { resumeId, roleType, difficulty } = parsedUrl.query;

        if (!resumeId) {
            socket.write('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nMissing mandatory resume reference identifier.\r\n');
            socket.destroy();
            return;
        }

        if (!roleType || !ALLOWED_ROLES.includes(roleType)) {
            socket.write('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nInvalid or unsupported Target Job Role configured.\r\n');
            socket.destroy();
            return;
        }

        if (!difficulty || !ALLOWED_DIFFICULTIES.includes(difficulty)) {
            socket.write('HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\n\r\nInvalid or unsupported Seniority Tier configured.\r\n');
            socket.destroy();
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            // Re-assign active protocol assignment metadata signature back to internal client layers
            ws.protocol = token; 
            ws.dynamicConfig = { resumeId, roleType, difficulty };
            wss.emit('connection', ws, request, user);
        });
    });

    // Register our events to listen once structural upgrade handshakes clear out
    wss.on('connection', (ws, request, user) => {
        handleSocketConnection(ws, request, user);
    });

    console.log('Modular Real-Time Socket Router Gateway Configured Successfully');
    return wss;
};