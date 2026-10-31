# Personal AI Doctor — Product Requirements Document (PRD)

**Project:** Personal AI Doctor (Symptom Checker & Conversational Health Assistant)
**Author:** Raghav
**Date:** August 27, 2026
**Version:** 2.1 (Comprehensive — supersedes earlier symptom-checker PRD with voice, personalization, report features, and a trained ML classifier for prediction accuracy)

---

## 1. Executive Summary

Personal AI Doctor is a locally-run, privacy-first web app where a user describes symptoms — by typing or speaking, in **Hindi, English, or Hinglish** — and has a natural, human-feeling conversation with an AI that behaves like a caring doctor-friend rather than a form or a search engine. Instead of dumping a wall of text, the AI asks a few clarifying questions first (like a real doctor would), then gives a clear, scannable answer covering the likely condition, why it happened, medication guidance, recovery timeline, diet/home remedies, and rest needed. The user can hear the answer spoken aloud (and stop it anytime), and can download a complete, signed PDF report of the consultation at the end.

The entire AI stack runs locally via **Ollama** — no external API cost, no data leaving the user's machine.

---

## 2. Problem Statement & Goals

**Problem:** People often don't know what a minor illness is, don't want to fill out a clinical intake form, and want quick guidance in the language they actually think in (Hindi/English mixed). Most symptom-checker apps feel robotic, ask everything in one giant form, and dump a wall of text as output.

**Goals:**
- Feel like texting a knowledgeable, warm doctor-friend — not filling a form or reading a medical PDF.
- Support Hindi, English, and Hinglish seamlessly, by both typing and speaking.
- Keep answers short, structured, and readable — never one giant paragraph.
- Personalize responses using a persistent user profile.
- Give a downloadable, professional report at the end of every consultation.
- Be honest about being an assistant, not a replacement for a real doctor — this must never be compromised for the sake of "feeling smart."

---

## 3. Target Users

- Hindi/English/Hinglish-speaking users (primarily India) who want quick guidance for common, everyday ailments (fever, cold, cough, stomach upset, headache, body ache, minor injuries, etc.)
- Users who prefer speaking over typing, or want to multitask while getting guidance
- Users who want a record (PDF) of what was discussed, to show a pharmacist or a real doctor later

---

## 4. Core Features

### 4.1 Multi-Modal Symptom Input
- Free-text chat input — accepts Hindi (Devanagari), English, or Hinglish (Roman-script Hindi) without requiring the user to pick a language first.
- Voice input via the browser's Speech Recognition API — mic button with a live recording animation; supports `hi-IN` and `en-IN` locales.
- User can freely switch between typing and speaking mid-conversation.

### 4.2 Human-Like Conversational AI
- Chat-style interface (ChatGPT-like): message bubbles, typing/streaming animation, no static forms.
- AI replies in the **same language mix the user used** — if user writes Hinglish, AI replies in Hinglish; if English, AI replies in English.
- **Long answers are never sent as one block.** Responses are broken into short, readable chunks/paragraphs — 1–3 sentences at a time, streamed in as they generate — the same way a person texts, not the way a textbook reads.
- Before jumping to a diagnosis, the AI asks 2–4 natural clarifying questions (duration, severity, associated symptoms) — exactly like a real doctor doing intake — instead of guessing from one line.
- Tone is warm and empathetic. The AI never says "As an AI, I cannot..." or talks like a disclaimer-bot; it sounds like a person who happens to know medicine, while still being honest about its limits (see §6).

### 4.3 Structured Diagnosis Output
Once enough information is gathered, the AI's summary response always follows this scannable template:

```
🩺 Possible Condition       — likely condition(s), phrased as "could be", never a certain diagnosis
📋 Why This Happens         — plain-language explanation of the likely cause
💊 Medicine Guidance        — general OTC-category guidance only (see §6 — no precise prescription dosing)
📅 Recovery Timeline        — expected number of days to feel better
🍲 Diet & Home Remedies     — what to eat, what to avoid, simple home care
🛌 Rest Needed              — recommended days of rest
⚠️ See a Doctor Immediately If — clear red-flag criteria
```

