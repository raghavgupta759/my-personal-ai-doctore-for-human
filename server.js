import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

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

// ---------------------------------------------------------------------------
// Safety Guard (Emergency Red Flags)
// ---------------------------------------------------------------------------
const RED_FLAG_PATTERNS = [
  /\bchest\s*pain\b/i, /\bheart\s*attack\b/i, /\bchhati\s*(mein|me)\s*dard\b/i,
  /\bchaati\s*dard\b/i, /\bseene\s*(mein|me)\s*dard\b/i, /\bchest\s*tightness\b/i,
  /\bshortness\s*of\s*breath\b/i, /\bcant\s*breathe\b/i, /\bcan't\s*breathe\b/i,
  /\bsaans\s*nahi\s*aa\s*rahi\b/i, /\bsaans\s*lene\s*(mein|me)\s*dikkat\b/i,
  /\bdam\s*ghut\s*raha\b/i, /\bbreathlessness\b/i, /\basphyxia\b/i,
  /\bstroke\b/i, /\bparalysis\b/i, /\bface\s*droop\b/i, /\bslurred\s*speech\b/i,
  /\bunconscious\b/i, /\bpassed\s*out\b/i, /\bbehosh\b/i, /\bbehoshi\b/i, /\bfainting\b/i,
  /\bheavy\s*bleeding\b/i, /\bsevere\s*bleeding\b/i, /\buncontrolled\s*bleeding\b/i,
  /\banaphylaxis\b/i, /\bswollen\s*throat\b/i, /\bswollen\s*tongue\b/i,
  /\bsuicide\b/i, /\bsuicidal\b/i, /\bkill\s*myself\b/i, /\bself\s*harm\b/i,
  /\bseizure\b/i, /\bconvulsion\b/i,
];

const EMERGENCY_RESPONSE_TEMPLATE = `🚨 **EMERGENCY WARNING — IMMEDIATE MEDICAL ATTENTION REQUIRED**

Your description includes symptoms that could indicate a severe or life-threatening emergency (such as severe chest pain, severe breathing difficulty, stroke symptoms, loss of consciousness, uncontrolled bleeding, or severe allergic reaction).

**Please do NOT wait for an AI assessment.**

📞 **Call Emergency Services Immediately:**
• **112** — National Emergency Helpline (India)
• **108** — Emergency Ambulance Services
• **911** / Local Emergency Number (International)
• Or reach the nearest Hospital / Emergency Room immediately.

*Personal AI Doctor is an educational decision-support tool and cannot treat life-threatening medical emergencies.*`;

function checkRedFlags(text = '') {
  for (const pattern of RED_FLAG_PATTERNS) {
    if (pattern.test(text)) {
      return { is_emergency: true, emergency_message: EMERGENCY_RESPONSE_TEMPLATE };
    }
  }
  return { is_emergency: false, emergency_message: null };
}

function checkRedFlagsInIntake(symptoms = [], notes = '', severityScore = 5) {
  const combined = `${symptoms.join(' ')} ${notes}`;
  const flag = checkRedFlags(combined);
  if (flag.is_emergency) return flag;

  const critical = ['shortness of breath', 'chest pain', 'fainting', 'unconscious', 'heavy bleeding', 'stroke'];
  for (const sym of symptoms) {
    const low = String(sym).toLowerCase();
    if (severityScore >= 8 && critical.some((c) => low.includes(c))) {
      return { is_emergency: true, emergency_message: EMERGENCY_RESPONSE_TEMPLATE };
    }
  }
  return { is_emergency: false, emergency_message: null };
}

