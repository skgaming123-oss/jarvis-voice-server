/**
 * Jarvis 24/7 Cloud Calling Server
 * Powered by Google Gemini Intelligence & Gemini Neural Voice TTS
 * Features:
 * - 100% Free Web-Based Live Voice Calling from ANY device / phone / browser
 * - Device-Specific Cloud Synchronization with the originating Jarvis Android App
 * - Full AI Brain matching the Jarvis App persona and intelligence
 * - Authentic Neural Voice Audio (audio/wav)
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const path = require('path');
const express = require('express');

const PORT = process.env.DEFAULT_APP_PORT || process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODELS = [
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash'
];

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Enable CORS for cross-device web call and app synchronization
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Serve Web Calling Interface from public directory
app.use(express.static(path.join(__dirname, 'public')));

// In-memory per-device synced history buffers
const deviceCallHistory = new Map();
// In-memory per-device conversation multi-turn memory
const deviceConversations = new Map();

/**
 * Returns formatted current date & time in Indian Standard Time (IST)
 */
function getCurrentIstContext() {
  try {
    const now = new Date();
    const options = { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' };
    return new Intl.DateTimeFormat('hi-IN', options).format(now);
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Direct Gemini AI Completion with multi-turn context and full Jarvis persona
 */
async function queryGeminiChat(userQuery, deviceId = 'default') {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_AI_STUDIO_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const currentDateContext = getCurrentIstContext();
  const sysInstruction = 
    `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the ultimate AI assistant, companion, and loyal advisor created by the user.
CURRENT REAL-WORLD TIME & DATE (IST): ${currentDateContext}.

CORE RULES & PERSONA:
1. IDENTITY: Your name is J.A.R.V.I.S. (जार्विस). You are deeply loyal, respectful, and devoted to the user, addressing them politely as "सर" (Sir) or "बॉस" (Boss).
2. NO REPETITIVE SELF-INTRODUCTIONS: NEVER say "Main Jarvis hoon", "I am Jarvis", or introduce yourself at the beginning of random queries unless the user specifically asks "tumhara naam kya hai" or "who are you".
3. TONE & LANGUAGE: Respond in natural, respectful, conversational Hindi (Devanagari script) or natural Hinglish. Keep speech clear, crisp, authoritative, and helpful.
4. COMPLETENESS: Never cut sentences halfway. Provide complete, coherent answers.
5. ACCURACY: Answer facts, dates, calculations, weather inquiries, and automation requests accurately.`;

  // Get recent turns for this device
  let history = deviceConversations.get(deviceId) || [];
  const contents = [];

  // Add past conversation turns
  for (const turn of history.slice(-6)) {
    contents.push({
      role: turn.role,
      parts: [{ text: turn.text }]
    });
  }

  // Add current query
  contents.push({
    role: 'user',
    parts: [{ text: userQuery }]
  });

  const payload = JSON.stringify({
    contents: contents,
    systemInstruction: { parts: [{ text: sysInstruction }] },
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 350
    }
  });

  for (const model of GEMINI_MODELS) {
    try {
      const resText = await new Promise((resolve, reject) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const req = https.request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.error) {
                return reject(new Error(json.error.message || `Model ${model} error`));
              }
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) resolve(text);
              else reject(new Error('Empty content from ' + model));
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
      });

      let text = resText.trim();
      // Remove any unwanted markdown headers/bullets for speech smoothness
      text = text.replace(/^#+\s+/gm, '').replace(/^\*\s+/gm, '').trim();

      // Clean redundant greeting prefix if generated accidentally
      text = text.replace(/^(?:नमस्ते\s+सर[,!]?\s*)?(?:मैं\s+जार्विस\s+हूँ|मेरा\s+नाम\s+जार्विस\s+है|main\s+jarvis\s+hoon|hello\s+main\s+jarvis\s+hoon)[,.\s:]*/i, '').trim();
      if (!text.startsWith('सर') && !text.startsWith('जी सर') && !text.startsWith('बिल्कुल') && !text.startsWith('नमस्ते')) {
        text = 'सर, ' + text;
      }

      // Update multi-turn history
      history.push({ role: 'user', text: userQuery });
      history.push({ role: 'model', text: text });
      if (history.length > 12) history = history.slice(-12);
      deviceConversations.set(deviceId, history);

      return text;
    } catch (err) {
      console.warn(`[Model Fallback] ${model} failed: ${err.message}, trying next...`);
    }
  }

  return 'जी सर, मैंने आपका निर्देश सुन लिया है। बताइए मैं आपकी क्या सेवा करूँ?';
}

