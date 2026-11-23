import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  checkRedFlags,
  checkRedFlagsInIntake,
  predictTop3,
  getConditionKnowledge,
  getAllLanguageKnowledge,
} from './ml_engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// In-Memory Data Store (replaces SQLite for AI Studio ephemeral runtime)
// ---------------------------------------------------------------------------
const usersById = new Map();
const usersByEmail = new Map();
const sessions = new Map(); // token -> userId
const profiles = new Map(); // userId -> profile
const conversations = new Map(); // conversationId -> { id, user_id, created_at, updated_at, title }
const messagesByConv = new Map(); // conversationId -> Array<{ role, content, timestamp }>
const diagnosesByConv = new Map(); // conversationId -> latest diagnosis
const labReportsByUser = new Map(); // userId -> Array<report>
const generatedReports = new Map(); // reportId -> { user_id, filename, content }

// Pre-seed demo user so login is immediately available
const demoId = 'default-demo-user';
const demoHash = bcrypt.hashSync('Password123', 10);
const demoUser = { id: demoId, name: 'Raghav Gupta', email: 'rgupta70610@gmail.com', passwordHash: demoHash };
usersById.set(demoId, demoUser);
usersByEmail.set('rgupta70610@gmail.com', demoUser);
usersByEmail.set('demo@example.com', demoUser);
profiles.set(demoId, {
  user_id: demoId,
  name: 'Raghav Gupta',
  age: 25,
  gender: 'Male',
  allergies: 'None',
  chronic_conditions: 'None',
  location: 'Mumbai, India',
  height: '5 ft 10 in',
  weight: '70 kg',
});

// ---------------------------------------------------------------------------
// Auth Helpers
// ---------------------------------------------------------------------------
function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return req.cookies?.ai_doctor_session || null;
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  const userId = token ? sessions.get(token) : null;
  const user = userId ? usersById.get(userId) : null;
  if (!user) {
    return res.status(401).json({ detail: 'Authentication required. Please log in.' });
  }
  req.user = { id: user.id, name: user.name, email: user.email };
  next();
}

function getOrCreateProfile(user) {
  if (!profiles.has(user.id)) {
    profiles.set(user.id, {
      user_id: user.id,
      name: user.name || 'Guest User',
      age: 25,
      gender: 'Not specified',
      allergies: 'None',
      chronic_conditions: 'None',
      location: 'Not specified',
      height: 'Not specified',
      weight: 'Not specified',
    });
  }
  return profiles.get(user.id);
}

function resolveUserOrGuest(req) {
  const token = extractToken(req);
  const userId = token ? sessions.get(token) : null;
  const user = userId ? usersById.get(userId) : null;
  if (user) {
    return { id: user.id, name: user.name, email: user.email, isGuest: false };
  }
  const guestName = (req.body?.name || '').trim() || 'Guest Patient';
  const guestId = `guest_${crypto.randomUUID().slice(0, 8)}`;
  return { id: guestId, name: guestName, email: 'guest@aidoctor.local', isGuest: true };
}

// ---------------------------------------------------------------------------
// Health & Auth Routes
// ---------------------------------------------------------------------------
const RETIRED_MODELS = new Set([
  'gemini-1.5-flash',
  'gemini-1.5-pro',
  'gemini-pro',
  'gemini-2.0-flash',
  'gemini-2.0-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.8-flash',
]);
const envModel = (process.env.GEMINI_MODEL || '').trim();
const ACTIVE_MODEL = !envModel || RETIRED_MODELS.has(envModel) ? 'gemini-4-hydrogen' : envModel;

app.get(['/health', '/api/health'], (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Personal AI Doctor',
    version: '3.0',
    ml_classifier_loaded: true,
    active_model: ACTIVE_MODEL,
  });
});