// ---------------------------------------------------------------------------
// Medical Knowledge Base & Symptom Classifier
// ---------------------------------------------------------------------------
const KNOWLEDGE_BASE = {
  'Viral Fever': {
    english: {
      condition: 'Viral Fever',
      cause: 'Viral infection (like adenoviruses or seasonal enteroviruses) triggering immune response and body temperature spike.',
      medication_guidance: 'Paracetamol (e.g., Crocin / Dolo 650) is commonly used to lower fever and relieve body aches. Confirm exact dosage with a pharmacist or doctor.',
      recovery_days: '3 to 5 days with proper rest and hydration.',
      diet_advice: 'Light, warm foods like khichdi, soup, daliya, coconut water, ORS solution, and warm water.',
      foods_to_avoid: 'Oily foods, heavy spicy curries, ice cream, cold carbonated drinks, and junk food.',
      natural_recovery: 'Lukewarm sponge baths, warm salt-water gargling, drinking tulsi-ginger decoction (kadha), and complete bed rest.',
      home_remedies: 'Warm saltwater gargle, sponge forehead with lukewarm water if temperature exceeds 101°F.',
      rest_days: '2 to 3 days complete bed rest; avoid heavy physical work.',
      red_flags: 'Fever exceeding 103°F, shortness of breath, continuous vomiting, or fever persisting beyond 4 days.',
    },
    hindi: {
      condition: 'वायरल बुखार (Viral Fever)',
      cause: 'वायरल संक्रमण के कारण शरीर की रोग प्रतिरोधक क्षमता सक्रिय होती है और बुखार आता है।',
      medication_guidance: 'बुखार और बदन दर्द कम करने के लिए पैरासिटामोल (जैसे डोलो 650 या क्रोसिन) ली जाती है। सही खुराक के लिए डॉक्टर से सलाह लें।',
      recovery_days: '3 से 5 दिन सही आराम और पानी पीने से।',
      diet_advice: 'हल्का और गर्म खाना जैसे खिचड़ी, सूप, दलिया, नारियल पानी, ओआरएस (ORS) और गुनगुना पानी।',
      foods_to_avoid: 'तला-भुना खाना, ज्यादा मसालेदार सब्जी, आइसक्रीम, ठंडी कोल्ड ड्रिंक्स और जंक फूड।',
      natural_recovery: 'गुनगुने पानी की पट्टियां माथे पर रखें, तुलसी-अदरक का काढ़ा पिएं और पूरा आराम करें।',
      home_remedies: 'नमक के गुनगुने पानी से गरारे करें और बुखार 101°F से ऊपर होने पर माथे पर गुनगुने पानी की पट्टी रखें।',
      rest_days: '2 से 3 दिन पूरा बेड रेस्ट करें।',
      red_flags: '103°F से ज्यादा तेज बुखार, सांस लेने में तकलीफ, लगातार उल्टी होना या 4 दिन से ज्यादा बुखार रहना।',
    },
    hinglish: {
      condition: 'Viral Bukhar (Viral Fever)',
      cause: 'Viral infection ki wajah se body ka temperature badh jata hai.',
      medication_guidance: 'Bukhar aur badan dard ke liye Paracetamol (jaise Dolo 650 ya Crocin) istemal hoti hai. Sahi dosage ke liye doctor se baat karein.',
      recovery_days: '3 se 5 din sahi rest aur paani peene se.',
      diet_advice: 'Halka aur garam khana jaise khichdi, daliya, veg soup, nariyal paani, ORS ghol aur gunguna paani.',
      foods_to_avoid: 'Tala hua khana, zyada masaledar cheezein, ice cream, thandi cold drinks aur junk food.',
      natural_recovery: 'Gungune paani ki patti mathe par rakhein, tulsi-adrak ka kadha pio aur poora bed rest karein.',
      home_remedies: 'Gungune namak ke paani se garare karein aur bukhar 101°F se zyada ho toh mathe par patti rakhein.',
      rest_days: '2 se 3 din poora bed rest karein.',
      red_flags: '103°F se zyada bukhar, saans lene me takleef, baar baar ulti aana ya 4 din se zyada bukhar rehna.',
    },
  },
  'Common Cold': {
    english: {
      condition: 'Common Cold',
      cause: 'Rhinovirus infection affecting the upper respiratory tract causing nasal mucosal inflammation.',
      medication_guidance: 'Antihistamines (like Cetirizine) for runny nose, nasal decongestant drops, and mild analgesics for headaches.',
      recovery_days: '4 to 7 days.',
      diet_advice: 'Hot herbal tea (tulsi, ginger, honey), warm chicken/vegetable soups, citrus fruits rich in Vitamin C.',
      foods_to_avoid: 'Chilled drinks, dairy products that increase mucus, fried snacks, and very sweet foods.',
      natural_recovery: 'Steam inhalation with eucalyptus or carom seeds (ajwain), warm saline nasal rinses, honey-ginger paste.',
      home_remedies: 'Steam inhalation twice daily, saline nasal spray, honey with crushed ginger for throat comfort.',
      rest_days: '1 to 2 days of reduced activity and plenty of sleep.',
      red_flags: 'High fever, chest pain, wheezing, or symptoms worsening after 7 days.',
    },
    hindi: {
      condition: 'सामान्य जुकाम / सर्दी (Common Cold)',
      cause: 'राइनोवायरस संक्रमण के कारण नाक और गले में सूजन और पानी बहने लगता है।',
      medication_guidance: 'बहती नाक के लिए सिट्रीज़ीन (Cetirizine), नेज़ल ड्रॉप्स और हल्के सिरदर्द की दवाई ली जा सकती है।',
      recovery_days: '4 से 7 दिन।',
      diet_advice: 'गर्म हर्बल चाय (तुलसी, अदरक, शहद), गर्म सूप, और विटामिन सी वाले फल।',
      foods_to_avoid: 'ठंडा पानी, रात में दही, तली हुई चीजें और ज्यादा मीठा।',
      natural_recovery: 'अजवाइन या विक्स डाल कर भाप लें, अदरक-शहद का पेस्ट खाएं।',
      home_remedies: 'दिन में 2 बार भाप (steam) लें और शहद में पिसा अदरक मिलाकर चाटें।',
      rest_days: '1 से 2 दिन हल्का आराम और पूरी नींद लें।',
      red_flags: 'तेज बुखार, छाती में दर्द, सांस फूलना या 7 दिन से ज्यादा जुकाम रहना।',
    },
    hinglish: {
      condition: 'Sardi / Jukam (Common Cold)',
      cause: 'Rhinovirus infection ki wajah se naak me sujan aur paani behne ki problem hoti hai.',
      medication_guidance: 'Behti naak ke liye Cetirizine, nasal drops aur sar dard ke liye halki dawa li ja sakti hai.',
      recovery_days: '4 se 7 din.',
      diet_advice: 'Garam herbal chai (tulsi, adrak, shahad), garam veg soup aur Vitamin C fruits.',
      foods_to_avoid: 'Thanda paani, raat me dahi, fried snacks aur zyaada meetha khana.',
      natural_recovery: 'Ajwain ya Vicks daal kar steam lein, adrak-shahad ka paste khayein.',
      home_remedies: 'Din me 2 baar steam lein aur shahad me adrak mila kar khayein.',
      rest_days: '1 se 2 din halka rest aur achhi neend lein.',
      red_flags: 'Teez bukhar, chhati me dard, saans phoolna ya 7 din se zyada jukam rehna.',
    },
  },
  'Migraine': {
    english: {
      condition: 'Migraine',
      cause: 'Neurological vascular hyper-reactivity triggered by stress, sleep changes, bright light, or specific foods.',
      medication_guidance: 'OTC analgesics like Ibuprofen or Paracetamol at onset. Specific triptans require a doctor prescription.',
      recovery_days: '4 to 24 hours per episode.',
      diet_advice: 'Hydrating fluids, magnesium-rich foods (spinach, almonds), ginger tea, and regular balanced meals.',
      foods_to_avoid: 'Excessive caffeine, aged cheese, processed meats, skipping meals, and bright screen glare.',
      natural_recovery: 'Rest in a quiet, dark room, apply a cold compress to forehead, and practice slow deep breathing.',
      home_remedies: 'Cold pack on forehead/temples, gentle peppermint oil massage, resting in a dark quiet room.',
      rest_days: '1 day of quiet rest in low light.',
      red_flags: 'Sudden thunderclap headache, fever with stiff neck, vision loss, or numbness/weakness.',
    },
    hindi: {
      condition: 'माइग्रेन (Migraine)',
      cause: 'तनाव, नींद की कमी, तेज रोशनी या खान-पान में बदलाव से सिर के एक तरफ तेज दर्द।',
      medication_guidance: 'शुरुआती दर्द में पैरासिटामोल या आइबुप्रोफेन ली जा सकती है। बार-बार होने पर डॉक्टर से सलाह लें।',
      recovery_days: '4 से 24 घंटे।',
      diet_advice: 'खूब पानी, अदरक की चाय, पालक, बादाम और समय पर संतुलित भोजन।',
      foods_to_avoid: 'ज्यादा कॉफी, भूखे रहना, तेज रोशनी और प्रोसेस्ड फूड।',
      natural_recovery: 'अंधेरे और शांत कमरे में आराम करें, माथे पर ठंडी पट्टी रखें।',
      home_remedies: 'माथे पर ठंडा सेंक, हल्की मालिश और शांत जगह पर नींद लें।',
      rest_days: '1 दिन शांत माहौल में आराम।',
      red_flags: 'अचानक बहुत तेज सिरदर्द, गर्दन में अकड़न, दिखने में धुंधलापन या सुन्नपन।',
    },
    hinglish: {
      condition: 'Migraine',
      cause: 'Stress, neend ki kami, tez roshni ya khane me gap ki wajah se sar dard trigger hota hai.',
      medication_guidance: 'Shuruat me Paracetamol ya Ibuprofen li ja sakti hai. Doctor ki salah zaroori hai.',
      recovery_days: '4 se 24 ghante.',
      diet_advice: 'Paani, adrak chai, palak, badam aur time par khana.',
      foods_to_avoid: 'Zyada caffeine, khali pet rehna, bright screen aur processed food.',
      natural_recovery: 'Andhere aur shant kamre me rest karein, mathe par cold compress lagayein.',
      home_remedies: 'Cold pack on forehead, gentle massage aur dark room me aaram.',
      rest_days: '1 din ka quiet rest.',
      red_flags: 'Achanak bahut tez sar dard, gardan akadna, dhundhla dikhna ya sunnpan.',
    },
  },
  'Gastritis / Acid Reflux': {
    english: {
      condition: 'Gastritis / Acid Reflux',
      cause: 'Irritation of the stomach lining or acid reflux triggered by spicy/oily food, irregular meals, or stress.',
      medication_guidance: 'Antacids (e.g., Digene, Gelusil) or acid reducers (Pantoprazole/Omeprazole) before meals as advised by a doctor.',
      recovery_days: '2 to 4 days with bland diet.',
      diet_advice: 'Oatmeal, bananas, curd/yogurt, coconut water, boiled rice, and small frequent meals.',
      foods_to_avoid: 'Spicy curries, fried snacks, citrus juices, coffee/tea on an empty stomach, and late-night heavy meals.',
      natural_recovery: 'Drink cold milk or fennel (saunf) water, avoid lying down immediately after eating, and elevate head while sleeping.',
      home_remedies: 'Chew fennel seeds after meals, sip lukewarm water or coconut water, eat light bland meals.',
      rest_days: '1 day of light activity; avoid heavy exertion right after meals.',
      red_flags: 'Severe abdominal pain, vomiting blood, black stools, or persistent vomiting.',
    },
    hindi: {
      condition: 'गैस्ट्राइटिस / एसिडिटी (Gastritis)',
      cause: 'मसालेदार या तला खाना, अनियमित भोजन या तनाव के कारण पेट में जलन और एसिड बनना।',
      medication_guidance: 'एंटासिड (जैसे डाइजीन) या डॉक्टर की सलाह से पैंटोप्राज़ोल ली जा सकती है।',
      recovery_days: '2 से 4 दिन हल्के खाने से।',
      diet_advice: 'दलिया, केला, दही, नारियल पानी, सादा चावल और थोड़ा-थोड़ा खाना।',
      foods_to_avoid: 'तीखा, तला-भुना, खाली पेट चाय-कॉफी और देर रात भारी खाना।',
      natural_recovery: 'सौंफ का पानी पिएं, खाने के तुरंत बाद न लेटें।',
      home_remedies: 'खाने के बाद सौंफ चबाएं और नारियल पानी पिएं।',
      rest_days: '1 दिन हल्का आराम।',
      red_flags: 'पेट में बहुत तेज दर्द, खून की उल्टी या लगातार उल्टी होना।',
    },
    hinglish: {
      condition: 'Gastritis / Acidity',
      cause: 'Spicy/oily khana, irregular meals ya stress se pet me jalan aur acid banta hai.',
      medication_guidance: 'Antacid (jaise Digene) ya doctor ki salah se Pantoprazole li ja sakti hai.',
      recovery_days: '2 se 4 din bland diet ke saath.',
      diet_advice: 'Oatmeal, kela, dahi, nariyal paani, sada chawal aur small meals.',
      foods_to_avoid: 'Spicy khana, fried snacks, khali pet chai/coffee aur late-night heavy dinner.',
      natural_recovery: 'Saunf ka paani pio, khane ke turant baad mat letein.',
      home_remedies: 'Khane ke baad saunf chabayein aur nariyal paani piyein.',
      rest_days: '1 din light activity.',
      red_flags: 'Pet me bahut tez dard, khoon ki ulti ya lagatar vomiting.',
    },
  },
};

