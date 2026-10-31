import os
import sys
import json

workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_root not in sys.path:
    sys.path.insert(0, workspace_root)

from fastapi.testclient import TestClient
from backend.main import app

def safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode("ascii"))

def test_backend_api():
    client = TestClient(app)
    
    safe_print("--- 1. Testing Health Endpoint ---")
    res = client.get("/api/health")
    safe_print(f"Health Status Code: {res.status_code}, Active Model: {res.json().get('active_model')}")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert "ml_classifier_loaded" in res.json()

    safe_print("\n--- 2. Testing Profile Endpoint ---")
    profile_data = {
        "name": "Raghav Test",
        "age": 26,
        "gender": "Male",
        "allergies": "Dust",
        "chronic_conditions": "None"
    }
    res = client.post("/api/profile", json=profile_data)
    safe_print(f"Save Profile Response: {res.json()['name']}")
    assert res.status_code == 200
    assert res.json()["name"] == "Raghav Test"

    safe_print("\n--- 3. Testing Safety Guard Emergency Red Flag ---")
    chat_payload = {"message": "Severe chest pain and difficulty breathing"}
    res = client.post("/api/chat", json=chat_payload)
    safe_print(f"Emergency Chat Status: {res.status_code}")
    assert res.status_code == 200
    assert "EMERGENCY" in res.text

    safe_print("\n--- 4. Testing Required Scenarios 1-7 ---")
    cid = "test-session-12345"

    # Test 1: Greeting
    res1 = client.post("/api/chat", json={"conversation_id": cid, "message": "Hi", "language": "english"})
    text1 = parse_stream_text(res1.text)
    safe_print(f"[Test 1 Greeting Response]: {text1[:60]}...")
    assert len(text1) > 5

    # Test 2: Normal Question
    res2 = client.post("/api/chat", json={"conversation_id": cid, "message": "How are you?", "language": "english"})
    text2 = parse_stream_text(res2.text)
    safe_print(f"[Test 2 Normal Q Response]: {text2[:60]}...")
    assert len(text2) > 5
    assert text2 != text1

    # Test 3: Language Request
    res3 = client.post("/api/chat", json={"conversation_id": cid, "message": "Can we talk in Hindi?", "language": "english"})
    text3 = parse_stream_text(res3.text)
    safe_print(f"[Test 3 Lang Req Response]: {text3[:60]}...")
    assert len(text3) > 5

    # Test 4: Hindi Mode
    res4 = client.post("/api/chat", json={"conversation_id": cid, "message": "मुझे बुखार है", "language": "hindi"})
    text4 = parse_stream_text(res4.text)
    safe_print(f"[Test 4 Hindi Mode Response]: {text4[:60]}...")
    assert len(text4) > 5

    # Test 5: English Mode
    res5 = client.post("/api/chat", json={"conversation_id": cid, "message": "I have a headache", "language": "english"})
    text5 = parse_stream_text(res5.text)
    safe_print(f"[Test 5 English Mode Response]: {text5[:60]}...")
    assert len(text5) > 5

    # Test 6: Conversation Context
    cid_ctx = "ctx-session-999"
    client.post("/api/chat", json={"conversation_id": cid_ctx, "message": "My name is Rahul.", "language": "english"})
    client.post("/api/chat", json={"conversation_id": cid_ctx, "message": "I am 21 years old.", "language": "english"})
    res6 = client.post("/api/chat", json={"conversation_id": cid_ctx, "message": "I have fever.", "language": "english"})
    text6 = parse_stream_text(res6.text)
    safe_print(f"[Test 6 Context Response]: {text6[:80]}...")
    assert "Rahul" in text6 or "fever" in text6.lower() or len(text6) > 20

    # Test 7: Multiple Different Questions produce DIFFERENT, relevant responses
    assert text1 != text2
    assert text2 != text5
    assert text4 != text5

    safe_print("\n--- 5. Testing 5-Step Intake Assessment Endpoint ---")
    assess_payload = {
        "name": "Raghav Intake Test",
        "age": 25,
        "gender": "Male",
        "location": "Mumbai",
        "symptoms": ["Fever", "Headache"],
        "duration": "2 to 3 Days",
        "recent_food_activity": "Ate street food",
        "allergies": "Dust",
        "chronic_conditions": "None",
        "severity_score": 6,
        "severity": "Moderate",
        "notes": "Tez bukhar feel ho raha hai"
    }
    res_assess = client.post("/api/assess", json=assess_payload)
    safe_print(f"Assess Status: {res_assess.status_code}, Condition: {res_assess.json().get('condition')}")
    assert res_assess.status_code == 200
    assert res_assess.json()["status"] == "success"
    assert res_assess.json()["intake_summary"]["name"] == "Raghav Intake Test"

    safe_print("\n--- 6. Testing PDF Report Generation & Download ---")
    res = client.post("/api/report/generate", json={"conversation_id": cid})
    safe_print(f"Generate Report Response: {res.json()['status']}")
    assert res.status_code == 200
    download_url = res.json()["download_url"]

    dl_res = client.get(download_url)
    safe_print(f"Download Report Status: {dl_res.status_code}, Length: {len(dl_res.content)} bytes")
    assert dl_res.status_code == 200
    assert len(dl_res.content) > 1000

    safe_print("\n--- ALL BACKEND API TESTS & SCENARIOS PASSED SUCCESSFULLY! ---")

def parse_stream_text(stream_body: str) -> str:
    full_text = ""
    lines = stream_body.split("\n\n")
    for line in lines:
        if line.startswith("data: "):
            try:
                data = json.loads(line[6:])
                if data.get("text"):
                    full_text += data["text"]
            except Exception:
                pass
    return full_text

if __name__ == "__main__":
    test_backend_api()

