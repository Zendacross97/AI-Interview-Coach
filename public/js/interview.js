const token = localStorage.getItem('token');
let activeResumeId = null;
let socket = null;
let userIsPremium = false;
let userTotalInterviewsCount = 0;
let isSessionActive = false;
let quitSession = false;
let isHistoryOpen = false;
let cachedHistory = null;

window.addEventListener("DOMContentLoaded", async () => {
    if(!token) {
        window.location.href = '/'; 
        return;
    }
    document.getElementById('roleTypeSelect').value = "";
    document.getElementById('difficultySelect').value = "";
    await Promise.all([
        checkUserResumeAvailability(),
        checkUserProfileAndPremiumState()
    ]);
    if (userIsPremium) {
        prefetchPremiumHistoryCache();
    }
});

document.getElementById('uploadBtn').addEventListener('click', async () => {
    const resumeInput = document.getElementById('resumeInput');
    const statusMessage = document.getElementById('statusMessage');
    
    const file = resumeInput.files[0];
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
        const response = await axios.get('/interview/upload-resume-url', {
            headers: { Authorization: token }
        });
        const { uploadInstructionsUrl, permanentFileUrl, s3Key } = response.data;

        updateStatus('Authorization acquired. Uploading straight to AWS S3...', '');
        
        await axios.put(uploadInstructionsUrl, file, {
            headers: {
                'Content-Type': 'application/pdf'
            }
        });

        updateStatus('Saving document reference to database...', '');

        const dbSaveResponse = await axios.post('/interview/save-resume-metadata', {
            s3Key: s3Key,
            s3Url: permanentFileUrl
        }, {
            headers: { Authorization: token }
        });

        activeResumeId = dbSaveResponse.data.resumeId;

        updateStatus(`Resume successfully synchronized! You can start the interview.`, 'success');

        document.getElementById('sessionActionSection').style.display = 'block';

    } catch (error) {
        console.error(error);
        const errMsg = error.response?.data?.error || error.message || 'Upload transmission failed.';
        updateStatus(`Error: ${errMsg}`, 'error');
    }
});

document.getElementById('startInterviewBtn').addEventListener('click', async() => {
    if (!activeResumeId) {
        alert("Please complete the resume sync processing flow before starting.");
        return;
    }
    if (!userIsPremium && userTotalInterviewsCount >= 2) {
        alert("Free Tier Limit Exhausted: You have already taken your 2 complimentary mock sessions. Please upgrade to our Premium Plan to unlock unlimited interviews!");
        document.getElementById('premiumBanner').scrollIntoView({ behavior: 'smooth' });
        return;
    }
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
    try {
        const response = await axios.post('/interview/validate-session', { roleType, difficulty }, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.data.status === 'CONFLICT') {
            document.getElementById('prevRoleText').innerText = response.data.previousRole;
            document.getElementById('prevDiffText').innerText = response.data.previousDifficulty;
            document.getElementById('sessionConflictModal').style.display = 'flex';
        } else {
            initializeWebSocketSession();
        }
    } catch (error) {
        console.error("Session profile alignment checks dropped:", error);
        alert("An authorization or infrastructure trace dropping issue occurred. Try again.");
    }
});

document.getElementById('viewHistoryBtn').addEventListener('click', togglePremiumHistoryPanel);

document.getElementById('endSessionBtn').addEventListener('click', () => {
    if (confirm("Are you sure you want to quit this interview session?")) {

        if (socket && socket.readyState === WebSocket.OPEN) {
            quitSession = true;
            isSessionActive = false;
            socket.send(JSON.stringify({ type: 'USER_EXPLICIT_QUIT' }));
            
            document.getElementById('endSessionBtn').disabled = true;
            document.getElementById('endSessionBtn').innerText = "Session Ended";
        }
    }
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    console.warn("Web Speech API is not supported in this browser. Hiding microphone utility.");
    document.getElementById('micBtn').style.display = 'none';
} else {
    const recognition = new SpeechRecognition();
    const micBtn = document.getElementById('micBtn');
    const chatInput = document.getElementById('chatInput');

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

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
        const voiceTranscript = event.results[0][0].transcript;
        
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
        micBtn.style.backgroundColor = "";
        chatInput.placeholder = "Type your response here...";
    }
};

