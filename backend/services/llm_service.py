import os
import re
import json
import asyncio
from dotenv import load_dotenv
from backend.services.report_service import COMMON_LAB_PATTERNS

load_dotenv()

SYSTEM_PROMPT_TEMPLATE = """You are Personal AI Doctor, a highly capable, empathetic, and responsible Personal AI Health Assistant.

CRITICAL RULES:
1. UNDERSTAND THE ACTUAL QUESTION: Before answering, analyze WHAT exactly the user is asking. Identify the specific entity, topic, or value they want to know about. Answer ONLY what was asked.

2. RESOLVE REFERENCES: When the user uses words like "it", "that", "this", "my report", "my result", "my problem", "this value", "previous one" — look at the conversation history to understand what they are referring to. Never guess.

3. CONVERSATION MEMORY: You must remember the full conversation context. If the user previously mentioned "headache", and now says "it is on the right side", "it" refers to the headache. Track the current topic and entity.

4. TOPIC CHANGES: If the user changes the topic (e.g., from "headache" to "blood sugar"), follow the new topic. Do not keep answering about the old topic.

5. PERSONAL vs GENERAL QUESTIONS: Distinguish between:
   - "What is hemoglobin?" → General explanation
   - "What is MY hemoglobin?" → User's actual report value
   These are DIFFERENT questions. Answer accordingly.

6. USE ACTUAL DATA FIRST: When the user asks about their report, weight, symptoms, or any personal data, use the ACTUAL VALUES from the provided context. Never give a generic explanation when specific data is available.

7. ZERO HALLUCINATION: NEVER invent patient data, test values, symptoms, medications, or diagnoses. If information is not available, say: "I don't have that information available."

8. MEDICAL SAFETY: Do not diagnose with certainty. Say "these symptoms can have several causes" rather than "you have X." Consider patient's age, allergies, medications, and conditions before giving advice.

9. BREVITY: Answer the question directly first. Only add extra context if useful. Do not dump long explanations unless the user asks for detail.

10. NATURAL CONVERSATION: Be conversational, warm, and empathetic. Address the patient by name naturally (not in every sentence). Greet when greeted. Answer small talk naturally.

11. LANGUAGE: Respond strictly in {language_instruction}. Do not switch languages unless requested.

12. REPORT DATA OVERRIDE: When the user asks about a specific test value (e.g., "What is my hemoglobin?"), use the ACTUAL report value provided in the context. The report data MUST override any general knowledge.

Patient Name: {patient_name}
"""


def normalize_language_instruction(language: str) -> str:
    lang = (language or "english").lower().strip()
    if lang in ["hi", "hindi", "हिंदी"]:
        return "Hindi (strictly in Hindi language using Devanagari script)"
    elif lang in ["hinglish", "hin-eng"]:
        return "Hinglish (Hindi language written in Roman/English script)"
    else:
        return "English"