### 4.4 Voice Output (Text-to-Speech)
- Speaker/toggle icon lets the user turn AI voice replies on or off.
- **Stop button is always visible while the AI is speaking** — tapping it immediately cancels speech (`speechSynthesis.cancel()`), no waiting for the sentence to finish.
- Uses the browser's native Speech Synthesis API — picks a Hindi voice when available and the user is conversing in Hindi/Hinglish, otherwise an English voice.

### 4.5 User Profile & Personalization
- Lightweight profile: name, age, gender, known allergies, existing chronic conditions (all optional, user can skip).
- Profile persists across sessions (stored locally / in DB) so the AI has context without re-asking basic info every single time.
- Full consultation history is saved per user and viewable later.

### 4.6 Downloadable Consultation Report
- "Download Report" button at the end of every consultation generates a PDF containing:
  - User profile summary (name, age, etc., if provided)
  - Full conversation transcript (questions asked, answers given)
  - Final structured diagnosis summary (condition, cause, medication guidance, recovery time, diet/home remedies, rest days, red-flag warning)
  - Standard medical disclaimer (see §6)
  - Date and time of consultation
  - **Footer signature: "Made by Raghav"** — consistent with your existing project branding

### 4.7 UI/UX
- Clean, modern chat interface — visually closer to a polished consumer chat app than a clinical tool.
- Distinct, clear states for: mic recording, AI "thinking"/streaming, voice playing, errors, empty states.
- No raw errors or stack traces ever shown to the user — always a friendly fallback message with a retry option.
- Sidebar or header for profile and past consultation history.
- Fully responsive (mobile-first, since most users will speak/type from phones).

---

## 5. Safety, Disclaimers & Guardrails

This is the most important section — the whole product is trustworthy only if this is airtight, and it directly builds on the two-layer safety design from the earlier version of this project.

1. **Deterministic red-flag layer runs before the LLM, every time.** A keyword/rule-based checker scans the user's message for emergency indicators (chest pain, breathing difficulty, severe bleeding, signs of stroke, suicidal ideation, high fever in an infant, loss of consciousness, etc.). If triggered, the app immediately shows an emergency message with India's emergency numbers (**112** — national emergency, **108** — ambulance in most states) and skips the casual chat flow entirely — no LLM "personality" involved in an emergency message.
2. **No precise prescription dosing, ever.** Medication guidance stays at the general OTC-category level (e.g., "paracetamol is commonly used for fever" rather than a specific mg/kg dose), and always includes a line telling the user to confirm the exact dose with a pharmacist or doctor.
3. **Every diagnosis-stage response includes a disclaimer** that this is not a confirmed medical diagnosis and a real doctor should be consulted for confirmation — worded naturally, not as a jarring legal notice.
4. **Confidence-gating over confident-sounding guesses.** If symptoms are vague or contradictory, the AI says so honestly and asks more questions rather than forcing a confident-sounding answer.
5. **Never names a controlled/prescription-only medicine + dose combination** that could enable misuse.

---

## 6. Conversational AI Behavior — Sample System Prompt

This is a starting point for the LLM's system prompt; the build agent should refine it during implementation and test it against real conversations.

```
You are a warm, knowledgeable health assistant having a real conversation with someone
who isn't feeling well. You are not a robot reciting facts — you sound like a caring,
switched-on friend who happens to know medicine well.

Rules you always follow:
1. Reply in the same language the user used — if they mix Hindi and English (Hinglish),
   reply the same way. Never force pure Hindi or pure English if they didn't.
2. Never say "As an AI" or talk like a disclaimer bot. Be human in tone, while staying
   honest that you're an assistant, not a licensed doctor.
3. Never answer in one giant paragraph. Break your reply into short, natural chunks —
   the way a person texts, not the way a textbook reads.
4. Before giving any diagnosis, ask 2-4 short clarifying questions if you don't have
   enough information yet — duration, severity, and any other symptoms are usually
   the most useful to ask about first.
5. Once you have enough information, give your answer in this exact structure:
   Possible Condition / Why This Happens / Medicine Guidance / Recovery Timeline /
   Diet & Home Remedies / Rest Needed / See a Doctor Immediately If.
6. For medicine guidance: name general OTC-category options only, never a precise
   dose. Always tell the user to confirm exact dosage with a pharmacist or doctor.
7. If anything you hear sounds like a red-flag emergency, say so plainly and tell them
   to seek urgent in-person care immediately — do not attempt a casual diagnosis.
8. Always end a diagnosis-stage reply with a brief, natural reminder that this isn't a
   confirmed diagnosis and a real doctor should confirm it.
```