function predictTop3(symptoms = [], notes = '') {
  const text = `${symptoms.join(' ')} ${notes}`.toLowerCase();
  const scores = [
    {
      condition: 'Viral Fever',
      score:
        (text.includes('fever') || text.includes('chills') || text.includes('body ache') ? 0.55 : 0.25) +
        (text.includes('fatigue') || text.includes('weakness') ? 0.2 : 0),
    },
    {
      condition: 'Common Cold',
      score:
        (text.includes('cough') || text.includes('cold') || text.includes('runny') || text.includes('sore throat') || text.includes('sneez') ? 0.65 : 0.2) +
        (text.includes('congestion') ? 0.15 : 0),
    },
    {
      condition: 'Migraine',
      score:
        (text.includes('headache') || text.includes('migraine') || text.includes('dizz') ? 0.65 : 0.15) +
        (text.includes('light') || text.includes('nausea') ? 0.15 : 0),
    },
    {
      condition: 'Gastritis / Acid Reflux',
      score:
        (text.includes('stomach') || text.includes('acidity') || text.includes('nausea') || text.includes('vomit') || text.includes('abdom') || text.includes('indigestion') ? 0.7 : 0.15),
    },
  ];
  scores.sort((a, b) => b.score - a.score);
  const top3 = scores.slice(0, 3).map((s) => ({
    condition: s.condition,
    confidence: Math.min(0.95, Math.round(s.score * 100) / 100),
  }));
  return { top3, topConf: top3[0].confidence };
}

