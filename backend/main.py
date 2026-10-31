import os
import sys
import uuid
import json
from dotenv import load_dotenv

load_dotenv()

# Add workspace root to sys.path
workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_root not in sys.path:
    sys.path.insert(0, workspace_root)

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from backend.db.database import (
    get_or_create_default_profile,
    update_profile,
    save_message,
    save_diagnosis,
    get_conversation_messages,
    get_all_conversations,
    get_latest_diagnosis,
    save_patient_report,
    get_latest_patient_report,
    get_connection
)
from backend.services.safety_guard import check_red_flags, check_red_flags_in_intake
from backend.services.llm_service import llm_service
from backend.services.classifier_service import classifier_service
from backend.services.report_service import generate_pdf_report, parse_medical_report_text, REPORTS_DIR

app = FastAPI(title="Personal AI Doctor", version="3.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
class ProfileUpdateModel(BaseModel):
    name: str
    age: int
    gender: str
    allergies: Optional[str] = "None"
    chronic_conditions: Optional[str] = "None"
    location: Optional[str] = "Not specified"
    height: Optional[str] = "Not specified"
    weight: Optional[str] = "Not specified"

class AssessmentRequestModel(BaseModel):
    name: Optional[str] = "Guest"
    age: Optional[int] = 25
    gender: Optional[str] = "Male"
    location: Optional[str] = "Not specified"
    symptoms: list
    duration: Optional[str] = "1-2 days"
    symptom_onset: Optional[str] = "1-2 days ago"
    trajectory: Optional[str] = "Unchanged"
    current_medications: Optional[str] = "None"
    recent_food_activity: Optional[str] = "None"
    allergies: Optional[str] = "None"
    chronic_conditions: Optional[str] = "None"
    severity_score: Optional[int] = 5
    severity: Optional[str] = "Moderate"
    notes: Optional[str] = ""
    conversation_id: Optional[str] = None
    language: Optional[str] = "english"

class ChatRequestModel(BaseModel):
    conversation_id: Optional[str] = None
    message: str
    active_diagnosis: Optional[dict] = None
    intake_data: Optional[dict] = None
    language: Optional[str] = "english"

class ReportUploadModel(BaseModel):
    conversation_id: Optional[str] = None
    report_name: Optional[str] = "Medical Lab Report"
    report_text: str

class ReportGenerateModel(BaseModel):
    conversation_id: str

@app.get("/health")
@app.get("/api/health")
def health_check():
    ml_loaded = classifier_service.model is not None
    return {
        "status": "ok",
        "app": "Personal AI Doctor",
        "version": "3.0",
        "ml_classifier_loaded": ml_loaded,
        "active_model": llm_service.model_name
    }

@app.get("/api/profile")
def get_profile():
    return get_or_create_default_profile()

@app.post("/api/profile")
def save_user_profile(data: ProfileUpdateModel):
    return update_profile(
        name=data.name,
        age=data.age,
        gender=data.gender,
        allergies=data.allergies,
        chronic_conditions=data.chronic_conditions,
        height=data.height or "Not specified",
        weight=data.weight or "Not specified"
    )

@app.post("/api/report/upload")
def upload_patient_report_endpoint(data: ReportUploadModel):
    conversation_id = data.conversation_id or str(uuid.uuid4())
    parsed = parse_medical_report_text(data.report_text, data.report_name or "Medical Lab Report")
    report_id = save_patient_report(
        conversation_id=conversation_id,
        report_name=parsed["report_name"],
        report_date=parsed["date"],
        extracted_json=parsed,
        raw_text=parsed["raw_text"]
    )
    return {
        "status": "success",
        "report_id": report_id,
        "conversation_id": conversation_id,
        "parsed_summary": parsed
    }

@app.get("/api/history")
def list_history():
    return get_all_conversations()

@app.get("/api/history/{conversation_id}")
def get_history_detail(conversation_id: str):
    return get_conversation_messages(conversation_id)

@app.get("/api/diagnosis/{conversation_id}")
def get_diagnosis_detail(conversation_id: str):
    diagnosis = get_latest_diagnosis(conversation_id)
    if not diagnosis:
        raise HTTPException(status_code=404, detail="No diagnosis found for this conversation.")
    return diagnosis

@app.post("/api/assess")
def assess_symptoms_endpoint(data: AssessmentRequestModel):
    conversation_id = data.conversation_id or str(uuid.uuid4())
    req_lang = (data.language or "english").lower().strip()
    
    # Save patient profile if provided
    if data.name:
        update_profile(
            name=data.name,
            age=data.age or 25,
            gender=data.gender or "Male",
            allergies=data.allergies or "None",
            chronic_conditions=data.chronic_conditions or "None"
        )

    # Check for Emergency Red Flags in intake
    safety_check = check_red_flags_in_intake(
        symptoms=data.symptoms,
        notes=data.notes or "",
        severity_score=data.severity_score or 5
    )

    symptoms_text = ", ".join(data.symptoms)
    combined_notes = (
        f"Patient: {data.name}, Age: {data.age}, Gender: {data.gender}, Location: {data.location}. "
        f"Main Symptoms: {symptoms_text}. Duration: {data.duration}. Trajectory: {data.trajectory}. "
        f"Current Medications: {data.current_medications}. Context (Food/Activity): {data.recent_food_activity}. "
        f"Allergies: {data.allergies}. Conditions: {data.chronic_conditions}. Pain Severity: {data.severity_score}/10 ({data.severity}). "
        f"Additional Notes: {data.notes}"
    )
    
    # Save structured initial query to DB
    save_message(conversation_id, "user", combined_notes)

    if safety_check["is_emergency"]:
        emergency_text = safety_check["emergency_message"]
        save_message(conversation_id, "assistant", emergency_text)
        return {
            "status": "emergency",
            "is_emergency": True,
            "emergency_message": emergency_text,
            "conversation_id": conversation_id,
            "intake_summary": {
                "name": data.name,
                "symptoms": data.symptoms,
                "severity_score": data.severity_score
            }
        }

    
    # Predict condition via ML & multi-field reasoning
    history = get_conversation_messages(conversation_id)
    top3_preds, top_conf, detected = classifier_service.predict_top3(history)
    
    primary_condition = top3_preds[0]["condition"] if top3_preds else "Viral Fever"
    from backend.services.rag_service import get_condition_knowledge, get_all_language_knowledge
    knowledge = get_condition_knowledge(primary_condition, language=req_lang)
    multilingual_knowledge = get_all_language_knowledge(primary_condition)
    
    # Synthesize step-by-step clinical reasoning based on ALL intake fields
    reasoning_steps = []
    reasoning_steps.append(f"• Analyzed reported symptoms ({symptoms_text}) spanning duration ({data.duration}).")
    if data.recent_food_activity and data.recent_food_activity.lower() != "none":
        reasoning_steps.append(f"• Evaluated environmental trigger: {data.recent_food_activity}.")
    if data.severity_score >= 7:
        reasoning_steps.append(f"• Highlighted high discomfort rating ({data.severity_score}/10) requiring close monitoring.")
    if data.chronic_conditions and data.chronic_conditions.lower() != "none":
        reasoning_steps.append(f"• Factored underlying medical profile ({data.chronic_conditions}) into OTC & recovery safety.")
    
    clinical_reasoning = "\n".join(reasoning_steps)
    cause_with_reasoning = f"{knowledge['cause']}\n\nClinical Assessment Reasoning:\n{clinical_reasoning}"

    # Save diagnosis record
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
        ml_confidence=top_conf
    )
    
    # Generate PDF Report
    report_id = None
    download_url = None
    try:
        report_id = generate_pdf_report(conversation_id)
        download_url = f"/api/report/download/{report_id}"
    except Exception as e:
        print(f"Warning: PDF report generation issue: {e}")
        
    return {
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
            "name": data.name,
            "age": data.age,
            "gender": data.gender,
            "location": data.location,
            "symptoms": data.symptoms,
            "duration": data.duration,
            "recent_food_activity": data.recent_food_activity,
            "allergies": data.allergies,
            "chronic_conditions": data.chronic_conditions,
            "severity_score": data.severity_score
        }
    }