### Sample Conversation Flow (illustrating the intended tone and pacing)

```
User: mujhe 2 din se bukhar hai aur badan dard bhi ho raha hai

AI: Oh, ye sunke thoda tension hoti hai 😔 chalo pehle kuch cheezein samajh lete hain.

    Bukhar kitna high hai — thermometer pe check kiya, ya bas garmi jaisa feel ho raha hai?

User: 101 F tha kal raat

AI: Theek hai, samajh gaya. Ek aur cheez — khaasi ya gala kharab bhi hai, ya sirf
    bukhar aur badan dard hi hai?

User: bas ye hi hai, aur thoda weakness feel ho raha hai

AI: 🩺 Possible Condition: Lag raha hai ye viral fever ho sakta hai — common hota hai
    is season mein.

    📋 Why This Happens: Season change ya viral infection ki wajah se aksar aisa
    bukhar aa jata hai, body usse fight kar rahi hoti hai.

    💊 Medicine Guidance: Paracetamol (jaise Crocin/Dolo) generally bukhar aur badan
    dard ke liye li jaati hai — exact dose pharmacist se confirm kar lena.

    📅 Recovery Timeline: Aam taur pe 3-5 din mein aaram ke saath theek ho jata hai.

    🍲 Diet & Home Remedies: Halka khana — khichdi, daliya, garam soup. Paani ya ORS
    zyada piyo, thodi der ke liye chai-coffee kam kar do.

    🛌 Rest Needed: 2-3 din poora rest zaroori hai, abhi office/college skip kar lo.

    ⚠️ See a Doctor Immediately If: bukhar 103°F se upar jaaye, saans lene mein
    dikkat ho, ya 4 din se zyada bukhar na utre.

    Ye ek confirmed diagnosis nahi hai — agar bukhar zyada rahe ya kuch aur naya
    symptom aaye, doctor ko zaroor dikha lena.
```

---

## 7. AI / LLM Model Selection (Ollama, local inference)

| Model | Params | Hindi/Hinglish Handling | Reasoning Ability | Speed | Role in App |
|---|---|---|---|---|---|
| **qwen3:4b** | 4B | Strong — Qwen's multilingual training makes it noticeably better at Hindi/Hinglish than same-size Llama/Gemma models | Good multi-step reasoning for its size — useful for weighing multiple symptoms before a differential | Moderate | **Primary / default model** |
| llama3.2:3b | 3B | Decent English, weaker and less consistent on Hindi/Hinglish | Fine for general chat, lighter reasoning | Fast | Fallback for lower-end hardware |
| gemma2:2b | 2B | English-first, weakest of the three at Hindi/Hinglish | Basic | Fastest | Optional ultra-light mode |

> Note: your message listed the third model as `gemma4:e2b`, which isn't an Ollama tag that exists — this table assumes you meant **gemma2:2b**. Swap it in the config if you meant a different model.

**Recommendation: `qwen3:4b` as the default model.** Since Hindi/Hinglish understanding is core to this app's whole value proposition (not a nice-to-have), and multi-symptom reasoning genuinely improves the quality of the clarifying questions and final differential, the extra size over llama3.2:3b/gemma2:2b is worth it. Keep `llama3.2:3b` wired in as a configurable fallback for users on weaker hardware.

---

## 8. ML-Based Symptom Prediction Layer (Structured Classifier)

The LLM handles conversation and phrasing, but the actual "what condition is this likely to be" call should not be left to the LLM guessing from free text alone. A separately trained, structured ML classifier sits between the conversation and the final answer — it takes the symptoms gathered during the chat and predicts the most likely condition(s) with confidence scores. The LLM then uses this prediction (plus the RAG knowledge base) to phrase the human-sounding answer, instead of inventing a diagnosis on its own. This keeps the final answer both natural-sounding **and** genuinely correct/grounded, not just LLM intuition.