class LLMService:
    def __init__(self):
        self._default_model = "gemini-flash-lite-latest"

    @property
    def gemini_key(self) -> str:
        return os.getenv("GEMINI_API_KEY", "").strip()

    @property
    def gemini_model(self) -> str:
        env_model = os.getenv("GEMINI_MODEL", "").strip()
        retired = {"gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-2.0-flash", "gemini-2.0-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"}
        if not env_model or env_model in retired:
            return self._default_model
        return env_model

    @property
    def model_name(self) -> str:
        return self.gemini_model

    @property
    def active_provider(self) -> str:
        if self.gemini_key:
            return f"Gemini API ({self.gemini_model})"
        return "No AI provider configured (GEMINI_API_KEY not set)"


    def _build_context(self, history, profile, active_diagnosis, intake_data,
                       language, report_data=None, conversation_id=None):
        """
        Build system instruction string and conversation history list.

        Returns:
            system_instruction (str): Full system prompt + all patient context
            conversation (list): [{"role": "user"|"assistant", "content": str}, ...]
        """
        lang_instr = normalize_language_instruction(language)
        patient_name = (
            profile.get("name")
            if (profile and profile.get("name") and profile.get("name") != "Guest User")
            else "Patient"
        )
        system_content = SYSTEM_PROMPT_TEMPLATE.format(
            language_instruction=lang_instr,
            patient_name=patient_name
        )

        # Determine intent from the latest user message for report filtering
        latest_user_msg = ""
        if history:
            for msg in reversed(history):
                if msg.get("role") == "user":
                    latest_user_msg = msg.get("content", "")
                    break
        intent = self._extract_intent(latest_user_msg)

        context_blocks = []

        # 1. Patient Profile Context
        if profile:
            profile_parts = []
            mappings = [
                ("name", "Name", ("Guest User",)),
                ("age", "Age", ("Unspecified",)),
                ("gender", "Gender", ("Unspecified",)),
                ("height", "Height", ("Not specified", "None", "")),
                ("weight", "Weight", ("Not specified", "None", "")),
                ("allergies", "Allergies", ("None", "none", "")),
                ("chronic_conditions", "Chronic Conditions", ("None", "none", "")),
            ]
            for key, label, skip_vals in mappings:
                val = profile.get(key, "")
                if val and str(val) not in skip_vals:
                    profile_parts.append(f"- {label}: {val}")
            if profile_parts:
                context_blocks.append("PATIENT PROFILE:\n" + "\n".join(profile_parts))

        # 2. Active Intake & Assessment Context
        if intake_data or active_diagnosis:
            intake_parts = []
            if intake_data and isinstance(intake_data, dict):
                syms = intake_data.get("symptoms", [])
                if syms:
                    if isinstance(syms, list):
                        syms = ", ".join(syms)
                    intake_parts.append(f"Reported Symptoms: {syms}")
                for field, label in [
                    ("duration", "Duration"),
                    ("trajectory", "Trajectory"),
                    ("recent_food_activity", "Recent Food/Activity"),
                    ("current_medications", "Current Medications"),
                    ("notes", "Additional Notes"),
                ]:
                    val = intake_data.get(field)
                    if val and str(val).lower() != "none":
                        intake_parts.append(f"{label}: {val}")
                severity = intake_data.get("severity_score")
                if severity:
                    intake_parts.append(f"Pain Severity: {severity}/10")

            if active_diagnosis and isinstance(active_diagnosis, dict):
                cond = active_diagnosis.get("condition")
                if cond:
                    intake_parts.append(f"Assessed Condition: {cond}")
                cause = active_diagnosis.get("cause")
                if cause:
                    intake_parts.append(f"Assessment Reasoning: {cause}")

            if intake_parts:
                context_blocks.append("ACTIVE CLINICAL CONTEXT:\n" + "\n".join(f"- {p}" for p in intake_parts))

        # 3. Medical Report Context
        from backend.services.report_service import format_structured_report_context
        from backend.db.database import get_latest_patient_report

        fetched_report = report_data or (
            get_latest_patient_report(conversation_id) if conversation_id
            else get_latest_patient_report()
        )
        if fetched_report:
            if intent and intent.get("type") == "lab_test":
                report_str = self._format_report_for_test(fetched_report, intent.get("entity"))
            else:
                report_str = format_structured_report_context(fetched_report)
            context_blocks.append(report_str)

        # Combine system prompt + context into one system instruction
        full_system = system_content
        if context_blocks:
            full_system += "\n\n" + "\n\n".join(context_blocks)

        # Build conversation history (last 20 messages)
        conversation = []
        if history:
            for msg in history[-20:]:
                role = "assistant" if msg.get("role") in ("assistant", "ai") else "user"
                content = msg.get("content", "")
                if content:
                    conversation.append({"role": role, "content": content})

        print(f"[LLMService] Provider: {self.active_provider} | History: {len(conversation)} msgs")
        return full_system, conversation

    async def generate_response_stream(self, conversation_id=None, history=None, profile=None,
                                       active_diagnosis=None, intake_data=None,
                                       language="english", report_data=None):
        system_instruction, conversation = self._build_context(
            history, profile, active_diagnosis, intake_data, language,
            report_data, conversation_id=conversation_id
        )

        if not self.gemini_key:
            yield (
                "⚠️ AI service is not configured. "
                "Please set the GEMINI_API_KEY environment variable on Render."
            )
            return

        try:
            async for chunk in self._stream_gemini(system_instruction, conversation):
                yield chunk
        except Exception as e:
            print(f"[LLMService] Gemini Error: {type(e).__name__}: {e}")
            yield _gemini_error_message(e)

    async def _stream_gemini(self, system_instruction: str, conversation: list):
        """
        Async streaming with Google Gemini using the google-genai SDK (v1.0+)
        with automatic model fallback across active Flash models.
        """
        from google import genai
        from google.genai import types

        if not conversation or conversation[-1]["role"] != "user":
            yield "I couldn't process your message. Please try again."
            return

        last_user_message = conversation[-1]["content"]
        history_messages = conversation[:-1]

        gemini_history = []
        for msg in history_messages:
            gemini_role = "model" if msg["role"] == "assistant" else "user"
            gemini_history.append(
                types.Content(
                    role=gemini_role,
                    parts=[types.Part.from_text(text=msg["content"])]
                )
            )

        gemini_history.append(
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=last_user_message)]
            )
        )

        client = genai.Client(
            api_key=self.gemini_key,
            http_options=types.HttpOptions(headers={"User-Agent": "aistudio-build"}),
        )
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            max_output_tokens=1024,
        )

        preferred_defaults = [
            self.gemini_model,
            "gemini-flash-lite-latest",
            "gemini-3.1-flash-lite",
            "gemini-3.8-flash",
            "gemini-flash-latest",
            "gemini-3-flash-preview",
        ]
        models_to_try = []
        for m in preferred_defaults:
            if m and m not in models_to_try:
                models_to_try.append(m)

        last_exception = None
        for idx, model_name in enumerate(models_to_try):
            try:
                print(f"[LLMService] Attempting Gemini stream with model: {model_name}")
                async for chunk in await client.aio.models.generate_content_stream(
                    model=model_name,
                    contents=gemini_history,
                    config=config,
                ):
                    text = getattr(chunk, "text", None)
                    if text:
                        yield text
                return
            except Exception as e:
                last_exception = e
                if idx < len(models_to_try) - 1:
                    print(f"[LLMService] Model '{model_name}' failed ({e}), trying next candidate...")
                    continue
                else:
                    raise e

        if last_exception:
            raise last_exception



    def _extract_intent(self, user_msg: str) -> dict:
        """Very light intent extraction for lab test queries."""
        if not user_msg:
            return {}
        lowered = user_msg.lower()
        for pattern in COMMON_LAB_PATTERNS:
            name = pattern["name"].lower()
            if name in lowered:
                return {"entity": pattern["name"], "type": "lab_test"}
        symptom_keywords = ["headache", "pain", "fever", "cough", "dizzy", "tired"]
        for sym in symptom_keywords:
            if sym in lowered:
                return {"entity": sym, "type": "symptom"}
        return {}

    def _format_report_for_test(self, report_record: dict, test_name: str) -> str:
        """Return minimal report string containing only the requested test."""
        from backend.services.report_service import format_structured_report_context
        extracted = report_record.get("extracted_json", {})
        if isinstance(extracted, str):
            try:
                extracted = json.loads(extracted)
            except Exception:
                extracted = {}
        tests = extracted.get("tests", [])
        matching = [t for t in tests if t.get("test", "").lower() == test_name.lower()]
        if matching:
            rep_name = report_record.get("report_name") or extracted.get("report_name") or "Medical Lab Report"
            rep_date = report_record.get("report_date") or extracted.get("date") or "Recent"
            lines = [
                "MEDICAL REPORT CONTEXT:",
                f"- Report Name: {rep_name}",
                f"- Date: {rep_date}",
                "- Parsed Lab Test Findings:"
            ]
            for t in matching:
                t_name = t.get("test", "Test")
                val = t.get("value", "N/A")
                unit = t.get("unit", "")
                ref = t.get("reference_range", "")
                flag = t.get("flag", "normal")
                lines.append(f"  * {t_name}: {val} {unit} (Ref Range: {ref}) [Status: {flag.upper()}]")
            return "\n".join(lines)
        return format_structured_report_context(report_record)


def _gemini_error_message(exc: Exception) -> str:
    """Convert Gemini SDK exceptions into user-friendly messages with raw error details."""
    err_str = str(exc).lower()
    if "api_key" in err_str or "unauthorized" in err_str:
        return f"⚠️ AI authentication failed: {str(exc)}"
    elif "quota" in err_str or "resource_exhausted" in err_str or "429" in err_str:
        return f"⚠️ AI rate limit reached (429): {str(exc)}"
    elif "block" in err_str or "safety" in err_str or "harm" in err_str:
        return f"⚠️ Safety filter block: {str(exc)}"
    elif "not found" in err_str or "404" in err_str:
        return f"⚠️ AI resource/model not found (404): {str(exc)}"
    elif "timeout" in err_str or "deadline" in err_str:
        return f"⚠️ AI response timed out: {str(exc)}"
    else:
        return f"⚠️ AI service error: {str(exc)}"






llm_service = LLMService()
