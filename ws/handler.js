const resumeService = require('../services/resumeService');
const interviewSessionService = require('../services/interviewService');
const geminiService = require('../services/geminiService');
const userService = require('../services/userServices');
const redisService = require('../services/redisService');

const activeLiveTunnels = new Map();

exports.handleSocketConnection = async (ws, request, user) => {
    const userIdString = user._id.toString();
    console.log(`Real-time tunnel active for: ${user.name}`);

    if (activeLiveTunnels.has(userIdString)) {
        console.log(`Handshake Blocked: ${user.name} attempted a true simultaneous connection.`);
        ws.send(JSON.stringify({ error: "An active session connection is already open in another window or tab." }));
        ws.close(4001);
        return;
    }

    activeLiveTunnels.set(userIdString, ws);

    const { resumeId, roleType, difficulty } = ws.dynamicConfig;
    const resumeContext = await resumeService.getResumeContextForAI(user._id);

    let currentSession = null;
    let isReconnection = false;

    try {
        const existingSessionId = await redisService.getActiveSession(user._id.toString());

        if (existingSessionId) {
            console.log(`Active session footprint [${existingSessionId}] found in Redis. Initializing recovery flow...`);
            currentSession = await interviewSessionService.getSessionById(existingSessionId);
            
            if (currentSession && currentSession.status === 'active') {
                isReconnection = true;
                ws.dynamicConfig.roleType = currentSession.roleType;
                ws.dynamicConfig.difficulty = currentSession.difficulty;
            }
        }

        if (!currentSession || currentSession.status !== 'active') {
            if (existingSessionId) {
                console.warn(`Stale tracking key found for user ${user._id} but no active document exists. Clearing Redis lock.`);
                await redisService.removeActiveSession(user._id.toString());
            }
            console.log("No live session history cached. Constructing a fresh pipeline...");
            currentSession = await interviewSessionService.initializeSession(user._id, resumeId, roleType, difficulty);
        }

    } catch (error) {
        console.error("Critical error mapping session states:", error.message);
        activeLiveTunnels.delete(userIdString);
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ error: "System initialization failed. Please try again." }));
            ws.close();
        }
        return;
    }

    const streamToClient = async (session) => {
        let fullResponseText = "";

        for await (const chunk of session.receive()) {
            const aiText = chunk.serverContent?.modelTurn?.parts?.[0]?.text;
            if (aiText) {
                fullResponseText += aiText;
                ws.send(JSON.stringify({ sender: 'ai', text: aiText }));
                await interviewSessionService.logMessageToTranscript(currentSession._id, 'ai', aiText);
            }
        }
        const lowerText = fullResponseText.toLowerCase();
        if (
            lowerText.includes("this interview is concluded") ||
            lowerText.includes("that concludes our interview") ||
            lowerText.includes("conclude the interview") || 
            lowerText.includes("thank you for your time") ||
            lowerText.includes("interview is over")
        ) {
            console.log("AI triggered an explicit conclusion criteria. Closing real-time tunnel.");           
            try {
                const updatedSession = await interviewSessionService.finalizeSession(currentSession._id, user._id, false);
                
                const candidateAnswers = updatedSession?.transcript.filter(turn => turn.sender === 'candidate') || [];
                if (candidateAnswers.length >= 1) {
                    await userService.updateInterviewCount(user._id);
                }

                if (ws.readyState === ws.OPEN && updatedSession) {
                    const dynamicSessionPayload = updatedSession.toObject ? updatedSession.toObject() : updatedSession;
                    ws.send(JSON.stringify({
                        type: 'SESSION_ENDED',
                        overallScorecard: updatedSession.overallScorecard,
                        fullSessionDocument: dynamicSessionPayload
                    }));
                    
                    console.log("Scorecard delivered successfully. Dropping socket tunnel.");
                    ws.close();
                }
            } catch (error) {
                console.error("Delayed finalization dispatch collapsed:", error.message);
                ws.close();
            }
        }
    };

    let geminiSession = null;
    const MAX_RETRIES = 3;
    let attempt = 0;
    while (attempt < MAX_RETRIES && !geminiSession) {
        try {
            attempt++;
            console.log(`Initializing Gemini Stream Session (Attempt ${attempt}/${MAX_RETRIES})...`);
            geminiSession = await geminiService.startLiveInterviewStream(resumeContext);
            
            if (isReconnection) {
                console.log("Re-synchronizing previous history context into new Gemini stream pipeline...");
                
                ws.send(JSON.stringify({
                    type: 'RECONNECTION_HISTORY',
                    transcript: currentSession.transcript
                }));

                await geminiSession.send({ 
                    text: `[SYSTEM CONNECTION RESTORED] The candidate was disconnected momentarily. Here is the exact history context of our ongoing interview conversation: ${JSON.stringify(currentSession.transcript)}. Please remain in your persona as 'Sharpener' and seamlessly resume by evaluating their last answer or asking your next intended question.`
                });
                
                await streamToClient(geminiSession);
            } else {
                await geminiSession.send({ text: `Hello! Please introduce yourself and start the interview for a ${difficulty} ${roleType} position.`});
                await streamToClient(geminiSession);
            }
        } catch (err) {
            console.error(`Gemini Stream Bootstrap Attempt ${attempt} Failed:`, err.message);
            
           const isRetryable = 
            err.message.includes("503") || 
            err.message.includes("UNAVAILABLE") || 
            err.message.includes("fetch failed") || 
            err.message.includes("undici");

            if (isRetryable && attempt < MAX_RETRIES) {
                const delayTime = attempt * 2000;
                console.warn(`Transient network/API error. Retrying in ${delayTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayTime));
                continue; 
            }            
            console.log(`Retries exhausted on attempt ${attempt}. Dropping socket interface cleanly without altering state.`);

            if (geminiSession) {
                geminiSession.close();
                geminiSession = null;
            }

            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ error: "The AI interviewer is currently facing high capacity demands. Please wait a moment and click 'Start' again." }));
                ws.close();
            }
            return;
        }
    }

    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    const heartbeatInterval = setInterval(() => {
        if (ws.isAlive === false) {
            console.log(`Ping timeout detected for ${user.name}. Closing connection connection cleanly.`);
            clearInterval(heartbeatInterval);
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping();
    }, 30000);

    ws.on('message', async (messageBuffer) => {
        try {
            const rawMessage = messageBuffer.toString();
            const parsedData = JSON.parse(rawMessage);
            if (parsedData.type === 'USER_EXPLICIT_QUIT') {
                console.log(`User ${user.name} explicitly quit session.`);
                
                if (geminiSession) {
                    geminiSession.close();
                    geminiSession = null;
                }

                await interviewSessionService.finalizeSession(currentSession._id, user._id, true);

                if (ws.readyState === ws.OPEN) {
                    ws.close();
                }
                return;
            }
            if (!parsedData.text) return;

            await interviewSessionService.logMessageToTranscript(currentSession._id, 'candidate', parsedData.text);
            
            try {
                await geminiSession.send({ text: parsedData.text });
                await streamToClient(geminiSession);
            } catch (streamErr) {
                console.error("Mid-stream connection error:", streamErr.message);

                const errString = streamErr.message.toUpperCase();
                if (errString.includes("429") || errString.includes("RESOURCE_EXHAUSTED")) {
                    ws.send(JSON.stringify({ 
                        sender: 'ai', 
                        text: "[System Notice: The AI Interviewer has reached its maximum daily capacity. Please try again in 24 hours or upgrade your API plan.]" 
                    }));
                    await interviewSessionService.finalizeSession(currentSession._id, user._id, true);

                    if (ws.readyState === ws.OPEN) {
                        ws.close();
                    }
                    return;
                }
            
                ws.send(JSON.stringify({ 
                    sender: 'ai', 
                    text: "[System Notice: The AI server experienced a momentary connection dropout. Please copy your last response and try sending it again in a few seconds.]" 
                }));
                
                console.log("Attempting mid-session stream recovery...");
                if (geminiSession) geminiSession.close();
                
                geminiSession = await geminiService.startLiveInterviewStream(resumeContext);
                
                const freshSessionData = await interviewSessionService.getSessionById(currentSession._id);
                await geminiSession.send({ 
                    text: `SYSTEM RECOVERY NOTICE: The connection was reset. Here is the interview history so far: ${JSON.stringify(freshSessionData.transcript)}. Please seamlessly resume the interview based on the last question asked or the candidate's last input.`
                });

                await streamToClient(geminiSession);
                console.log("Mid-session recovery completed successfully.");               
            }
        } catch (err) {
            console.error("Upstream processing breakdown exception:", err.message);
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ error: "Client-gateway transmission error. Start the interview again to resume from where you left." }));
                ws.close();
            }
        }
    });

    ws.on('close', async () => {
        console.log(`Pipeline session cleaning down for: ${user.name}`);
        clearInterval(heartbeatInterval);

        if (activeLiveTunnels.get(userIdString) === ws) {
            activeLiveTunnels.delete(userIdString);
        }

        if (geminiSession) {
            geminiSession.close();
            geminiSession = null;
        }
    });
};