### 8.1 Dataset
- Use a clean, well-established symptom-disease dataset (e.g., a Kaggle disease-symptom dataset) covering common everyday conditions relevant to this app (viral fever, cold/flu, food poisoning, migraine, allergies, gastritis, etc.) — not rare/specialist conditions, since this app targets everyday ailments.
- Clean the data before training: remove duplicate/near-duplicate rows, standardize symptom names/spelling, drop rows with too many missing values.
- **Balance the classes.** If some conditions have far fewer examples than others, use class-weighting or oversampling (e.g., SMOTE) so the model doesn't just learn to predict the most common condition every time.
- Map free-text symptom phrases from the chat (including Hinglish) to the dataset's standard symptom labels before feeding the classifier — this mapping step matters, since the classifier expects structured symptom features, not raw sentences.

### 8.2 Model Training — Avoiding Overfitting
- Split data properly: train / validation / test sets (e.g., 70/15/15), using **stratified splitting** so each condition is proportionally represented in all three sets.
- Use **k-fold cross-validation** during model selection instead of relying on a single train/test split, so reported performance isn't a fluke of one particular split.
- Compare a few algorithms rather than committing to one blindly — Random Forest, Gradient Boosting (e.g., XGBoost), and Logistic Regression are all solid candidates for this kind of tabular symptom data. Pick whichever generalizes best on validation data, not whichever has the highest training accuracy.
- Actively guard against overfitting:
  - Limit tree depth / set `min_samples_leaf` for tree-based models instead of letting trees grow unrestricted.
  - Use L1/L2 regularization for linear models.
  - Watch the gap between training accuracy and validation accuracy — a large gap means the model has memorized rather than learned; if that happens, simplify the model or add more data rather than accepting the high training score.
  - Use early stopping for boosting models, based on validation loss.
- Tune hyperparameters (grid search / randomized search) **on the validation set only** — the test set stays untouched until final evaluation, so the reported accuracy is honest.

### 8.3 Evaluation
- Report accuracy, but don't stop there — also report **precision, recall, and F1-score per condition**. In a health app, missing a condition (false negative) is worse than a false positive, so recall matters more than a single overall accuracy number suggests.
- Use a confusion matrix to see which conditions the model confuses with each other, and revisit the dataset/features for those specific pairs.
- Output the model's **top-3 most likely conditions with confidence percentages** — not one forced answer. This lets the LLM phrase things honestly ("could be X, or possibly Y") when the model itself isn't fully confident, consistent with the confidence-gating principle in §5.

### 8.4 Integration into the Conversation Flow
1. User answers the AI's clarifying questions (§4.2).
2. Backend maps the gathered symptoms to the classifier's structured feature format.
3. Trained classifier predicts the top-3 conditions with confidence scores.
4. RAG service retrieves relevant knowledge-base entries for the top prediction(s).
5. LLM combines the classifier's prediction with the retrieved knowledge to write the final human-sounding structured answer (§4.3) — the LLM's job here is to **communicate the ML model's finding clearly**, not to independently invent a diagnosis.
6. The classifier's confidence score is stored with the diagnosis record and included in the downloadable report, so there's a transparent, correct record of how confident the prediction actually was.

---

## 9. Technical Architecture

### 9.1 Tech Stack
- **Backend:** FastAPI (Python)
- **Frontend:** Vanilla HTML/CSS/JS — chat UI, mic input, TTS playback
- **LLM:** Ollama, running `qwen3:4b` (configurable to `llama3.2:3b` / `gemma2:2b`)
- **ML Classifier:** scikit-learn (Random Forest / XGBoost), trained on a cleaned, balanced symptom-disease dataset per §8, exported as a serialized model (`.pkl`) and served locally by the backend
- **Vector store (RAG):** ChromaDB or Qdrant — curated knowledge base of common conditions, symptoms, home remedies, and general OTC medicine info, used to ground the LLM and reduce hallucination
- **Structured DB:** SQLite for dev, PostgreSQL for production — profiles, conversations, diagnoses, reports
- **Speech-to-text:** Browser-native Speech Recognition API (no server dependency, works offline)
- **Text-to-speech:** Browser-native Speech Synthesis API
- **PDF generation:** wkhtmltopdf or WeasyPrint, rendering an HTML report template to PDF
- **Deployment:** Docker