function getConditionKnowledge(condition, lang = 'english') {
  const entry = KNOWLEDGE_BASE[condition] || KNOWLEDGE_BASE['Viral Fever'];
  const normalized = ['hindi', 'hi'].includes(lang) ? 'hindi' : ['hinglish'].includes(lang) ? 'hinglish' : 'english';
  return entry[normalized] || entry.english;
}

function getAllLanguageKnowledge(condition) {
  return KNOWLEDGE_BASE[condition] || KNOWLEDGE_BASE['Viral Fever'];
}

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
]);
const envModel = (process.env.GEMINI_MODEL || '').trim();
const ACTIVE_MODEL = !envModel || RETIRED_MODELS.has(envModel) ? 'gemini-3.8-flash' : envModel;

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
app.post('/api/assess', requireAuth, (req, res) => {
  const userId = req.user.id;
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

  const safety = checkRedFlagsInIntake(symptoms, data.notes || '', severityScore);
  const symptomsText = symptoms.join(', ');
  const combinedNotes = `Patient: ${data.name || req.user.name}, Age: ${data.age || 25}, Gender: ${data.gender || 'Not specified'}. Main Symptoms: ${symptomsText}. Duration: ${data.duration || '1-2 days'}. Severity: ${severityScore}/10. Notes: ${data.notes || ''}`;

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
      intake_summary: { name: data.name, symptoms, severity_score: severityScore },
    });
  }

  const { top3, topConf } = predictTop3(symptoms, data.notes || '');
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
    reasoningSteps.push(`• Highlighted high discomfort rating (${severityScore}/10) requiring close monitoring.`);
  }
  const clinicalReasoning = reasoningSteps.join('\n');
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
    `Patient: ${data.name || req.user.name} (${data.age || 25} yrs, ${data.gender || 'Not specified'})`,
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
      name: data.name || req.user.name,
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
    const ai = new GoogleGenAI({ apiKey });
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
