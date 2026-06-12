const resumeService = require('../services/resumeService');
const interviewSessionService = require('../services/interviewService');
const geminiService = require('../services/geminiService');
const userService = require('../services/userServices');

exports.handleSocketConnection = async (ws, request, user) => {
    console.log(`Real-time tunnel active for: ${user.name}`);

    // Read parameters passed from the upgrade listener configuration object setup
    const { resumeId, roleType, difficulty } = ws.dynamicConfig;
    const currentSession = await interviewSessionService.initializeSession(user._id, resumeId, roleType, difficulty);
    const resumeContext = await resumeService.getResumeContextForAI(user._id);

    //Streams tokens from Gemini to Browser & DB
    const streamToClient = async (session) => {
        let fullResponseText = "";

        for await (const chunk of session.receive()) {
            const aiText = chunk.serverContent?.modelTurn?.parts?.[0]?.text;
            if (aiText) {
                fullResponseText += aiText;
                // Send to browser UI
                ws.send(JSON.stringify({ sender: 'ai', text: aiText }));
                // Persist to MongoDB
                await interviewSessionService.logMessageToTranscript(currentSession._id, 'ai', aiText);
            }
        }
        //Check if the AI wrapped up or failed the candidate
        const lowerText = fullResponseText.toLowerCase();
        if (
            lowerText.includes("That concludes our interview") ||
            lowerText.includes("conclude the interview") || 
            lowerText.includes("thank you for your time") ||
            lowerText.includes("interview is over")
        ) {
            console.log("AI triggered an explicit conclusion criteria. Closing real-time tunnel.");
            
            // Give the user 4 seconds to view the final text block while calculating scores
            setTimeout(async () => {
                try {
                    // Calculate scores and finalize *before* closing the socket connection
                    const updatedSession = await interviewSessionService.finalizeSession(currentSession._id, user._id, false);
                    
                    const candidateAnswers = updatedSession?.transcript.filter(turn => turn.sender === 'candidate') || [];
                    if (candidateAnswers.length >= 1) {
                        await userService.updateInterviewCount(user._id);
                    }

                    // If the user hasn't closed their browser tab, dispatch the payload
                    if (ws.readyState === ws.OPEN && updatedSession) {
                        ws.send(JSON.stringify({
                            type: 'SESSION_ENDED',
                            overallScorecard: updatedSession.overallScorecard,
                        }));
                        
                        console.log("Scorecard delivered successfully. Dropping socket tunnel.");
                        ws.close();
                    }
                } catch (error) {
                    console.error("Delayed finalization dispatch collapsed:", error.message);
                    ws.close();
                }
            }, 4000);
        }
    };

    // 2. Initialize Gemini Stream Session using Service
    let geminiSession = null;
    const MAX_RETRIES = 3;
    let attempt = 0;
    while (attempt < MAX_RETRIES && !geminiSession) {
        try {
            attempt++;
            console.log(`Initializing Gemini Stream Session (Attempt ${attempt}/${MAX_RETRIES})...`);
            geminiSession = await geminiService.startLiveInterviewStream(resumeContext);
            
            // Kick off the interview interaction if successful
            await geminiSession.send({ text: `Hello! Please introduce yourself and start the interview for a ${difficulty} ${roleType} position.`});
            await streamToClient(geminiSession);
        } catch (err) {
            console.error(`Gemini Stream Bootstrap Attempt ${attempt} Failed:`, err.message);
            
           const isRetryable = 
            err.message.includes("503") || 
            err.message.includes("UNAVAILABLE") || 
            err.message.includes("fetch failed") || 
            err.message.includes("undici"); // undici is the engine behind Node's fetch

            if (isRetryable && attempt < MAX_RETRIES) {
                const delayTime = attempt * 2000; // Increased delay to 2s, 4s
                console.warn(`Transient network/API error. Retrying in ${delayTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayTime));
                continue; 
            }            
            console.log(`Retries exhausted or critical error reached on attempt ${attempt}. Shutting down cleanly...`);
            try {
                await interviewSessionService.finalizeSession(currentSession._id, user._id, true);
            } catch (finalErr) {
                console.error("Emergency session finalization crash:", finalErr.message);
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
     // Send a "PING" every 30 seconds to the browser
    const heartbeatInterval = setInterval(() => {
        if (ws.isAlive === false) {
            console.log(`Ping timeout detected for ${user.name}. Closing connection connection cleanly.`);
            clearInterval(heartbeatInterval);
            return ws.terminate();
        }
        
        ws.isAlive = false;
        ws.ping(); // Built-in WebSocket frame ping
    }, 30000); // 30 seconds

    // UPSTREAM: Browser ➔ AI
    ws.on('message', async (messageBuffer) => {
        try {
            const rawMessage = messageBuffer.toString();
            const parsedData = JSON.parse(rawMessage);
            if (!parsedData.text) return;

            // Log incoming answer to DB transcript right away
            const updatedSessionWithCandidate = await interviewSessionService.logMessageToTranscript(currentSession._id, 'candidate', parsedData.text);
            
            // Dispatch to Gemini and handle temporary stream drops dynamically
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
                    // Since we can't recover from a quota hit, we close the session
                    await interviewSessionService.finalizeSession(currentSession._id, user._id, true);
                    ws.close();
                    return;
                }
                const isTransientNetworkError = 
                    errString.includes("503") || 
                    errString.includes("UNAVAILABLE") || 
                    errString.includes("FETCH FAILED") || 
                    errString.includes("UNDICI");
                
                if (isTransientNetworkError) {
                    // Alert the frontend user without closing the session socket pipe
                    ws.send(JSON.stringify({ 
                        sender: 'ai', 
                        text: "[System Notice: The AI server experienced a momentary connection dropout. Please copy your last response and try sending it again in a few seconds.]" 
                    }));
                    try {
                        console.log("Attempting mid-session stream recovery...");
                        // 2. Safely close old broken connection stream
                        if (geminiSession) geminiSession.close();
                        
                        // 3. Re-initialize a brand new session stream
                        geminiSession = await geminiService.startLiveInterviewStream(resumeContext);
                        
                        // 4. Feed the current transcript history back into the new session so it has context
                        const fullHistory = updatedSessionWithCandidate.transcript;
                        await geminiSession.send({ 
                            text: `SYSTEM RECOVERY NOTICE: The connection was reset. Here is the interview history so far: ${JSON.stringify(fullHistory)}. Please seamlessly resume the interview based on the last question asked or the candidate's last input.`
                        });

                        // 5. Stream the freshly generated response to the client
                        await streamToClient(geminiSession);
                        console.log("Mid-session recovery completed successfully.");
                        
                    } catch (recoveryError) {
                        console.error("Stream recovery failed:", recoveryError.message);
                        await interviewSessionService.finalizeSession(currentSession._id, user._id, true);
                        ws.send(JSON.stringify({ error: "The AI server is experiencing an extended outage. Please click 'Start New Session'." }));
                        ws.close();
                    }
                } else {
                    await interviewSessionService.finalizeSession(currentSession._id, user._id, true);
                    throw streamErr;
                }
            }
        } catch (err) {
            console.error("Critical Upstream routing failure:", err.message);
            ws.send(JSON.stringify({ error: "Critical gateway failure. Session closing down." }));
            ws.close();
        }
    });

    // Cleanup when user exits or loses connection
    ws.on('close', async () => {
        console.log(`Pipeline session cleaning down for: ${user.name}`);
        clearInterval(heartbeatInterval);
       try {
            //check if the session hasn't been finalized yet
            const activeSessionCheck = await interviewSessionService.getSessionById(currentSession._id);
            if (activeSessionCheck && activeSessionCheck.status === 'active') {
                const updatedSession = await interviewSessionService.finalizeSession(currentSession._id, user._id, false);
                const candidateAnswers = updatedSession?.transcript.filter(turn => turn.sender === 'candidate') || [];
                if (candidateAnswers.length >= 1) {
                    await userService.updateInterviewCount(user._id);
                }
            }
        } catch (evalError) {
            console.error("Fallback disconnect cleanup tracker failed:", evalError.message);
        }

        if (geminiSession) geminiSession.close();
    });
};