app.post('/api/auth/register', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirm_password = req.body.confirm_password || '';

  if (name.length < 2) {
    return res.status(400).json({ detail: 'Please enter your full name (at least 2 characters).' });
  }
  if (!email.includes('@') || !email.split('@').pop().includes('.')) {
    return res.status(400).json({ detail: 'Please enter a valid email address.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ detail: 'Password must be at least 6 characters long.' });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ detail: 'Passwords do not match.' });
  }
  if (usersByEmail.has(email)) {
    return res.status(400).json({ detail: 'An account with this email already exists.' });
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id, name, email, passwordHash };
  usersById.set(id, user);
  usersByEmail.set(email, user);

  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, id);
  res.cookie('ai_doctor_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 14 * 24 * 3600 * 1000, path: '/' });
  res.json({ status: 'success', token, user: { id, name, email } });
});

app.post('/api/auth/login', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  if (!email || !password) {
    return res.status(400).json({ detail: 'Email and password are required.' });
  }
  const user = usersByEmail.get(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ detail: 'Invalid email or password.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, user.id);
  res.cookie('ai_doctor_session', token, { httpOnly: true, sameSite: 'lax', maxAge: 14 * 24 * 3600 * 1000, path: '/' });
  res.json({ status: 'success', token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractToken(req);
  if (token) sessions.delete(token);
  res.clearCookie('ai_doctor_session', { path: '/' });
  res.json({ status: 'success', message: 'Logged out successfully.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

// ---------------------------------------------------------------------------
// Profile, History, Diagnosis, Report Upload
// ---------------------------------------------------------------------------
app.get('/api/profile', requireAuth, (req, res) => {
  res.json(getOrCreateProfile(req.user));
});

app.post('/api/profile', requireAuth, (req, res) => {
  const current = getOrCreateProfile(req.user);
  const updated = {
    ...current,
    name: req.body.name || current.name,
    age: Number(req.body.age) || current.age,
    gender: req.body.gender || current.gender,
    allergies: req.body.allergies ?? current.allergies,
    chronic_conditions: req.body.chronic_conditions ?? current.chronic_conditions,
    location: req.body.location || current.location,
    height: req.body.height || current.height,
    weight: req.body.weight || current.weight,
  };
  profiles.set(req.user.id, updated);
  res.json(updated);
});

app.get('/api/history', requireAuth, (req, res) => {
  const list = [...conversations.values()]
    .filter((c) => c.user_id === req.user.id)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .map((c) => {
      const msgs = messagesByConv.get(c.id) || [];
      const diag = diagnosesByConv.get(c.id);
      return {
        conversation_id: c.id,
        id: c.id,
        title: diag?.condition || c.title || 'Health Consultation',
        condition: diag?.condition || 'General Consultation',
        message_count: msgs.length,
        last_message: msgs[msgs.length - 1]?.content?.slice(0, 120) || '',
        created_at: c.created_at,
        updated_at: c.updated_at,
      };
    });
  res.json(list);
});

app.get('/api/history/:conversation_id', requireAuth, (req, res) => {
  const conv = conversations.get(req.params.conversation_id);
  if (!conv) return res.status(404).json({ detail: 'Conversation not found.' });
  if (conv.user_id !== req.user.id) return res.status(403).json({ detail: 'Access denied.' });
  res.json(messagesByConv.get(conv.id) || []);
});

app.get('/api/diagnosis/:conversation_id', requireAuth, (req, res) => {
  const conv = conversations.get(req.params.conversation_id);
  if (conv && conv.user_id !== req.user.id) return res.status(403).json({ detail: 'Access denied.' });
  const diag = diagnosesByConv.get(req.params.conversation_id);
  if (!diag) return res.status(404).json({ detail: 'No diagnosis found for this conversation.' });
  res.json(diag);
});

app.post('/api/report/upload', requireAuth, (req, res) => {
  const conversation_id = req.body.conversation_id || crypto.randomUUID();
  const report_name = req.body.report_name || 'Medical Lab Report';
  const raw_text = req.body.report_text || '';
  const report_id = crypto.randomUUID();
  const parsed = {
    report_name,
    date: new Date().toISOString().slice(0, 10),
    raw_text,
    tests: [],
  };
  const existing = labReportsByUser.get(req.user.id) || [];
  existing.push({ id: report_id, conversation_id, ...parsed });
  labReportsByUser.set(req.user.id, existing);

  res.json({ status: 'success', report_id, conversation_id, parsed_summary: parsed });
});

// ---------------------------------------------------------------------------
// Symptom Assessment
// ---------------------------------------------------------------------------
app.post('/api/assess', async (req, res) => {
  const user = resolveUserOrGuest(req);
  const userId = user.id;
  const data = req.body || {};
  const symptoms = Array.isArray(data.symptoms) ? data.symptoms : [];
  const severityScore = Number(data.severity_score ?? 5);
  const reqLang = (data.language || 'english').toLowerCase().trim();
  const conversationId = data.conversation_id || crypto.randomUUID();

  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, {
      id: conversationId,
      user_id: userId,
      title: symptoms.slice(0, 2).join(', ') || 'Symptom Assessment',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  if (user.isGuest && !profiles.has(userId)) {
    profiles.set(userId, {
      user_id: userId,
      name: data.name || user.name,
      age: Number(data.age) || 25,
      gender: data.gender || 'Not specified',
      allergies: data.allergies || 'None',
      chronic_conditions: data.chronic_conditions || 'None',
      location: data.location || 'Not specified',
      height: 'Not specified',
      weight: 'Not specified',
    });
  }

  const safety = checkRedFlagsInIntake(symptoms, data.notes || '', severityScore);
  const symptomsText = symptoms.join(', ');
  const combinedNotes = `Patient: ${data.name || user.name}, Age: ${data.age || 25}, Gender: ${data.gender || 'Not specified'}. Main Symptoms: ${symptomsText}. Duration: ${data.duration || '1-2 days'}. Severity: ${severityScore}/10. Notes: ${data.notes || ''}`;

  const msgs = messagesByConv.get(conversationId) || [];
  msgs.push({ role: 'user', content: combinedNotes, timestamp: new Date().toISOString() });
  messagesByConv.set(conversationId, msgs);

  if (safety.is_emergency) {
    msgs.push({ role: 'assistant', content: safety.emergency_message, timestamp: new Date().toISOString() });
    return res.json({
      status: 'emergency',
      is_emergency: true,
      emergency_message: safety.emergency_message,
      conversation_id: conversationId,
      intake_summary: { name: data.name || user.name, symptoms, severity_score: severityScore },
    });
  }

  const { top3, topConf } = predictTop3(symptoms, data.notes || '', data.trajectory || '', data.duration || '');
  const primaryCondition = top3[0].condition;
  const knowledge = getConditionKnowledge(primaryCondition, reqLang);
  const multilingual = getAllLanguageKnowledge(primaryCondition);

  const reasoningSteps = [
    `• Analyzed reported symptoms (${symptomsText || 'general discomfort'}) spanning duration (${data.duration || '1-2 days'}).`,
  ];
  if (data.recent_food_activity && String(data.recent_food_activity).toLowerCase() !== 'none') {
    reasoningSteps.push(`• Evaluated environmental trigger: ${data.recent_food_activity}.`);
  }
  if (severityScore >= 7) {
    reasoningSteps.push(`• Highlighted elevated discomfort rating (${severityScore}/10) requiring close symptom monitoring.`);
  }
  let clinicalReasoning = reasoningSteps.join('\n');

  // If Gemini API is configured, enhance clinical reasoning with medical AI
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const prompt = `You are Personal AI Doctor. Provide a clinical diagnostic synthesis for:
Patient: ${data.name || user.name}, Age: ${data.age || 25}, Gender: ${data.gender || 'Not specified'}.
Symptoms: ${symptomsText}
Duration: ${data.duration || '1-2 days'}, Severity: ${severityScore}/10.
Primary Assessed Condition: ${primaryCondition}.
Language: ${reqLang}.
Provide 3 concise clinical reasoning bullet points explaining why this condition fits the presentation and what the patient should keep in mind. Be empathetic and professional.`;

      const genRes = await ai.models.generateContent({
        model: ACTIVE_MODEL,
        contents: prompt,
      });
      const aiText = genRes.text?.trim();
      if (aiText) {
        clinicalReasoning = aiText;
      }
    } catch (aiErr) {
      console.warn('[Gemini Clinical Assessment Warning]:', aiErr.message);
    }
  }

  const causeWithReasoning = `${knowledge.cause}\n\nClinical Assessment Reasoning:\n${clinicalReasoning}`;

  const diagnosisRecord = {
    conversation_id: conversationId,
    condition: primaryCondition,
    ml_confidence: topConf,
    cause: causeWithReasoning,
    clinical_reasoning: clinicalReasoning,
    medication_guidance: knowledge.medication_guidance,
    recovery_days: knowledge.recovery_days,
    diet_advice: knowledge.diet_advice,
    foods_to_avoid: knowledge.foods_to_avoid,
    home_remedies: knowledge.home_remedies,
    rest_days: knowledge.rest_days,
    red_flags: knowledge.red_flags,
    top3_predictions: top3,
  };
  diagnosesByConv.set(conversationId, diagnosisRecord);

  const reportId = crypto.randomUUID();
  const reportText = [
    'PERSONAL AI DOCTOR — CONSULTATION SUMMARY REPORT',
    `Date: ${new Date().toLocaleString()}`,
    `Patient: ${data.name || user.name} (${data.age || 25} yrs, ${data.gender || 'Not specified'})`,
    `Symptoms: ${symptomsText}`,
    `Assessed Condition: ${primaryCondition} (${Math.round(topConf * 100)}% confidence)`,
    `Cause: ${knowledge.cause}`,
    `Medication Guidance: ${knowledge.medication_guidance}`,
    `Diet Advice: ${knowledge.diet_advice}`,
    `Home Remedies: ${knowledge.home_remedies}`,
    `Red Flags: ${knowledge.red_flags}`,
  ].join('\n\n');
  generatedReports.set(reportId, {
    user_id: userId,
    filename: `consultation_report_${conversationId.slice(0, 8)}.txt`,
    content: reportText,
  });

  res.json({
    status: 'success',
    ...diagnosisRecord,
    multilingual_knowledge: multilingual,
    selected_language: reqLang,
    report_id: reportId,
    download_url: `/api/report/download/${reportId}`,
    intake_summary: {
      name: data.name || user.name,
      age: data.age || 25,
      gender: data.gender || 'Not specified',
      location: data.location || 'Not specified',
      symptoms,
      duration: data.duration || '1-2 days',
      recent_food_activity: data.recent_food_activity || 'None',
      allergies: data.allergies || 'None',
      chronic_conditions: data.chronic_conditions || 'None',
      severity_score: severityScore,
    },
  });
});

// ---------------------------------------------------------------------------
// Streaming AI Doctor Chat (Server-Side Gemini via @google/genai)
// ---------------------------------------------------------------------------
function sseEvent(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

app.post('/api/chat', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const conversationId = req.body.conversation_id || crypto.randomUUID();
  const userMsg = (req.body.message || '').trim();
  const reqLang = (req.body.language || 'english').toLowerCase().trim();

  if (!userMsg) {
    return res.status(400).json({ detail: 'Message cannot be empty.' });
  }

  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, {
      id: conversationId,
      user_id: userId,
      title: userMsg.slice(0, 40),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else {
    const conv = conversations.get(conversationId);
    if (conv.user_id !== userId) {
      return res.status(403).json({ detail: 'Access denied.' });
    }
    conv.updated_at = new Date().toISOString();
  }

  const msgs = messagesByConv.get(conversationId) || [];
  msgs.push({ role: 'user', content: userMsg, timestamp: new Date().toISOString() });
  messagesByConv.set(conversationId, msgs);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const safety = checkRedFlags(userMsg);
  if (safety.is_emergency) {
    msgs.push({ role: 'assistant', content: safety.emergency_message, timestamp: new Date().toISOString() });
    res.write(sseEvent({ conversation_id: conversationId, text: safety.emergency_message, is_start: false, is_end: true, is_emergency: true, is_error: false }));
    return res.end();
  }

  res.write(sseEvent({ conversation_id: conversationId, text: '', is_start: true, is_end: false, is_emergency: false, is_error: false }));

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const fallback = '⚠️ AI service is not configured. Please set the GEMINI_API_KEY environment variable.';
    res.write(sseEvent({ conversation_id: conversationId, text: fallback, is_start: false, is_end: true, is_emergency: false, is_error: false }));
    return res.end();
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });
    const profile = getOrCreateProfile(req.user);
    const langInstruction =
      reqLang === 'hindi'
        ? 'Hindi (Devanagari script)'
        : reqLang === 'hinglish'
        ? 'Hinglish (Hindi written in Roman script)'
        : 'English';

    const systemInstruction = [
      `You are Personal AI Doctor, an empathetic, responsible Personal AI Health Assistant.`,
      `Patient Name: ${profile.name}. Age: ${profile.age}. Gender: ${profile.gender}. Allergies: ${profile.allergies}. Chronic Conditions: ${profile.chronic_conditions}.`,
      req.body.active_diagnosis?.condition ? `Active Assessed Condition: ${req.body.active_diagnosis.condition}.` : '',
      `Respond strictly in ${langInstruction}. Be concise, warm, and medically safe. Do not diagnose with certainty.`,
    ]
      .filter(Boolean)
      .join('\n');

    const contents = msgs.slice(-20).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const candidateModels = [...new Set([
      ACTIVE_MODEL,
      'gemini-flash-lite-latest',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
      'gemini-3-flash-preview',
    ].filter(Boolean))];

    let collected = '';
    let lastError = null;
    for (const modelName of candidateModels) {
      try {
        const stream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config: { systemInstruction, maxOutputTokens: 1024 },
        });

        for await (const chunk of stream) {
          const text = chunk.text || '';
          if (text) {
            collected += text;
            res.write(sseEvent({ conversation_id: conversationId, text, is_start: false, is_end: false, is_emergency: false, is_error: false }));
          }
        }
        lastError = null;
        break;
      } catch (modelErr) {
        lastError = modelErr;
        console.warn(`[Chat Gemini] Model ${modelName} failed (${modelErr.status || modelErr.message}), trying fallback...`);
        if (collected) break; // Already streamed partial text
      }
    }

    if (lastError && !collected) {
      throw lastError;
    }

    if (collected) {
      msgs.push({ role: 'assistant', content: collected, timestamp: new Date().toISOString() });
    }
    res.write(sseEvent({ conversation_id: conversationId, text: '', is_start: false, is_end: true, is_emergency: false, is_error: false }));
    res.end();
  } catch (err) {
    console.error('[Chat Gemini Error]:', err);
    const errText = String(err.message || '');
    const friendly =
      errText.includes('503') || errText.includes('UNAVAILABLE')
        ? '⚠️ AI server abhi high demand par hai. Kripya kuch seconds baad dobara try karein.'
        : `⚠️ AI service error: ${errText || 'Unable to generate response.'}`;
    res.write(
      sseEvent({
        conversation_id: conversationId,
        text: friendly,
        is_start: false,
        is_end: true,
        is_emergency: false,
        is_error: true,
      })
    );
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Report Generation & Download
// ---------------------------------------------------------------------------
app.post('/api/report/generate', requireAuth, (req, res) => {
  const convId = req.body.conversation_id;
  const conv = conversations.get(convId);
  if (!conv) return res.status(404).json({ detail: 'Conversation not found.' });
  if (conv.user_id !== req.user.id) return res.status(403).json({ detail: 'Access denied.' });

  const diag = diagnosesByConv.get(convId);
  const reportId = crypto.randomUUID();
  const content = [
    'PERSONAL AI DOCTOR — CONSULTATION SUMMARY REPORT',
    `Date: ${new Date().toLocaleString()}`,
    `Condition: ${diag?.condition || 'General Consultation'}`,
    `Medication Guidance: ${diag?.medication_guidance || 'Consult a qualified physician.'}`,
    `Diet Advice: ${diag?.diet_advice || 'Stay hydrated and eat light meals.'}`,
  ].join('\n\n');

  generatedReports.set(reportId, {
    user_id: req.user.id,
    filename: `consultation_report_${convId.slice(0, 8)}.txt`,
    content,
  });

  res.json({ status: 'success', report_id: reportId, download_url: `/api/report/download/${reportId}` });
});

app.get('/api/report/download/:report_id', requireAuth, (req, res) => {
  const report = generatedReports.get(req.params.report_id);
  if (!report) return res.status(404).json({ detail: 'Report file not found.' });
  if (report.user_id !== req.user.id) return res.status(403).json({ detail: 'Access denied.' });
  res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(report.content);
});

// ---------------------------------------------------------------------------
// Serve Static Frontend
// ---------------------------------------------------------------------------
const FRONTEND_DIR = path.join(__dirname, 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('*', (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Personal AI Doctor server running at http://${HOST}:${PORT}`);
});
