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
 * Cleans text from markdown, symbols, and formatting tags for pristine speech output
 */
function cleanSpeechText(rawText) {
  if (!rawText) return '';
  let text = rawText;

  // Remove code blocks and inline code
  text = text.replace(/```[\s\S]*?```/g, ' ');
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove markdown headers, bold, italics, strikethrough
  text = text.replace(/^#+\s+/gm, '');
  text = text.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1');
  text = text.replace(/[*_~#]/g, '');

  // Remove markdown links & images [text](url) -> text
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');

  // Remove HTML / XML tags <tag> -> ''
  text = text.replace(/<\/?[^>]+(>|$)/g, '');

  // Remove unwanted slashes, bullets, math symbols that TTS mispronounces
  text = text.replace(/[\\\/\|\<\>\+\=\^\$]/g, ' ');
  text = text.replace(/^[•\-\*\+]\s+/gm, '');

  // Remove redundant self-introduction if present
  text = text.replace(/^(?:नमस्ते\s+सर[,!]?\s*)?(?:मैं\s+जार्विस\s+हूँ|मेरा\s+नाम\s+जार्विस\s+है|main\s+jarvis\s+hoon|hello\s+main\s+jarvis\s+hoon)[,.\s:]*/i, '').trim();

  // Normalize spaces and ensure natural prefix
  text = text.replace(/\s{2,}/g, ' ').trim();
  if (!text.startsWith('सर') && !text.startsWith('जी सर') && !text.startsWith('बिल्कुल') && !text.startsWith('नमस्ते')) {
    text = 'सर, ' + text;
  }

  return text;
}

/**
 * Detects if a user query is asking for a photo, image, picture, or wallpaper
 */
function detectPhotoRequest(query) {
  const q = (query || '').toLowerCase();
  const photoKeywords = [
    'photo', 'image', 'picture', 'pic', 'wallpaper', 'photo bhejo', 'photo dikhao',
    'image dikhao', 'photo banao', 'tasveer', 'तस्वीर', 'फोटो', 'इमेज', 'picture do',
    'drawing', 'sketch', 'wallpaper banao', 'photo send karo'
  ];
  return photoKeywords.some(k => q.includes(k));
}

/**
 * Generates high-res image payload for synced Android App chat
 */
function createJarvisPhotoPayload(userQuery) {
  let prompt = userQuery
    .replace(/(?:mujhe|humko|hume|jarvis|sir|ek|ki|ka|ke|photo|image|picture|pic|wallpaper|tasveer|bhejo|dikhao|banao|send karo|do|chahiye|de do|show me|generate|create|a|an|the|फोटो|तस्वीर|इमेज)/gi, '')
    .trim();

  if (!prompt || prompt.length < 2) {
    prompt = 'Futuristic Iron Man Arc Reactor with holographic cyber glow';
  }

  const encodedPrompt = encodeURIComponent(prompt + ', 8k resolution, photorealistic masterpiece, dramatic lighting');
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;

  return {
    imageUrl,
    imagesJson: JSON.stringify([{
      url: imageUrl,
      title: prompt,
      sourceName: "Jarvis AI Cloud Generation",
      sourceUrl: imageUrl,
      width: 1024,
      height: 1024
    }])
  };
}

/**
 * Direct Gemini AI Completion with multi-turn context and conversational voice persona
 */
async function queryGeminiChat(userQuery, deviceId = 'default', isPhotoRequest = false) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_GEMINI_AI_STUDIO_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const currentDateContext = getCurrentIstContext();
  const photoContext = isPhotoRequest 
    ? 'CRITICAL NOTE: The user is asking for a photo/image. You have ALREADY generated and dispatched that photo directly into their connected Jarvis Android App. You must inform the user politely in 1-2 spoken sentences that you have sent the photo to their Jarvis app (e.g. "सर, मैंने आपके जार्विस ऐप में फोटो भेज दी है। आप ऐप में देख सकते हैं।").'
    : '';

  const sysInstruction = 
    `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), the ultimate personal AI assistant and loyal companion created by the user.
CURRENT REAL-WORLD TIME & DATE (IST): ${currentDateContext}.

VOICE CALL & APP INTEGRATION CONTEXT:
1. IDENTITY: You are J.A.R.V.I.S. (जार्विस). Speak with a polite, sophisticated, loyal, and authoritative MALE tone, addressing the user respectfully as "सर" (Sir) or "बॉस" (Boss).
2. APP AWARENESS: You are talking to the user via a live 24/7 Web Voice Call link. You are 100% aware that the user is accessing you through this web link, and whatever you say, do, calculate, automate, or generate is INSTANTLY synced and visible in real-time on their Jarvis Android Application.
3. PHOTO COMMANDS: If the user asks for any photo, image, picture, or wallpaper, state clearly and politely that you have delivered that photo directly into their Jarvis Android App.
${photoContext}
4. CONVERSATIONAL SPOKEN LENGTH: Keep answers natural, crisp, intelligent, and conversational (typically 2 to 4 spoken sentences) without unnecessary walls of text.
5. ABSOLUTELY NO MARKDOWN OR SYMBOLS: Do NOT use asterisks (*), hashtags (#), brackets, HTML tags (<>), bullets, slashes (/), backticks, or emojis. Output 100% clean spoken sentences.
6. LANGUAGE: Natural conversational Hindi (Devanagari script) or natural Hinglish.`;

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
      temperature: 0.4,
      maxOutputTokens: isPhotoRequest ? 120 : 450
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

      const cleaned = cleanSpeechText(resText);

      // Update multi-turn history
      history.push({ role: 'user', text: userQuery });
      history.push({ role: 'model', text: cleaned });
      if (history.length > 12) history = history.slice(-12);
      deviceConversations.set(deviceId, history);

      return cleaned;
    } catch (err) {
      console.warn(`[Model Fallback] ${model} failed: ${err.message}, trying next...`);
    }
  }

  return 'जी सर, मैंने आपका निर्देश सुन लिया है। बताइए मैं आपकी क्या सहायता करूँ?';
}