### 9.2 Suggested Folder Structure

```
personal-ai-doctor/
├── backend/
│   ├── main.py
│   ├── routers/
│   │   ├── chat.py          # streaming chat endpoint
│   │   ├── profile.py       # user profile CRUD
│   │   └── report.py        # PDF report generation/download
│   ├── services/
│   │   ├── llm_service.py        # Ollama integration + streaming
│   │   ├── safety_guard.py       # deterministic red-flag keyword layer
│   │   ├── classifier_service.py # loads trained model, predicts top-3 + confidence
│   │   ├── rag_service.py        # ChromaDB/Qdrant retrieval
│   │   └── report_service.py
│   ├── models/               # Pydantic schemas + DB models
│   ├── db/
│   └── data/                 # knowledge base, red-flag keyword lists
├── ml/
│   ├── train_classifier.py   # cleaning, balancing, cross-validation, training (§8)
│   ├── dataset/               # cleaned, balanced symptom-disease dataset
│   └── model_artifacts/       # trained model + label encoder (.pkl)
├── frontend/
│   ├── index.html
│   ├── css/
│   └── js/
│       ├── chat.js
│       ├── voice.js          # STT + TTS handling
│       └── profile.js
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

### 9.3 Key API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/chat` | Send a user message, stream back the AI's chunked response (internally calls the classifier once enough symptoms are gathered) |
| GET | `/api/profile` | Fetch current user's profile |
| POST | `/api/profile` | Create/update profile |
| GET | `/api/history` | List past consultations |
| POST | `/api/report/generate` | Generate PDF report for a completed consultation |
| GET | `/api/report/download/{id}` | Download a generated report |

### 9.4 Core Data Model (simplified)

- **profiles**: id, name, age, gender, allergies, chronic_conditions, created_at
- **conversations**: id, profile_id, started_at, ended_at
- **messages**: id, conversation_id, role (user/ai), content, timestamp
- **diagnoses**: id, conversation_id, condition, cause, medication_guidance, recovery_days, diet_advice, home_remedies, rest_days, red_flags, **ml_top3_predictions, ml_confidence**, created_at
- **reports**: id, conversation_id, file_path, generated_at

---

## 10. Non-Functional Requirements

- Streaming response should visibly start within ~1–2 seconds of the user sending a message.
- No raw errors, stack traces, or dead ends shown to the user — always a friendly retry-able message.
- Fully functional with zero external API dependency (Ollama, STT, and TTS are all local/browser-native) — no ongoing cost, no data leaving the device.
- Graceful handling if Ollama isn't running or a model isn't pulled yet (clear setup message, not a silent failure).
- Mobile responsive, since a large share of usage will be from phones.

---

## 11. Build Phases

1. **Phase 1:** Core chat UI + Ollama streaming integration + basic conversational flow
2. **Phase 2:** Red-flag safety layer + structured diagnosis output template
3. **Phase 3:** Clean/balance the dataset, train and cross-validate the ML classifier (§8), export model artifacts
4. **Phase 4:** Wire the classifier into the chat flow so the LLM's diagnosis is grounded in the model's prediction
5. **Phase 5:** Voice input (STT) and voice output (TTS + stop control)
6. **Phase 6:** User profile persistence + personalization
7. **Phase 7:** PDF report generation (including ML confidence), branding footer, and download flow
8. **Phase 8:** UI/UX polish, error handling, and end-to-end testing

---

## 12. Future Scope (not in this version)

- Multi-user login/accounts
- Real doctor referral or appointment-booking integration
- Photo-based symptom input (e.g., rashes)
- Support for additional regional Indian languages in voice

---

## 13. Disclaimer (shown in-app, always visible)

*Personal AI Doctor is an AI assistant for general guidance only. It does not provide a confirmed medical diagnosis and is not a substitute for a licensed doctor. In a medical emergency, call 112 (or 108 for ambulance) or visit the nearest hospital immediately.*

---

*Made by Raghav*
