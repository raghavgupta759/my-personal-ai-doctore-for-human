import os
import sys
import json

workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_root not in sys.path:
    sys.path.insert(0, workspace_root)

from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def run():
    print("==================================================")
    print("1. Health Endpoint Check")
    res = client.get("/api/health")
    print("Health Status:", res.status_code, res.json())
    assert res.status_code == 200

    print("==================================================")
    print("2. Save Profile (with Height & Weight)")
    res_prof = client.post("/api/profile", json={
        "name": "Raghav",
        "age": 26,
        "gender": "Male",
        "height": "5 ft 10 in",
        "weight": "72 kg",
        "allergies": "Dust",
        "chronic_conditions": "Asthma"
    })
    print("Saved Profile:", res_prof.json())
    assert res_prof.status_code == 200
    assert res_prof.json()["height"] == "5 ft 10 in"

    print("==================================================")
    print("3. Upload & Parse Medical Lab Report")
    rep_text = "Hemoglobin: 13.5 g/dL (Ref: 13.0 - 17.0 g/dL)\nWBC: 11500 /uL (Ref: 4000 - 11000 /uL)\nPlatelets: 2.5 Lakhs /uL"
    res_rep = client.post("/api/report/upload", json={
        "conversation_id": "test-cid-100",
        "report_name": "Blood Test (CBC)",
        "report_text": rep_text
    })
    print("Uploaded Report Response:", res_rep.json())
    assert res_rep.status_code == 200
    assert len(res_rep.json()["parsed_summary"]["tests"]) >= 2

    print("==================================================")
    print("4. Emergency Red Flag Detection")
    res_emerg = client.post("/api/chat", json={
        "message": "Severe sudden chest pain radiating to left arm and breathlessness"
    })
    print("Emergency Check:", res_emerg.status_code, res_emerg.text[:120])
    assert "EMERGENCY" in res_emerg.text or "112" in res_emerg.text

    print("==================================================")
    print("ALL CORE BACKEND ENDPOINTS AND LOGIC VERIFIED 100% PASS!")
    print("==================================================")

if __name__ == "__main__":
    run()
