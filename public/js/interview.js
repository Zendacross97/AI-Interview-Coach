const token = localStorage.getItem('token');
let activeResumeId = null; // Globally captures resume identifier mapping state
let socket = null;
let userIsPremium = false;
let userTotalInterviewsCount = 0;
let isSessionActive = false;

window.addEventListener("DOMContentLoaded", async () => {
    if(!token) {
        window.location.href = '/'; 
        return;
    }
    await Promise.all([
        checkUserResumeAvailability(),
        checkUserProfileAndPremiumState()
    ]);
});

async function checkUserProfileAndPremiumState() {
    try {
        const response = await axios.get('/user/profile-status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const { isPremium, totalInterviewsCount } = response.data;
        
        // Populate system-wide context scopes
        userIsPremium = isPremium;
        userTotalInterviewsCount = totalInterviewsCount;

        // Clean up UI instantly if user is already a premium holder
        if (userIsPremium) {
            const premiumBanner = document.getElementById('premiumBanner');
            if (premiumBanner) {
                premiumBanner.style.display = 'none';
            }
        }
    } catch (err) {
        console.error("Failed to parse membership rules profile data mapping:", err);
    }
};

async function checkUserResumeAvailability() {
    try {
        const response = await axios.get('/interview/check-resume', {
            headers: { Authorization: token }
        });
        
        if (response.data.hasResume) {
            activeResumeId = response.data.resumeId;
            
            // Expose the start action panels right away
            document.getElementById('sessionActionSection').style.display = 'block';
            
            // Inform the user they can proceed or overwrite
            updateStatus('Previously uploaded resume loaded successfully! You can start the interview now, or upload a new PDF to replace it.', 'success');
        } else {
            // New user workflow fallback
            document.getElementById('sessionActionSection').style.display = 'none';
            updateStatus('Please upload your resume in PDF format to initialize your profile.', '');
        }
    } catch (error) {
        console.error("Error verifying profile tracking parameters:", error);
    }
};

document.getElementById('uploadBtn').addEventListener('click', async () => {
    const resumeInput = document.getElementById('resumeInput');
    const statusMessage = document.getElementById('statusMessage');
    
    const file = resumeInput.files[0];
   // Validation check
    if (!file) {
        updateStatus('Please select a PDF file first.', 'error');
        return;
    }
    if (file.type !== 'application/pdf') {
        updateStatus('Invalid format. Please upload a PDF file.', 'error');
        return;
    }

    updateStatus('Generating secure upload parameters...', '');

    try {
        // Step 1: Request presigned generation credentials from Express gateway
        const response = await axios.get('/interview/upload-resume-url', {
            headers: { Authorization: token }
        });
        const { uploadInstructionsUrl, permanentFileUrl, s3Key } = response.data;

        updateStatus('Authorization acquired. Uploading straight to AWS S3...', '');
        
        // Step 2: Use Axios to stream the binary file directly to S3
        // CRITICAL: S3 Presigned PUT uploads require a clean configuration without standard auth headers
        await axios.put(uploadInstructionsUrl, file, {
            headers: {
                'Content-Type': 'application/pdf'
            }
        });

        updateStatus('Saving document reference to database...', '');

        // Step 3: Tell your database that the file successfully uploaded to S3
        // (Creates a new endpoint route mapping: app.post('/user/save-resume-metadata', ...))
        const dbSaveResponse = await axios.post('/interview/save-resume-metadata', {
            s3Key: s3Key,
            s3Url: permanentFileUrl
        }, {
            headers: { Authorization: token }
        });

        // Capture the validated database reference ID returned by your updated controller
        activeResumeId = dbSaveResponse.data.resumeId;

        updateStatus(`Resume successfully synchronized! Ready for interview calibration.`, 'success');

        // Expose start engine buttons controls smoothly
        document.getElementById('sessionActionSection').style.display = 'block';

    } catch (error) {
        console.error(error);
        const errMsg = error.response?.data?.error || error.message || 'Upload transmission failed.';
        updateStatus(`Error: ${errMsg}`, 'error');
    }
});

// Bind launch simulation trigger configuration metrics
document.getElementById('startInterviewBtn').addEventListener('click', () => {
    if (!activeResumeId) {
        alert("Please complete the resume sync processing flow before starting.");
        return;
    }
    if (!userIsPremium && userTotalInterviewsCount >= 2) {
        alert("Free Tier Limit Exhausted: You have already taken your 2 complimentary mock sessions. Please upgrade to our Premium Plan to unlock unlimited interviews!");
        document.getElementById('premiumBanner').scrollIntoView({ behavior: 'smooth' });
        return;
    }
    initializeWebSocketSession();
});

document.getElementById('endSessionBtn').addEventListener('click', () => {
    if (confirm("Are you sure you want to end this interview session?")) {
        if (socket) {
            socket.close();
        }
    }
});

function initializeWebSocketSession() {
    const roleType = document.getElementById('roleTypeSelect').value;
    const difficulty = document.getElementById('difficultySelect').value;

    if (!roleType || roleType === "") {
        alert("Please explicitly select a Target Job Role before entering calibration.");
        document.getElementById('roleTypeSelect').focus();
        return;
    }

    if (!difficulty || difficulty === "") {
        alert("Please explicitly choose your Interview Difficulty tier.");
        document.getElementById('difficultySelect').focus();
        return;
    }

    // Build absolute query target endpoint parameter configurations
    const encodedRole = encodeURIComponent(roleType);
    const encodedDiff = encodeURIComponent(difficulty);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?resumeId=${activeResumeId}&roleType=${encodedRole}&difficulty=${encodedDiff}`;

    let hasSessionEndedGracefully = false;

    socket = new WebSocket(wsUrl, token);

    // Fired when the backend handshake authorizes access
    socket.onopen = () => {
        console.log('Connected to real-time interview engine!');
        isSessionActive = true;
        document.getElementById('startInterviewBtn').disabled = true;
        document.getElementById('chatBox').style.display = 'block';
        appendChatMessage('System', `Secure connection established for ${roleType} (${difficulty}). Initiating Gemini Live pipeline...`);
        document.getElementById('sessionActionSection').style.display = 'none';
        document.getElementById('roleTypeSelect').disabled = true;
        document.getElementById('difficultySelect').disabled = true;
        document.getElementById('endSessionBtn').style.display = 'inline-block';
        document.getElementById('chatInput').disabled = false;
        document.getElementById('sendMsgBtn').disabled = false;
    };

    // Fired when data chunks roll down the pipeline from your Node server
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            appendChatMessage('Error', data.error);
            return;
        }

        if (data.type === 'SESSION_ENDED') {
            hasSessionEndedGracefully = true;
            isSessionActive = false;
            appendChatMessage('Interviewer', 'Generating your score-card in 4 secs...');
            renderFinalScorecard(data.overallScorecard);
            return;
        }

        appendChatMessage(data.sender === 'ai' ? 'Interviewer' : 'You', data.text);
    };

    // Fired if the server rejects the connection (e.g., Premium wall triggers a 403)
    socket.onerror = (error) => {
        console.error('WebSocket Connection Failure:', error);
        appendChatMessage('System', 'Connection rejected. Premium subscription credentials required.');
    };

    socket.onclose = (event) => {
        console.log('Secure session terminated cleanly.', event);
        
        // UI Feedback: Disable input so user knows the session is over
        document.getElementById('chatInput').disabled = true;
        document.getElementById('sendMsgBtn').disabled = true;
        document.getElementById('micBtn').disabled = true;

        // Re-enable dropdown configs for a fresh initialization session attempt
        document.getElementById('roleTypeSelect').disabled = false;
        document.getElementById('difficultySelect').disabled = false;

        // Optional: Bring back the start button if they want to try reconnecting
        document.getElementById('sessionActionSection').style.display = 'block';
        document.getElementById('endSessionBtn').style.display = 'none';

        // If the backend blocked the handshake, currentSession._id wouldn't even be initialized.
        if (hasSessionEndedGracefully) {
            // Case A: The interview finished perfectly and rendered the scorecard
            document.getElementById('chatInput').placeholder = "Session completed successfully.";
        } else if (isSessionActive) {
            // Case B: The interview was ongoing but the connection unexpectedly dropped mid-way
            document.getElementById('chatInput').placeholder = "Session disconnected.";
            isSessionActive = false;
            setTimeout(() => {
                document.getElementById('chatBox').style.display = 'none';
                document.getElementById('startInterviewBtn').disabled = false;
            }, 3000)
        } else {
            // Case C: Handshake was rejected by middleware.js
            document.getElementById('chatInput').placeholder = "Access Denied. Premium membership required.";
            alert("An error occurred establishing the session. If you have completed 2 free interviews, please upgrade to Premium.");
        }
    };
};

// Check browser compatibility
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    console.warn("Web Speech API is not supported in this browser. Hiding microphone utility.");
    document.getElementById('micBtn').style.display = 'none';
} else {
    const recognition = new SpeechRecognition();
    const micBtn = document.getElementById('micBtn');
    const chatInput = document.getElementById('chatInput');

    // Configure Recognition Parameters
    recognition.continuous = false; // Stop listening automatically when user pauses speaking
    recognition.interimResults = false; // Only care about the final polished transcript
    recognition.lang = 'en-US'; // Target language configuration

    // UI Feedback toggle when active
    let isListening = false;

    micBtn.addEventListener('click', () => {
        if (!isListening) {
            recognition.start();
        } else {
            recognition.stop();
        }
    });

    recognition.onstart = () => {
        isListening = true;
        micBtn.textContent = "Listening...";
        micBtn.style.backgroundColor = "#ffcc00";
        chatInput.placeholder = "Speaking into pipeline...";
    };

    recognition.onresult = (event) => {
        // Grab the text token from the speech engine results matrix
        const voiceTranscript = event.results[0][0].transcript;
        
        // Append it cleanly into your existing text box input field
        chatInput.value += (chatInput.value ? ' ' : '') + voiceTranscript;
    };

    recognition.onerror = (err) => {
        console.error("Speech Recognition Error occurred:", err.error);
        resetMicUI();
    };

    recognition.onend = () => {
        resetMicUI();
    };

    function resetMicUI() {
        isListening = false;
        micBtn.textContent = "Speak";
        micBtn.style.backgroundColor = ""; // Resets back to your standard stylesheet color
        chatInput.placeholder = "Type your response here...";
    }
};

// User text stream messaging submit events implementation helper hooks
document.getElementById('sendMsgBtn').addEventListener('click', sendCandidateResponse);
document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendCandidateResponse();
});

function sendCandidateResponse() {
    const inputField = document.getElementById('chatInput');
    const text = inputField.value.trim();
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

    // Send payload matching the exact upstream structure format expected by handler.js
    socket.send(JSON.stringify({ text }));
    appendChatMessage('You', text);
    inputField.value = '';
};

function appendChatMessage(sender, text) {
    const chatLog = document.getElementById('chatLog');
    const msgElement = document.createElement('div');
    msgElement.className = `chat-message ${sender === 'You' ? 'user-msg' : 'ai-msg'}`;
    msgElement.innerHTML = `<strong>${sender}:</strong> ${text}`;
    chatLog.appendChild(msgElement);
    chatLog.scrollTop = chatLog.scrollHeight; // Keep view auto-scrolled down
};

function updateStatus(text, className) {
    const statusMessage = document.getElementById('statusMessage');
    if(!statusMessage) return;
    statusMessage.textContent = text;
    statusMessage.className = ''; 
    if (className) {
        statusMessage.classList.add(className);
    }
}; 

function renderFinalScorecard(scorecard) {
    document.getElementById('chatBox').style.display = 'none';
    document.getElementById('sessionActionSection').style.display = 'none';    
    document.getElementById('scorecardSection').style.display = 'block';

    document.getElementById('techScoreDisplay').innerText = `${scorecard.technicalScore}/10`;
    document.getElementById('commScoreDisplay').innerText = `${scorecard.communicationScore}/10`;
    document.getElementById('aiFeedbackDisplay').innerText = scorecard.aiSummaryFeedback || "No feedback summary compiled.";
};