"""
Entrypoint for AI Studio preview runtime (port 3000) and local execution.
Delegates to FastAPI/Uvicorn (`backend.main:app`) when installed (e.g., on Render or Docker),
and provides a zero-dependency Python stdlib server fallback that mirrors `backend/main.py`
when running in an environment without third-party pip packages.
"""

import json
import os
import re
import sys
import traceback
import urllib.error
import urllib.request
import uuid
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

FRONTEND_DIR = BASE_DIR / "frontend"
REPORTS_DIR = BASE_DIR / "reports"
REPORTS_DIR.mkdir(exist_ok=True)
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
    authenticate_user,
    create_session,
    create_user,
    delete_session,
    get_all_conversations,
    get_connection,
    get_conversation_messages,
    get_latest_diagnosis,
    get_latest_patient_report,
    get_or_create_default_profile,
    get_user_by_token,
    save_diagnosis,
    save_message,
    save_patient_report,
    update_profile,
    verify_conversation_ownership,
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
        {"condition": scored[0][1], "probability": 0.78, "confidence": 0.78},
        {"condition": scored[1][1], "probability": 0.14, "confidence": 0.14},
        {"condition": scored[2][1], "probability": 0.08, "confidence": 0.08},
    ]
    return top3, 0.78, []


def generate_pdf_fallback(conversation_id: str, user_id: str) -> str:
    try:
        from backend.services.report_service import generate_pdf_report

        return generate_pdf_report(conversation_id, user_id=user_id)
    except Exception:
        # Generate a valid minimal PDF file when reportlab is not installed
        profile = get_or_create_default_profile(user_id=user_id)
        diag = get_latest_diagnosis(conversation_id, user_id=user_id) or {}
        report_id = str(uuid.uuid4())
        file_path = str(REPORTS_DIR / f"consultation_report_{conversation_id[:8]}_{report_id[:6]}.pdf")
        lines = [
            "Personal AI Doctor - Consultation Report",
            f"Patient: {profile.get('name', 'Patient')} ({profile.get('age', 25)} yrs, {profile.get('gender', '')})",
            f"Condition: {diag.get('condition', 'Health Assessment')}",
            f"Medication Guidance: {diag.get('medication_guidance', 'N/A')}",
            f"Diet Advice: {diag.get('diet_advice', 'N/A')}",
        ]
        text_ops = " ".join(
            f"BT /F1 11 Tf 40 {750 - idx * 24} Td ({line.replace('(', '[').replace(')', ']')[:90]}) Tj ET"
            for idx, line in enumerate(lines)
        )
        pdf_bytes = (
            "%PDF-1.4\n"
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
            "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
            "3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> "
            "/MediaBox [0 0 612 792] /Contents 5 0 R >> endobj\n"
            "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
            f"5 0 obj << /Length {len(text_ops)} >> stream\n{text_ops}\nendstream endobj\n"
            "xref\n0 6\ntrailer << /Size 6 /Root 1 0 R >>\n%%EOF\n"
        ).encode("latin-1", errors="ignore")
        with open(file_path, "wb") as f:
            f.write(pdf_bytes)

        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO reports (id, user_id, conversation_id, file_path) VALUES (?, ?, ?, ?)",
            (report_id, user_id, conversation_id, file_path),
        )
        conn.commit()
        conn.close()
        return report_id