@app.post("/api/chat")
async def chat_endpoint(data: ChatRequestModel):
    conversation_id = data.conversation_id or str(uuid.uuid4())
    user_msg = data.message.strip()
    req_lang = (data.language or "english").lower().strip()
    
    if not user_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # 1. Check Safety Guard for Emergency Red Flags
    safety_check = check_red_flags(user_msg)
    
    # Save user message to database
    save_message(conversation_id, "user", user_msg)

    if safety_check["is_emergency"]:
        emergency_text = safety_check["emergency_message"]
        save_message(conversation_id, "assistant", emergency_text)
        
        async def emergency_generator():
            yield f"data: {json_data(conversation_id, emergency_text, is_emergency=True)}\n\n"
        return StreamingResponse(emergency_generator(), media_type="text/event-stream")

    # Fetch conversation history & profile
    profile = get_or_create_default_profile()
    history = get_conversation_messages(conversation_id)

    async def stream_generator():
        collected_text = ""
        # Send initial SSE chunk with conversation_id header info
        yield f"data: {json_data(conversation_id, '', is_start=True)}\n\n"
        
        try:
            async for chunk in llm_service.generate_response_stream(
                conversation_id=conversation_id, 
                history=history, 
                profile=profile, 
                active_diagnosis=data.active_diagnosis,
                intake_data=data.intake_data,
                language=req_lang
            ):
                collected_text += chunk
                yield f"data: {json_data(conversation_id, chunk)}\n\n"
                
            # Save assistant message to DB once generation finishes
            if collected_text:
                save_message(conversation_id, "assistant", collected_text)
                
            yield f"data: {json_data(conversation_id, '', is_end=True)}\n\n"
        except Exception as e:
            import traceback
            print(f"[Main API Chat Exception]: {e}")
            traceback.print_exc()
            err_msg = "⚠️ Service temporarily unavailable while generating AI response. Technical details logged."
            yield f"data: {json_data(conversation_id, err_msg, is_error=True)}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

def json_data(cid: str, text: str, is_start: bool = False, is_end: bool = False, is_emergency: bool = False, is_error: bool = False) -> str:
    import json
    return json.dumps({
        "conversation_id": cid,
        "text": text,
        "is_start": is_start,
        "is_end": is_end,
        "is_emergency": is_emergency,
        "is_error": is_error
    })

@app.post("/api/report/generate")
def generate_report_endpoint(data: ReportGenerateModel):
    try:
        report_id = generate_pdf_report(data.conversation_id)
        return {"status": "success", "report_id": report_id, "download_url": f"/api/report/download/{report_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF report generation failed: {str(e)}")

@app.get("/api/report/download/{report_id}")
def download_report_endpoint(report_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_path FROM reports WHERE id = ?", (report_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row or not os.path.exists(row["file_path"]):
        raise HTTPException(status_code=404, detail="Report file not found.")
        
    return FileResponse(
        path=row["file_path"],
        filename=os.path.basename(row["file_path"]),
        media_type="application/pdf"
    )

# Static files for Frontend
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("backend.main:app", host=host, port=port, reload=False)