/**
 * Generates pristine audio/wav speech using Gemini 3.8 Flash TTS with Puck neural voice
 */
function generateTtsAudio(textToSpeak) {
  return new Promise((resolve) => {
    if (!GEMINI_API_KEY) return resolve(null);

    const payload = JSON.stringify({
      contents: [{ parts: [{ text: textToSpeak }] }],
      generationConfig: {
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck'
            }
          }
        }
      }
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${GEMINI_API_KEY}`;
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const b64 = json.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          resolve(b64 || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

// Health & Status endpoint
app.get('/status', (req, res) => {
  res.json({
    service: 'Jarvis 24/7 Cloud Calling Server',
    status: 'ONLINE',
    model: GEMINI_MODELS[0],
    modelsAvailable: GEMINI_MODELS,
    hasKey: !!GEMINI_API_KEY,
    totalDevicesTracked: deviceCallHistory.size,
    systemTime: new Date().toISOString()
  });
});

/**
 * Returns initial greeting and neural audio for immediate call start
 */
app.get('/api/greeting', async (req, res) => {
  const deviceId = req.query.deviceId || 'default';
  const greetingText = 'नमस्ते सर, जार्विस उपस्थित है। हुक्म कीजिए, क्या सहायता करूँ?';
  const audioBase64 = await generateTtsAudio(greetingText);
  res.json({
    greeting: greetingText,
    audioBase64: audioBase64,
    deviceId: deviceId
  });
});

/**
 * 100% Free Web Call API endpoint
 * Generates natural answer + neural audio WAV
 * Syncs command directly into device's webCallHistory
 */
app.post('/api/chat-call', async (req, res) => {
  const query = req.body.query || '';
  const deviceId = req.body.deviceId || 'default';

  if (!query.trim()) {
    return res.status(400).json({ error: 'Query is empty' });
  }

  try {
    const answer = await queryGeminiChat(query, deviceId);
    const audioBase64 = await generateTtsAudio(answer);

    // Save to device history so the specific originating Android app can sync
    const record = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7),
      deviceId: deviceId,
      user: query.trim(),
      answer: answer,
      timestamp: Date.now()
    };

    if (!deviceCallHistory.has(deviceId)) {
      deviceCallHistory.set(deviceId, []);
    }
    const list = deviceCallHistory.get(deviceId);
    list.push(record);
    if (list.length > 60) list.shift();

    res.json({
      answer,
      audioBase64,
      deviceId,
      status: 'success'
    });
  } catch (err) {
    console.error('[Web Call Error]', err.message);
    const fallback = 'सर, कनेक्शन में थोड़ी समस्या आई। कृपया अपना सवाल दोहराएं।';
    res.status(500).json({ error: err.message, answer: fallback });
  }
});

/**
 * Sync endpoint for the Jarvis Android App
 * Returns all recent web call interactions for a specific deviceId
 * so they appear directly in the app's chat screen!
 */
app.get('/api/call-history', (req, res) => {
  const deviceId = req.query.deviceId || '';
  let records = [];

  if (deviceId && deviceCallHistory.has(deviceId)) {
    records = deviceCallHistory.get(deviceId);
  } else if (!deviceId) {
    // If no deviceId specified, return recent items across all devices
    for (const list of deviceCallHistory.values()) {
      records.push(...list);
    }
    records.sort((a, b) => a.timestamp - b.timestamp);
    records = records.slice(-50);
  }

  res.json({
    deviceId: deviceId || 'all',
    history: records
  });
});

app.post('/api/call-history/clear', (req, res) => {
  const deviceId = req.body.deviceId || '';
  if (deviceId && deviceCallHistory.has(deviceId)) {
    deviceCallHistory.set(deviceId, []);
  } else if (!deviceId) {
    deviceCallHistory.clear();
  }
  res.json({ status: 'cleared', deviceId: deviceId || 'all' });
});

const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log('================================================================');
  console.log(`⚡ Jarvis Voice Cloud Server running on port ${PORT}`);
  console.log(`🌐 100% Free Web Call UI: http://localhost:${PORT}/`);
  console.log(`🤖 Gemini Models: ${GEMINI_MODELS.join(', ')} & Gemini TTS`);
  console.log('================================================================');
});