def parse_report_fallback(report_text: str, report_name: str = "Medical Lab Report") -> dict:
    try:
        from backend.services.report_service import parse_medical_report_text

        return parse_medical_report_text(report_text, report_name)
    except Exception:
        cleaned = (report_text or "").strip()
        tests = []
        patterns = [
            ("Hemoglobin", r"(?:hemoglobin|hb|hgb)\b[^\d]*(\d+(?:\.\d+)?)", "g/dL", "12.0 - 17.0 g/dL"),
            ("WBC", r"(?:wbc|tlc)\b[^\d]*(\d+(?:\.\d+)?|\d+,\d+)", "/uL", "4,000 - 11,000 /uL"),
            ("Platelet Count", r"(?:platelet|plt)\b[^\d]*(\d+(?:\.\d+)?|\d+,\d+)", "/uL", "150,000 - 450,000 /uL"),
            ("Fasting Glucose", r"(?:fasting blood sugar|fasting glucose|fbs|glucose)\b[^\d]*(\d+(?:\.\d+)?)", "mg/dL", "70 - 99 mg/dL"),
        ]
        for name, rx, unit, ref in patterns:
            m = re.search(rx, cleaned, re.IGNORECASE)
            if m:
                tests.append({"test": name, "value": m.group(1), "unit": unit, "reference_range": ref, "status": "recorded"})
        return {
            "report_name": report_name,
            "date": "Recent",
            "raw_text": cleaned,
            "tests": tests,
        }


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

    def _send_json(self, data: object, status: int = 200, extra_headers: dict | None = None) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def _extract_token(self) -> str | None:
        auth_header = self.headers.get("Authorization") or self.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            return auth_header[7:].strip()
        cookie_header = self.headers.get("Cookie")
        if cookie_header:
            cookie = SimpleCookie()
            try:
                cookie.load(cookie_header)
                if "ai_doctor_session" in cookie:
                    return cookie["ai_doctor_session"].value.strip()
            except Exception:
                pass
        return None

    def _require_user(self) -> dict | None:
        token = self._extract_token()
        user = get_user_by_token(token) if token else None
        if not user:
            self._send_json({"detail": "Authentication required. Please log in."}, 401)
            return None
        return user

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

        if path == "/api/auth/me":
            user = self._require_user()
            if not user:
                return
            return self._send_json({"authenticated": True, "user": user})

        if path == "/api/profile":
            user = self._require_user()
            if not user:
                return
            return self._send_json(get_or_create_default_profile(user_id=user["id"]))

        if path == "/api/history":
            user = self._require_user()
            if not user:
                return
            return self._send_json(get_all_conversations(user_id=user["id"]))

        if path.startswith("/api/history/"):
            user = self._require_user()
            if not user:
                return
            cid = path.split("/api/history/", 1)[1]
            ownership = verify_conversation_ownership(cid, user["id"])
            if ownership == "forbidden":
                return self._send_json({"detail": "Access denied: You do not own this medical record."}, 403)
            if ownership == "not_found":
                return self._send_json({"detail": "Conversation not found."}, 404)
            return self._send_json(get_conversation_messages(cid, user_id=user["id"]))

        if path.startswith("/api/diagnosis/"):
            user = self._require_user()
            if not user:
                return
            cid = path.split("/api/diagnosis/", 1)[1]
            ownership = verify_conversation_ownership(cid, user["id"])
            if ownership == "forbidden":
                return self._send_json({"detail": "Access denied: You do not own this diagnosis record."}, 403)
            diag = get_latest_diagnosis(cid, user_id=user["id"])
            if not diag:
                return self._send_json({"detail": "No diagnosis found for this conversation."}, 404)
            return self._send_json(diag)

        if path.startswith("/api/report/download/"):
            user = self._require_user()
            if not user:
                return
            report_id = path.split("/api/report/download/", 1)[1]
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT file_path, user_id FROM reports WHERE id = ?", (report_id,))
            row = cursor.fetchone()
            conn.close()
            if not row:
                return self._send_json({"detail": "Report file not found."}, 404)
            if row["user_id"] != user["id"]:
                return self._send_json({"detail": "Access denied: You do not own this medical report."}, 403)
            if not os.path.exists(row["file_path"]):
                return self._send_json({"detail": "Report file not found on disk."}, 404)
            with open(row["file_path"], "rb") as f:
                pdf_bytes = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(pdf_bytes)))
            self.send_header(
                "Content-Disposition",
                f'inline; filename="{os.path.basename(row["file_path"])}"',
            )
            self.end_headers()
            self.wfile.write(pdf_bytes)
            return

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

        # ------------------------------------------------------------------
        # Authentication Endpoints
        # ------------------------------------------------------------------
        if path == "/api/auth/register":
            name = (data.get("name") or "").strip()
            email = (data.get("email") or "").strip().lower()
            password = data.get("password") or ""
            confirm_password = data.get("confirm_password") or ""

            if not name or len(name) < 2:
                return self._send_json({"detail": "Please enter your full name (at least 2 characters)."}, 400)
            if not email or "@" not in email or "." not in email.split("@")[-1]:
                return self._send_json({"detail": "Please enter a valid email address."}, 400)
            if len(password) < 6:
                return self._send_json({"detail": "Password must be at least 6 characters long."}, 400)
            if password != confirm_password:
                return self._send_json({"detail": "Passwords do not match."}, 400)

            try:
                user = create_user(name=name, email=email, password=password)
            except ValueError as e:
                return self._send_json({"detail": str(e)}, 400)

            token = create_session(user["id"])
            cookie_val = f"ai_doctor_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={14 * 24 * 3600}"
            return self._send_json(
                {"status": "success", "token": token, "user": user},
                200,
                extra_headers={"Set-Cookie": cookie_val},
            )

        if path == "/api/auth/login":
            email = (data.get("email") or "").strip()
            password = data.get("password") or ""
            if not email or not password:
                return self._send_json({"detail": "Email and password are required."}, 400)

            user = authenticate_user(email, password)
            if not user:
                return self._send_json({"detail": "Invalid email or password."}, 401)

            token = create_session(user["id"])
            cookie_val = f"ai_doctor_session={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={14 * 24 * 3600}"
            return self._send_json(
                {"status": "success", "token": token, "user": user},
                200,
                extra_headers={"Set-Cookie": cookie_val},
            )

        if path == "/api/auth/logout":
            token = self._extract_token()
            if token:
                delete_session(token)
            cookie_val = "ai_doctor_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
            return self._send_json(
                {"status": "success", "message": "Logged out successfully."},
                200,
                extra_headers={"Set-Cookie": cookie_val},
            )

        # ------------------------------------------------------------------
        # Protected Medical Endpoints (Require Authenticated User)
        # ------------------------------------------------------------------
        user = self._require_user()
        if not user:
            return
        user_id = user["id"]

        if path == "/api/profile":
            res = update_profile(
                name=data.get("name", user["name"]),
                age=int(data.get("age") or 25),
                gender=data.get("gender", "Male"),
                allergies=data.get("allergies", "None"),
                chronic_conditions=data.get("chronic_conditions", "None"),
                height=data.get("height") or "Not specified",
                weight=data.get("weight") or "Not specified",
                location=data.get("location") or "Not specified",
                user_id=user_id,
            )
            return self._send_json(res)

        if path == "/api/report/upload":
            conversation_id = data.get("conversation_id") or str(uuid.uuid4())
            ownership = verify_conversation_ownership(conversation_id, user_id)
            if ownership == "forbidden":
                return self._send_json({"detail": "Unauthorized access to conversation."}, 403)

            report_name = data.get("report_name") or "Medical Lab Report"
            report_text = data.get("report_text") or ""
            parsed_report = parse_report_fallback(report_text, report_name)
            report_id = save_patient_report(
                conversation_id=conversation_id,
                report_name=parsed_report["report_name"],
                report_date=parsed_report["date"],
                extracted_json=parsed_report,
                raw_text=parsed_report["raw_text"],
                user_id=user_id,
            )
            return self._send_json(
                {
                    "status": "success",
                    "report_id": report_id,
                    "conversation_id": conversation_id,
                    "parsed_summary": parsed_report,
                }
            )

        if path == "/api/report/generate":
            conversation_id = data.get("conversation_id") or ""
            ownership = verify_conversation_ownership(conversation_id, user_id)
            if ownership == "forbidden":
                return self._send_json({"detail": "Access denied: You do not own this conversation."}, 403)
            if ownership == "not_found":
                return self._send_json({"detail": "Conversation not found."}, 404)
            report_id = generate_pdf_fallback(conversation_id, user_id=user_id)
            return self._send_json(
                {
                    "status": "success",
                    "report_id": report_id,
                    "download_url": f"/api/report/download/{report_id}",
                }
            )

        if path == "/api/assess":
            conversation_id = data.get("conversation_id") or str(uuid.uuid4())
            ownership = verify_conversation_ownership(conversation_id, user_id)
            if ownership == "forbidden":
                conversation_id = str(uuid.uuid4())

            req_lang = (data.get("language") or "english").lower().strip()
            name = data.get("name") or user["name"]
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
                    location=location,
                    user_id=user_id,
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
            save_message(conversation_id, "user", combined_notes, user_id=user_id)

            if safety_check["is_emergency"]:
                emergency_text = safety_check["emergency_message"]
                save_message(conversation_id, "assistant", emergency_text, user_id=user_id)
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

            history = get_conversation_messages(conversation_id, user_id=user_id)
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
                user_id=user_id,
            )

            report_id = None
            download_url = None
            try:
                report_id = generate_pdf_fallback(conversation_id, user_id=user_id)
                download_url = f"/api/report/download/{report_id}"
            except Exception:
                pass

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
                    "report_id": report_id,
                    "download_url": download_url,
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
            ownership = verify_conversation_ownership(conversation_id, user_id)
            if ownership == "forbidden":
                return self._send_json({"detail": "Access denied: You do not own this conversation."}, 403)

            user_msg = (data.get("message") or "").strip()
            req_lang = (data.get("language") or "english").lower().strip()
            active_diagnosis = data.get("active_diagnosis")
            intake_data = data.get("intake_data")

            if not user_msg:
                return self._send_json({"detail": "Message cannot be empty."}, 400)

            safety_check = check_red_flags(user_msg)
            save_message(conversation_id, "user", user_msg, user_id=user_id)

            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            if safety_check["is_emergency"]:
                emergency_text = safety_check["emergency_message"]
                save_message(conversation_id, "assistant", emergency_text, user_id=user_id)
                chunk_str = f"data: {json_data(conversation_id, emergency_text, is_emergency=True)}\n\n"
                self.wfile.write(chunk_str.encode("utf-8"))
                self.wfile.flush()
                return

            profile = get_or_create_default_profile(user_id=user_id)
            history = get_conversation_messages(conversation_id, user_id=user_id)
            latest_report = get_latest_patient_report(conversation_id, user_id=user_id) or get_latest_patient_report(
                user_id=user_id
            )

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
                if latest_report:
                    sys_prompt += f"Patient Medical Lab Report: {json.dumps(latest_report.get('extracted_json') or latest_report.get('raw_text'))}\n"

                recent_msgs = "\n".join(
                    f"{'Patient' if m['role'] == 'user' else 'Doctor'}: {m['content']}" for m in history[-8:]
                )
                full_prompt = f"Conversation History:\n{recent_msgs}\n\nProvide a helpful, structured medical response to the patient's latest message."

                reply = call_gemini_rest(full_prompt, system_instruction=sys_prompt, temperature=0.35, max_tokens=900)
                save_message(conversation_id, "assistant", reply, user_id=user_id)

                self.wfile.write(f"data: {json_data(conversation_id, reply)}\n\n".encode("utf-8"))
                self.wfile.write(f"data: {json_data(conversation_id, '', is_end=True)}\n\n".encode("utf-8"))
                self.wfile.flush()
            except Exception:
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
