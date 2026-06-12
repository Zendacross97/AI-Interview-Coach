const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

class GeminiInterviewSession {
    constructor(resumeContext) {
        this.resumeContext = resumeContext;
        this.chat = null;
        this.activeStream = null;
    }

    async initialize() {
        this.chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: `You are Sharpener, an elite, strict technical interviewer conducting a mock interview. 
                Do not use bracket placeholders like [Your Name] or [Interviewer Name] under any circumstances.
                Analyze this candidate's resume carefully: "${this.resumeContext}". 
                Conduct a turn-by-turn interview. Ask deep technical questions based on their stack, 
                wait for their response, and provide short, professional critiques when necessary before moving to the next question.
                Keep responses concise, conversational, and direct.`
            }
        });
    }

    async send(payload) {
        this.activeStream = await this.chat.sendMessageStream({
            message: payload.text
        });
        return this.activeStream;
    }

    async *receive() {
        if (!this.activeStream) return;
        
        for await (const chunk of this.activeStream) {
            yield {
                serverContent: {
                    modelTurn: {
                        parts: [{ text: chunk.text }]
                    }
                }
            };
        }
    }

    close() {
        console.log("Gemini stream thread session safely released.");
        this.chat = null;
        this.activeStream = null;
    }
}

exports.parseResumeDirectly = async (pdfBuffer) => {
    try {
        const prompt = `
            Analyze this resume PDF. Extract the following two items:
            1. "markdown": A full, clean Markdown version of the resume.
            2. "skills": An array of technical skills, frameworks, and languages found (e.g., ["React", "Node.js", "MongoDB", "Tailwind"]).
            
            Format the output as a JSON object with these two keys.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash', 
            contents: [
                {
                    inlineData: {
                        data: pdfBuffer.toString("base64"),
                        mimeType: "application/pdf"
                    }
                },
                { text: prompt }
            ],
            config: {
                responseMimeType: "application/json" 
            }
        });

        return JSON.parse(response.text);
    } catch (error) {
        console.error("Gemini Direct Parsing Failure:", error.message);
        throw error;
    }
};

exports.startLiveInterviewStream = async (resumeContext) => {
    const session = new GeminiInterviewSession(resumeContext);
    await session.initialize();
    return session;
};

exports.generateScorecard = async (transcriptArray) => {
    const cleanTranscriptText = transcriptArray
        .map(entry => `${entry.sender.toUpperCase()}: ${entry.text}`)
        .join('\n');

    const evaluationPrompt = `
        You are an expert technical interviewer summary compiler. 
        Analyze the following mock interview transcript thoroughly:
        
        ${cleanTranscriptText}
        
        Evaluate the candidate on their technical accuracy and communication efficiency.
        Provide a concise engineering critique summary.
    `;

    const responseSchema = {
        type: "OBJECT",
        properties: {
            technicalScore: { type: "INTEGER", description: "Score from 1-10 on technical precision." },
            communicationScore: { type: "INTEGER", description: "Score from 1-10 on articulating thoughts cleanly." },
            aiSummaryFeedback: { type: "STRING", description: "A professional 3-4 sentence performance breakdown summary." }
        },
        required: ["technicalScore", "communicationScore", "aiSummaryFeedback"]
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: evaluationPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            systemInstruction: "You compile highly precise tech scorecard metrics into JSON formats based explicitly on technical accuracy."
        }
    });

    return JSON.parse(response.text);
};