document.getElementById('sendMsgBtn').addEventListener('click', sendCandidateResponse);

document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendCandidateResponse();
});

document.getElementById('btnContinuePrevious').addEventListener('click', () => {
    const prevRole = document.getElementById('prevRoleText').innerText;
    const prevDiff = document.getElementById('prevDiffText').innerText;

    document.getElementById('roleTypeSelect').value = prevRole;
    document.getElementById('difficultySelect').value = prevDiff;

    document.getElementById('sessionConflictModal').style.display = 'none';

    initializeWebSocketSession();
});

document.getElementById('btnStartNewConflict').addEventListener('click', async () => {
    try {
        document.getElementById('btnStartNewConflict').disabled = true;
        document.getElementById('btnStartNewConflict').innerText = "Clearing...";

        await axios.post('/interview/abandon-session', {}, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        document.getElementById('sessionConflictModal').style.display = 'none';
        
        initializeWebSocketSession();
    } catch (err) {
        console.error("Forced drop tracking sequence crashed down:", err);
        alert("Failed to drop your previous session tracking states safely. Please try again.");
    } finally {
        document.getElementById('btnStartNewConflict').disabled = false;
        document.getElementById('btnStartNewConflict').innerText = "Start New";
    }
});

async function checkUserProfileAndPremiumState() {
    try {
        const response = await axios.get('/user/profile-status', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const { isPremium, totalInterviewsCount } = response.data;
        
        userIsPremium = isPremium;
        userTotalInterviewsCount = totalInterviewsCount;

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
            
            document.getElementById('sessionActionSection').style.display = 'block';
            
            updateStatus('Previously uploaded resume loaded successfully! You can start the interview now, or upload a new PDF to replace it.', 'success');
        } else {
            document.getElementById('sessionActionSection').style.display = 'none';
            updateStatus('Please upload your resume in PDF format to initialize your profile.', '');
        }
    } catch (error) {
        console.error("Error verifying profile tracking parameters:", error);
    }
};

async function prefetchPremiumHistoryCache() {
    try {
        const response = await axios.get('/interview/premium-history', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.data && response.data.success) {
            cachedHistory = response.data.sessions;
        }
    } catch (err) {
        console.error("Background history cache pre-warm dropped:", err);
        cachedHistory = [];
    }
}

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

    const encodedRole = encodeURIComponent(roleType);
    const encodedDiff = encodeURIComponent(difficulty);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}?resumeId=${activeResumeId}&roleType=${encodedRole}&difficulty=${encodedDiff}`;

    let hasSessionEndedGracefully = false;

    socket = new WebSocket(wsUrl, token);

    socket.onopen = () => {
        console.log('Connected to real-time interview engine!');
        isSessionActive = true;
        const historyBtn = document.getElementById('viewHistoryBtn');
        historyBtn.disabled = true;
        historyBtn.innerText = "View Previous Sessions (Last 7 Days)";
        document.getElementById('historyScrollBox').style.display = 'none';
        isHistoryOpen = false;
        document.getElementById('uploadBtn').disabled = true;
        document.getElementById('resumeInput').disabled = true;
        document.getElementById('startInterviewBtn').disabled = true;
        document.getElementById('chatBox').style.display = 'block';
        appendChatMessage('System', `Secure connection established for ${roleType} (${difficulty}). Initiating Gemini Live pipeline...`);
        document.getElementById('sessionActionSection').style.display = 'none';
        document.getElementById('roleTypeSelect').disabled = true;
        document.getElementById('difficultySelect').disabled = true;
        document.getElementById('endSessionBtn').style.display = 'inline-block';
        document.getElementById('chatInput').disabled = false;
        document.getElementById('chatInput').placeholder = "";
        document.getElementById('sendMsgBtn').disabled = false;
        document.getElementById('micBtn').disabled = false;
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.error) {
            appendChatMessage('Error', data.error);
            return;
        }

        if (data.type === 'RECONNECTION_HISTORY') {
            const chatContainer = document.getElementById('chatLog'); 
            chatContainer.innerHTML = ''; 
            
            appendChatMessage('System', 'Interview session recovered. Restoring live logs...');
            
            data.transcript.forEach(turn => {
                const senderLabel = turn.sender === 'ai' ? 'Interviewer' : 'You';
                appendChatMessage(senderLabel, turn.text);
            });
            return;
        }

        if (data.type === 'SESSION_ENDED') {
            hasSessionEndedGracefully = true;
            isSessionActive = false;
            appendChatMessage('Interviewer', 'Generating your score-card in 3 secs...');
            if (data.fullSessionDocument && cachedHistory !== null) {
                cachedHistory.unshift(data.fullSessionDocument);
                
                if (cachedHistory.length > 7) {
                    cachedHistory = cachedHistory.slice(0, 7);
                }
            }
            setTimeout(() => renderFinalScorecard(data.overallScorecard), 4000)
            return;
        }

        appendChatMessage(data.sender === 'ai' ? 'Interviewer' : 'You', data.text);
    };

    socket.onerror = (error) => {
        console.error('WebSocket Connection Failure:', error);
        appendChatMessage('System', 'Connection rejected. Premium subscription credentials required.');
    };

    socket.onclose = (event) => {
        console.log('Secure session terminated cleanly.', event);
        isSessionActive = false;

        document.getElementById('roleTypeSelect').value = "";
        document.getElementById('difficultySelect').value = "";
        
        document.getElementById('chatInput').disabled = true;
        document.getElementById('sendMsgBtn').disabled = true;
        document.getElementById('micBtn').disabled = true;

        document.getElementById('viewHistoryBtn').disabled = false;
        document.getElementById('roleTypeSelect').disabled = false;
        document.getElementById('difficultySelect').disabled = false;
        document.getElementById('uploadBtn').disabled = false;
        document.getElementById('resumeInput').disabled = false;
        

        document.getElementById('sessionActionSection').style.display = 'block';
        document.getElementById('endSessionBtn').style.display = 'none';

        if (hasSessionEndedGracefully) {
            document.getElementById('sessionActionSection').style.display = 'none';
        } else if (quitSession) {
            document.getElementById('chatInput').placeholder = "Session disconnected.";
            quitSession = false;
            appendChatMessage('System', 'Your interview session is closing in 3 secs...');
            setTimeout(() => {
                document.getElementById('chatBox').style.display = 'none';
                document.getElementById('startInterviewBtn').disabled = false;
            }, 4000)
        } else if (event.code === 4002) {
            document.getElementById('chatInput').placeholder = "Quota Exhausted.";
            appendChatMessage('System', 'Your interview session is closing in 3 secs...');
            setTimeout(() => {
                document.getElementById('chatBox').style.display = 'none';
                document.getElementById('startInterviewBtn').disabled = false;
            }, 4000);
        } else if (event.code === 4003 || event.code === 1006 || event.code === 1011) {
            document.getElementById('chatInput').placeholder = "Connection reset.";
            appendChatMessage('System', 'The connection dropped unexpectedly while shifting pipeline environments.');
            appendChatMessage('System', 'Your interview session is closing in 3 secs...');
            alert("A momentary connection reset occurred while reclaiming your workspace. Please click 'Start Live AI Interview' once more to complete connection mapping.");
            setTimeout(() => {
                document.getElementById('chatBox').style.display = 'none';
                document.getElementById('startInterviewBtn').disabled = false;
            }, 4000);
        }
        else if (event.code === 4001) {
            alert("An active session is already running in another workspace interface tab.");
        }else {
            alert("You have completed 2 free interviews, please upgrade to Premium.");
        }
    };
};

function sendCandidateResponse() {
    const inputField = document.getElementById('chatInput');
    const text = inputField.value.trim();
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

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
    chatLog.scrollTop = chatLog.scrollHeight;
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
    document.getElementById('scorecardSection').style.display = 'block';

    document.getElementById('techScoreDisplay').innerText = `${scorecard.technicalScore}/10`;
    document.getElementById('commScoreDisplay').innerText = `${scorecard.communicationScore}/10`;
    document.getElementById('aiFeedbackDisplay').innerText = scorecard.aiSummaryFeedback || "No feedback summary compiled.";
};

async function togglePremiumHistoryPanel() {
    const scrollBox = document.getElementById('historyScrollBox');
    const toggleBtn = document.getElementById('viewHistoryBtn');

    if (!userIsPremium) {
        alert("Premium Membership Access Required: This feature is limited to Premium Tier subscribers.");
        document.getElementById('premiumBanner').scrollIntoView({ behavior: 'smooth' });
        return;
    }

    if (isSessionActive) {
        alert("Action Locked: You cannot browse interview histories while a live calibration session is running.");
        return;
    }

    if (isHistoryOpen) {
        scrollBox.style.display = 'none';
        toggleBtn.innerText = "View Previous Sessions (Last 7 Days / Max 7 Completed)";
        isHistoryOpen = false;
    } else {
        if (cachedHistory === null) {
            await prefetchPremiumHistoryCache();
        }
        renderHistoryFromCache();
    }
};

async function renderHistoryFromCache() {
    const container = document.getElementById('historyItemsContainer');
    const scrollBox = document.getElementById('historyScrollBox');
    const toggleBtn = document.getElementById('viewHistoryBtn');

    scrollBox.style.display = 'block';
    toggleBtn.innerText = "Close History Panel";
    isHistoryOpen = true;

    container.innerHTML = '';

    if (!cachedHistory || cachedHistory.length === 0) {
        container.innerHTML = "<p class='history-empty-msg'>No matching completed historical interviews found on record.</p>";
        return;
    }

    cachedHistory.forEach((session, index) => {
        const dateStr = new Date(session.endedAt || session.createdAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const card = document.createElement('div');
        card.className = 'history-card';
        card.innerHTML = `
            <div class="history-header">
                <span class="history-title">Session #${index + 1} &bull; ${dateStr}</span>
                <div class="history-scores">
                    <span class="badge-tech">Tech: ${session.overallScorecard.technicalScore}/10</span>
                    <span class="badge-comm">Comm: ${session.overallScorecard.communicationScore}/10</span>
                </div>
            </div>
            <div class="history-feedback">
                <strong>AI Feedback Summary:</strong> ${session.overallScorecard.aiSummaryFeedback || 'No performance data compiled.'}
            </div>
            <button class="toggle-log-btn" data-target="log-${session._id}">▶ Expand Conversation Log</button>
            
            <div id="log-${session._id}" class="history-transcript">
                ${session.transcript.map(turn => `
                    <div class="history-turn">
                        <strong class="${turn.sender === 'ai' ? 'turn-ai' : 'turn-user'}">${turn.sender === 'ai' ? 'INTERVIEWER' : 'YOU'}:</strong>
                        <span>${turn.text}</span>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.toggle-log-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const logBox = document.getElementById(targetId);
            
            if (logBox.style.display === 'block') {
                logBox.style.display = 'none';
                e.target.innerText = "▶ Expand Conversation Log";
            } else {
                logBox.style.display = 'block';
                e.target.innerText = "▼ Collapse Conversation Log";
            }
        });
    });
};