# ⚡ Jarvis 24/7 Cloud Phone Calling Server (Twilio + Gemini Live)

This standalone Node.js server handles live telephone calls **24/7** for your Jarvis AI assistant using **Twilio Voice Media Streams** and the **Google Gemini Live Multimodal API**.

Even if your Android phone is powered off or the app is closed, callers can dial your Twilio phone number and talk directly to Jarvis in real-time with ultra-low latency speech-to-speech!

---

## 🏗️ Architecture

```
[Phone Caller] 
       │ (Cellular Call)
       ▼
 [Twilio Voice] 
       │ (TwiML Connect / Media Streams)
       ▼ (8kHz μ-law WebSockets)
[Node.js Cloud Server] ── G.711 & Resampler ──► (16kHz PCM)
       │                                                 │
       ▼                                                 ▼
[Twilio Audio Return] ◄── Resampler (24k->8k) ◄── [Gemini Live S2S API]
       │
[Shared Tools Executor] ◄── Tool Calls (bookSlot, turnOffDevice, setAlarm)
```

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
cd twilio-cloud-server
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and set your **Google AI Studio API Key**:
```env
PORT=8080
GEMINI_API_KEY=AIzaSy...your_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash-exp
GEMINI_VOICE=Puck
```

### 3. Start the Server
```bash
npm start
```
You should see:
```
================================================================
⚡ Jarvis Twilio Cloud Phone Server running on port 8080
📞 Inbound Twilio Webhook: POST http://localhost:8080/incoming-call
🎙️ WebSocket Media Stream: ws://localhost:8080/media-stream
🤖 Gemini Model: gemini-2.0-flash-exp | Voice: Puck
================================================================
```

### 4. Expose Locally via Ngrok
In a separate terminal:
```bash
ngrok http 8080
```
Note your public HTTPS URL (e.g., `https://abc123.ngrok-free.app`).

---

## 🌐 24/7 Cloud Deployment (No Phone Needed!)

Deploy this server to any free or low-cost cloud provider so it runs uninterrupted 24/7:

### Option A: Render (Free & 1-Click)
1. Push this folder to a GitHub repository.
2. Go to [Render.com](https://render.com) -> New **Web Service**.
3. Select your repo, choose **Node** runtime.
4. Set Build Command: `npm install`
5. Set Start Command: `npm start`
6. Add Environment Variables:
   - `GEMINI_API_KEY`: Your Google AI Studio key
   - `GEMINI_MODEL`: `gemini-2.0-flash-exp`
   - `GEMINI_VOICE`: `Puck`
7. Copy the generated live URL (e.g., `https://jarvis-twilio.onrender.com`).

### Option B: Railway / Fly.io / Google Cloud Run
Railway, Fly.io, and Google Cloud Run support native Node.js and persistent WebSockets out of the box. Simply deploy with the same environment variables.

---

## 📞 Twilio Phone Number Configuration

1. Log into your [Twilio Console](https://console.twilio.com/).
2. Navigate to **Phone Numbers** -> **Manage** -> **Active Numbers**.
3. Click on your phone number.
4. Under **Voice & Fax**, find **A CALL COMES IN**:
   - Select **Webhook**
   - URL: `https://<YOUR_DOMAIN>/incoming-call` (HTTP POST)
5. Save the configuration.

Now, call your Twilio number from any phone in the world! You will hear Jarvis greet you and you can converse naturally in real-time.

---

## 🛠️ Shared Commands & Tools

Both the **Android App** and this **Cloud Phone Server** share identical tool definitions and schemas:

| Tool Name | Parameters | Description |
|---|---|---|
| `turnOffDevice` | `reason`, `target` | Safe device shutdown or screen lock command |
| `bookSlot` | `title`, `time`, `attendee` | Schedules and confirms appointments with booking IDs |
| `executeLocalCommand` | `command`, `payload` | Executes smart assistant commands & routines |
| `setAlarm` | `time`, `label` | Sets device alarm or morning reminder |
| `getDeviceStatus` | `aspect` | Queries battery, system diagnostics, and core status |

### Barge-in & Interruption
If the caller speaks while Jarvis is responding, the server detects voice activity and automatically sends a Twilio `clear` event, stopping the previous speech instantly so the caller can interject without waiting!
