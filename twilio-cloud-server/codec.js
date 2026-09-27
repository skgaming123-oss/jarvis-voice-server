/**
 * ITU-T G.711 mu-law Codec & Linear Resampler for Node.js
 * Bridges Twilio Media Stream audio (8kHz mu-law) and Gemini Live S2S audio (16kHz in, 24kHz out).
 */

const BIAS = 0x84;
const CLIP = 32635;

// Precomputed lookup table for mu-law to 16-bit linear PCM
const MU_LAW_TO_PCM = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const input = i ^ 0xff;
  const sign = input & 0x80;
  const exponent = (input >> 4) & 0x07;
  const mantissa = input & 0x0f;
  let sample = ((mantissa << 3) + BIAS) << exponent;
  sample -= BIAS;
  if (sign === 0) sample = -sample;
  MU_LAW_TO_PCM[i] = sample;
}

/**
 * Decodes 8kHz mu-law buffer into 16-bit linear PCM buffer (8kHz).
 */
function muLawToPcm8k(muLawBuffer) {
  const pcmBuffer = Buffer.alloc(muLawBuffer.length * 2);
  for (let i = 0; i < muLawBuffer.length; i++) {
    const pcmSample = MU_LAW_TO_PCM[muLawBuffer[i]];
    pcmBuffer.writeInt16LE(pcmSample, i * 2);
  }
  return pcmBuffer;
}

/**
 * Encodes 16-bit linear PCM buffer (8kHz) into 8-bit mu-law buffer (8kHz).
 */
function pcm8kToMuLaw(pcmBuffer) {
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  const muLawBuffer = Buffer.alloc(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2);
    muLawBuffer[i] = pcmSampleToMuLaw(sample);
  }
  return muLawBuffer;
}

function pcmSampleToMuLaw(sample) {
  let sign = 0x80;
  let s = sample;
  if (s < 0) {
    s = -s;
    sign = 0x00;
  }
  if (s > CLIP) s = CLIP;
  s += BIAS;

  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {}

  const mantissa = (s >> (exponent + 3)) & 0x0f;
  const muLaw = sign | (exponent << 4) | mantissa;
  return muLaw ^ 0xff;
}

/**
 * Resamples 8kHz 16-bit PCM up to 16kHz 16-bit PCM for Gemini Live input.
 * Uses linear interpolation for smooth acoustic quality.
 */
function resamplePcm8kTo16k(pcm8kBuffer) {
  const inSamples = Math.floor(pcm8kBuffer.length / 2);
  if (inSamples <= 0) return Buffer.alloc(0);

  const outSamples = inSamples * 2;
  const outBuffer = Buffer.alloc(outSamples * 2);

  for (let i = 0; i < inSamples; i++) {
    const sCurrent = pcm8kBuffer.readInt16LE(i * 2);
    const sNext = (i + 1 < inSamples) ? pcm8kBuffer.readInt16LE((i + 1) * 2) : sCurrent;
    const sMid = Math.round((sCurrent + sNext) / 2);

    outBuffer.writeInt16LE(sCurrent, i * 4);
    outBuffer.writeInt16LE(sMid, i * 4 + 2);
  }
  return outBuffer;
}

/**
 * Resamples 24kHz 16-bit PCM down to 8kHz 16-bit PCM for Twilio output.
 * Downsamples by taking an average of 3 consecutive samples (24kHz / 3 = 8kHz).
 */
function resamplePcm24kTo8k(pcm24kBuffer) {
  const inSamples = Math.floor(pcm24kBuffer.length / 2);
  const outSamples = Math.floor(inSamples / 3);
  const outBuffer = Buffer.alloc(outSamples * 2);

  for (let i = 0; i < outSamples; i++) {
    const idx = i * 3;
    const s0 = pcm24kBuffer.readInt16LE(idx * 2);
    const s1 = (idx + 1 < inSamples) ? pcm24kBuffer.readInt16LE((idx + 1) * 2) : s0;
    const s2 = (idx + 2 < inSamples) ? pcm24kBuffer.readInt16LE((idx + 2) * 2) : s1;
    const avg = Math.round((s0 + s1 + s2) / 3);
    outBuffer.writeInt16LE(avg, i * 2);
  }
  return outBuffer;
}

/**
 * Converts Twilio incoming base64 mu-law audio chunk directly into Gemini 16kHz PCM Buffer.
 */
function twilioMuLawToGeminiPcm16k(base64MuLaw) {
  const muLawBuf = Buffer.from(base64MuLaw, 'base64');
  const pcm8k = muLawToPcm8k(muLawBuf);
  return resamplePcm8kTo16k(pcm8k);
}

/**
 * Converts Gemini outgoing 24kHz linear PCM buffer into Twilio base64 8kHz mu-law chunk.
 */
function geminiPcm24kToTwilioBase64(pcm24kBuffer) {
  const pcm8k = resamplePcm24kTo8k(pcm24kBuffer);
  const muLaw = pcm8kToMuLaw(pcm8k);
  return muLaw.toString('base64');
}

/**
 * Calculates Root Mean Square (RMS) energy of a 16-bit PCM buffer.
 * Returns normalized float [0.0 - 1.0].
 */
function calculatePcmRms(pcmBuffer) {
  const sampleCount = Math.floor(pcmBuffer.length / 2);
  if (sampleCount === 0) return 0.0;

  let sumSquares = 0;
  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * 2) / 32768.0;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / sampleCount);
}

module.exports = {
  muLawToPcm8k,
  pcm8kToMuLaw,
  resamplePcm8kTo16k,
  resamplePcm24kTo8k,
  twilioMuLawToGeminiPcm16k,
  geminiPcm24kToTwilioBase64,
  calculatePcmRms
};
