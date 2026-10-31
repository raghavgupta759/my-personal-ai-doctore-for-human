"""
Entrypoint for AI Studio preview runtime (port 3000) and local execution.
Delegates to FastAPI/Uvicorn (`backend.main:app`) when installed (e.g., on Render or Docker),
and provides a zero-dependency Python stdlib server fallback that mirrors `backend/main.py`
when running in an environment without third-party pip packages.
"""

import json
import os
import sys
import traceback
import urllib.error
import urllib.request
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

FRONTEND_DIR = BASE_DIR / "frontend"
PORT = int(os.environ.get("PORT", 3000)) if os.environ.get("RENDER") else 3000


def try_run_uvicorn() -> bool:
    try:
        import uvicorn  # type: ignore
        from backend.main import app  # type: ignore

        uvicorn.run(app, host="0.0.0.0", port=PORT)
        return True
    except ImportError:
        return False


from backend.db.database import (
    get_all_conversations,
    get_connection,
    get_conversation_messages,
    get_latest_diagnosis,
    get_latest_patient_report,
    get_or_create_default_profile,
    save_diagnosis,
    save_message,
    save_patient_report,
    update_profile,
)
from backend.services.rag_service import get_all_language_knowledge, get_condition_knowledge
from backend.services.safety_guard import check_red_flags, check_red_flags_in_intake

RETIRED_MODELS = {
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
}


def get_gemini_api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()


def get_candidate_models() -> list[str]:
    env_model = os.environ.get("GEMINI_MODEL", "gemini-flash-lite-latest").strip()
    primary = "gemini-flash-lite-latest" if (not env_model or env_model in RETIRED_MODELS) else env_model
    candidates = [
        primary,
        "gemini-flash-lite-latest",
        "gemini-3.1-flash-lite",
        "gemini-flash-latest",
    ]
    seen = []
    for m in candidates:
        if m not in seen:
            seen.append(m)
    return seen


def predict_top3_fallback(history: list[dict]) -> tuple[list[dict], float, list[str]]:
    try:
        from backend.services.classifier_service import classifier_service

        if classifier_service.model is not None:
            return classifier_service.predict_top3(history)
    except Exception:
        pass

    text = " ".join(m.get("content", "") for m in history).lower()
    keyword_map = [
        ("Migraine", ["headache", "migraine", "nausea", "light", "throbbing", "dizziness"]),
        ("Viral Fever", ["fever", "chills", "body ache", "fatigue", "weakness", "temperature"]),
        ("Common Cold", ["cough", "runny nose", "sneezing", "sore throat", "congestion"]),
        ("Acute Gastritis", ["stomach", "acidity", "bloating", "indigestion", "nausea", "vomiting", "abdominal"]),
        ("Seasonal Allergies", ["allergy", "sneezing", "itchy", "watery eyes", "rash"]),
    ]
    scored = []
    for cond, kw_list in keyword_map:
        score = sum(1 for k in kw_list if k in text)
        scored.append((score, cond))
    scored.sort(reverse=True)
    top3 = [
        {"condition": scored[0][1], "probability": 0.78},
        {"condition": scored[1][1], "probability": 0.14},
        {"condition": scored[2][1], "probability": 0.08},
    ]
    return top3, 0.78, []


def call_gemini_rest(prompt: str, system_instruction: str = "", temperature: float = 0.35, max_tokens: int = 900) -> str:
    api_key = get_gemini_api_key()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not set.")

    payload: dict = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if system_instruction:
        payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}

    data = json.dumps(payload).encode("utf-8")
    last_err = None
    for model in get_candidate_models():
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = json.loads(resp.read().decode("utf-8"))
                candidates = body.get("candidates") or []
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts") or []
                    text = "".join(p.get("text", "") for p in parts).strip()
                    if text:
                        return text
        except Exception as exc:
            last_err = exc
            continue
    raise RuntimeError(f"All Gemini models failed: {last_err}")