/**
 * Creates standard 44-byte WAV header for raw PCM audio
 */
function pcmToWavBuffer(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Generates pristine audio/wav speech using Gemini Neural Voice TTS
 */
async function generateTtsAudio(textToSpeak) {
  if (!GEMINI_API_KEY || !textToSpeak) return null;

  const ttsModels = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash-exp'];

  for (const model of ttsModels) {
    try {
      const payload = JSON.stringify({
        contents: [{ parts: [{ text: textToSpeak }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Puck'
              }
            }
          }
        }
      });

      const audioBase64 = await new Promise((resolve, reject) => {
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
              const part = json.candidates?.[0]?.content?.parts?.[0];
              const inline = part?.inlineData;
              if (inline && inline.data) {
                const mime = inline.mimeType || '';
                if (mime.includes('wav') || mime.includes('mp3') || mime.includes('ogg')) {
                  return resolve(inline.data);
                }
                // Handle raw PCM: convert to valid WAV container
                const rawBuffer = Buffer.from(inline.data, 'base64');
                const wavBuffer = pcmToWavBuffer(rawBuffer, 24000, 1, 16);
                return resolve(wavBuffer.toString('base64'));
              }
              resolve(null);
            } catch {
              resolve(null);
            }
          });
        });

        req.on('error', () => resolve(null));
        req.setTimeout(8000, () => {
          req.destroy();
          resolve(null);
        });
        req.write(payload);
        req.end();
      });

      if (audioBase64) return audioBase64;
    } catch (err) {
      console.warn(`[TTS Notice] Model ${model} audio note:`, err.message);
    }
  }

  return null;
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
 * Syncs command & generated photos directly into device's webCallHistory
 */
app.post('/api/chat-call', async (req, res) => {
  const query = req.body.query || '';
  const deviceId = req.body.deviceId || 'default';

  if (!query.trim()) {
    return res.status(400).json({ error: 'Query is empty' });
  }

  try {
    const isPhoto = detectPhotoRequest(query);
    const photoData = isPhoto ? createJarvisPhotoPayload(query) : null;

    const answer = await queryGeminiChat(query, deviceId, isPhoto);
    const audioBase64 = await generateTtsAudio(answer);

    // Save to device history so the specific originating Android app can sync
    const record = {
      id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7),
      deviceId: deviceId,
      user: query.trim(),
      answer: answer,
      imageUrl: photoData ? photoData.imageUrl : '',
      imagesJson: photoData ? photoData.imagesJson : '[]',
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
      imageUrl: record.imageUrl,
      imagesJson: record.imagesJson,
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
    records.push(...deviceCallHistory.get(deviceId));
  }
  
  if (deviceCallHistory.has('default')) {
    records.push(...deviceCallHistory.get('default'));
  }

  // If no device-specific records, return recent activity across all sessions so the app receives everything!
  if (records.length === 0) {
    for (const list of deviceCallHistory.values()) {
      records.push(...list);
    }
  }

  // Deduplicate by item ID and sort chronologically
  const uniqueMap = new Map();
  for (const r of records) {
    uniqueMap.set(r.id, r);
  }
  const result = Array.from(uniqueMap.values()).sort((a, b) => a.timestamp - b.timestamp);

  res.json({
    deviceId: deviceId || 'all',
    history: result.slice(-100)
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