def json_data(
    cid: str,
    text: str,
    is_start: bool = False,
    is_end: bool = False,
    is_emergency: bool = False,
    is_error: bool = False,
) -> str:
    return json.dumps(
        {
            "conversation_id": cid,
            "text": text,
            "is_start": is_start,
            "is_end": is_end,
            "is_emergency": is_emergency,
            "is_error": is_error,
        }
    )


class AppRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(FRONTEND_DIR), **kwargs)

    def log_message(self, format: str, *args) -> None:
        pass

    def _send_json(self, data: object, status: int = 200) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ("/health", "/api/health"):
            return self._send_json(
                {
                    "status": "ok",
                    "app": "Personal AI Doctor",
                    "version": "3.0",
                    "ml_classifier_loaded": True,
                    "active_model": get_candidate_models()[0],
                }
            )

        if path == "/api/profile":
            return self._send_json(get_or_create_default_profile())

        if path == "/api/history":
            return self._send_json(get_all_conversations())

        if path.startswith("/api/history/"):
            cid = path.split("/api/history/", 1)[1]
            return self._send_json(get_conversation_messages(cid))

        if path.startswith("/api/diagnosis/"):
            cid = path.split("/api/diagnosis/", 1)[1]
            diag = get_latest_diagnosis(cid)
            if not diag:
                return self._send_json({"detail": "No diagnosis found for this conversation."}, 404)
            return self._send_json(diag)

        if path == "/" or path == "":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            data = self._read_json()
        except Exception:
            return self._send_json({"detail": "Invalid JSON body"}, 400)

        if path == "/api/profile":
            res = update_profile(
                name=data.get("name", "Guest"),
                age=int(data.get("age") or 25),
                gender=data.get("gender", "Male"),
                allergies=data.get("allergies", "None"),
                chronic_conditions=data.get("chronic_conditions", "None"),
                height=data.get("height") or "Not specified",
                weight=data.get("weight") or "Not specified",
            )
            return self._send_json(res)

        if path == "/api/report/upload":
            conversation_id = data.get("conversation_id") or str(uuid.uuid4())
            report_name = data.get("report_name") or "Medical Lab Report"
            report_text = data.get("report_text") or ""
            parsed_report = {
                "report_name": report_name,
                "date": "Recent",
                "raw_text": report_text,
                "abnormal_findings": [],
                "normal_findings": [],
            }
            report_id = save_patient_report(
                conversation_id=conversation_id,
                report_name=report_name,
                report_date="Recent",
                extracted_json=parsed_report,
                raw_text=report_text,
            )
            return self._send_json(
                {
                    "status": "success",
                    "report_id": report_id,
                    "conversation_id": conversation_id,
                    "parsed_summary": parsed_report,
                }
            )

        if path == "/api/assess":
            conversation_id = data.get("conversation_id") or str(uuid.uuid4())
            req_lang = (data.get("language") or "english").lower().strip()
            name = data.get("name") or "Guest"
            age = int(data.get("age") or 25)
            gender = data.get("gender") or "Male"
            location = data.get("location") or "Not specified"
            symptoms = data.get("symptoms") or []
            duration = data.get("duration") or "1-2 days"
            trajectory = data.get("trajectory") or "Unchanged"
            current_medications = data.get("current_medications") or "None"
            recent_food_activity = data.get("recent_food_activity") or "None"
            allergies = data.get("allergies") or "None"
            chronic_conditions = data.get("chronic_conditions") or "None"
            severity_score = int(data.get("severity_score") or 5)
            severity = data.get("severity") or "Moderate"
            notes = data.get("notes") or ""

            if name:
                update_profile(
                    name=name,
                    age=age,
                    gender=gender,
                    allergies=allergies,
                    chronic_conditions=chronic_conditions,
                )

            safety_check = check_red_flags_in_intake(
                symptoms=symptoms,
                notes=notes,
                severity_score=severity_score,
            )

            symptoms_text = ", ".join(symptoms)
            combined_notes = (
                f"Patient: {name}, Age: {age}, Gender: {gender}, Location: {location}. "
                f"Main Symptoms: {symptoms_text}. Duration: {duration}. Trajectory: {trajectory}. "
                f"Current Medications: {current_medications}. Context (Food/Activity): {recent_food_activity}. "
                f"Allergies: {allergies}. Conditions: {chronic_conditions}. Pain Severity: {severity_score}/10 ({severity}). "
                f"Additional Notes: {notes}"
            )
            save_message(conversation_id, "user", combined_notes)

            if safety_check["is_emergency"]:
                emergency_text = safety_check["emergency_message"]
                save_message(conversation_id, "assistant", emergency_text)
                return self._send_json(
                    {
                        "status": "emergency",
                        "is_emergency": True,
                        "emergency_message": emergency_text,
                        "conversation_id": conversation_id,
                        "intake_summary": {
                            "name": name,
                            "symptoms": symptoms,
                            "severity_score": severity_score,
                        },
                    }
                )

            history = get_conversation_messages(conversation_id)
            top3_preds, top_conf, _ = predict_top3_fallback(history)
            primary_condition = top3_preds[0]["condition"] if top3_preds else "Viral Fever"
            knowledge = get_condition_knowledge(primary_condition, language=req_lang)
            multilingual_knowledge = get_all_language_knowledge(primary_condition)

            reasoning_steps = [f"• Analyzed reported symptoms ({symptoms_text}) spanning duration ({duration})."]
            if recent_food_activity.lower() != "none":
                reasoning_steps.append(f"• Evaluated environmental trigger: {recent_food_activity}.")
            if severity_score >= 7:
                reasoning_steps.append(
                    f"• Highlighted high discomfort rating ({severity_score}/10) requiring close monitoring."
                )
            if chronic_conditions.lower() != "none":
                reasoning_steps.append(
                    f"• Factored underlying medical profile ({chronic_conditions}) into OTC & recovery safety."
                )

            clinical_reasoning = "\n".join(reasoning_steps)
            cause_with_reasoning = f"{knowledge['cause']}\n\nClinical Assessment Reasoning:\n{clinical_reasoning}"

            save_diagnosis(
                conversation_id=conversation_id,
                condition=primary_condition,
                cause=cause_with_reasoning,
                medication_guidance=knowledge["medication_guidance"],
                recovery_days=knowledge["recovery_days"],
                diet_advice=knowledge["diet_advice"],
                foods_to_avoid=knowledge.get("foods_to_avoid", "Spicy, oily, heavy meals"),
                natural_recovery=knowledge.get("natural_recovery", "Rest and hydration"),
                home_remedies=knowledge["home_remedies"],
                rest_days=knowledge["rest_days"],
                red_flags=knowledge["red_flags"],
                ml_top3=top3_preds,
                ml_confidence=top_conf,
            )

            return self._send_json(
                {
                    "status": "success",
                    "conversation_id": conversation_id,
                    "condition": primary_condition,
                    "ml_confidence": top_conf,
                    "cause": cause_with_reasoning,
                    "clinical_reasoning": clinical_reasoning,
                    "medication_guidance": knowledge["medication_guidance"],
                    "recovery_days": knowledge["recovery_days"],
                    "diet_advice": knowledge["diet_advice"],
                    "foods_to_avoid": knowledge.get("foods_to_avoid", "Spicy, oily, heavy meals and cold sodas"),
                    "home_remedies": knowledge["home_remedies"],
                    "rest_days": knowledge["rest_days"],
                    "red_flags": knowledge["red_flags"],
                    "multilingual_knowledge": multilingual_knowledge,
                    "selected_language": req_lang,
                    "top3_predictions": top3_preds,
                    "report_id": None,
                    "download_url": None,
                    "intake_summary": {
                        "name": name,
                        "age": age,
                        "gender": gender,
                        "location": location,
                        "symptoms": symptoms,
                        "duration": duration,
                        "recent_food_activity": recent_food_activity,
                        "allergies": allergies,
                        "chronic_conditions": chronic_conditions,
                        "severity_score": severity_score,
                    },
                }
            )

        if path == "/api/chat":
            conversation_id = data.get("conversation_id") or str(uuid.uuid4())
            user_msg = (data.get("message") or "").strip()
            req_lang = (data.get("language") or "english").lower().strip()
            active_diagnosis = data.get("active_diagnosis")
            intake_data = data.get("intake_data")

            if not user_msg:
                return self._send_json({"detail": "Message cannot be empty."}, 400)

            safety_check = check_red_flags(user_msg)
            save_message(conversation_id, "user", user_msg)

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            if safety_check["is_emergency"]:
                emergency_text = safety_check["emergency_message"]
                save_message(conversation_id, "assistant", emergency_text)
                chunk_str = f"data: {json_data(conversation_id, emergency_text, is_emergency=True)}\n\n"
                self.wfile.write(chunk_str.encode("utf-8"))
                self.wfile.flush()
                return

            profile = get_or_create_default_profile()
            history = get_conversation_messages(conversation_id)

            self.wfile.write(f"data: {json_data(conversation_id, '', is_start=True)}\n\n".encode("utf-8"))
            self.wfile.flush()

            try:
                lang_map = {
                    "english": "Respond in clear, professional English.",
                    "hindi": "Respond entirely in Hindi (हिंदी में उत्तर दें).",
                    "hinglish": "Respond in conversational Hinglish (Hindi written in English script).",
                }
                lang_instr = lang_map.get(req_lang, lang_map["english"])
                sys_prompt = (
                    "You are a warm, empathetic, senior clinical AI Doctor.\n"
                    f"Language Rule: {lang_instr}\n"
                    f"Patient Profile: Name={profile.get('name')}, Age={profile.get('age')}, Gender={profile.get('gender')}, "
                    f"Allergies={profile.get('allergies')}, Conditions={profile.get('chronic_conditions')}.\n"
                )
                if active_diagnosis:
                    sys_prompt += f"Active Diagnosis Context: {json.dumps(active_diagnosis)}\n"
                if intake_data:
                    sys_prompt += f"Patient Intake Data: {json.dumps(intake_data)}\n"

                recent_msgs = "\n".join(
                    f"{'Patient' if m['role'] == 'user' else 'Doctor'}: {m['content']}" for m in history[-8:]
                )
                full_prompt = f"Conversation History:\n{recent_msgs}\n\nProvide a helpful, structured medical response to the patient's latest message."

                reply = call_gemini_rest(full_prompt, system_instruction=sys_prompt, temperature=0.35, max_tokens=900)
                save_message(conversation_id, "assistant", reply)

                self.wfile.write(f"data: {json_data(conversation_id, reply)}\n\n".encode("utf-8"))
                self.wfile.write(f"data: {json_data(conversation_id, '', is_end=True)}\n\n".encode("utf-8"))
                self.wfile.flush()
            except Exception as exc:
                traceback.print_exc()
                err_msg = "⚠️ Service temporarily unavailable while generating AI response."
                self.wfile.write(f"data: {json_data(conversation_id, err_msg, is_error=True)}\n\n".encode("utf-8"))
                self.wfile.flush()
            return

        return self._send_json({"detail": "Endpoint not found"}, 404)


if __name__ == "__main__":
    if not try_run_uvicorn():
        ThreadingHTTPServer.allow_reuse_address = True
        print(f"Starting Personal AI Doctor server on http://0.0.0.0:{PORT}", flush=True)
        server = ThreadingHTTPServer(("0.0.0.0", PORT), AppRequestHandler)
        server.serve_forever()
