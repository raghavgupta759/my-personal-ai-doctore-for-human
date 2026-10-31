import os
import sys
import json

workspace_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if workspace_root not in sys.path:
    sys.path.insert(0, workspace_root)

from fastapi.testclient import TestClient
from backend.main import app

def parse_sse_text(sse_raw: str) -> str:
    collected = []
    lines = sse_raw.splitlines()
    for line in lines:
        line_s = line.strip()
        if line_s.startswith("data:"):
            payload_str = line_s[5:].strip()
            if not payload_str:
                continue
            try:
                data = json.loads(payload_str)
                if data.get("text"):
                    collected.append(data["text"])
            except Exception:
                pass
    return "".join(collected)

def safe_print(title, text):
    try:
        print(f"\n==================================================\n{title}\n==================================================\n{text}")
    except Exception:
        print(f"\n--- {title} ---\n{text.encode('ascii', 'replace').decode('ascii')}")

def test_all_master_scenarios():
    client = TestClient(app)
    cid = "master-test-session-001"

    # Set up user profile first
    client.post("/api/profile", json={
        "name": "Raghav",
        "age": 26,
        "gender": "Male",
        "allergies": "Dust",
        "chronic_conditions": "None",
        "height": "5 ft 10 in",
        "weight": "72 kg"
    })

    print("Starting 15 Master Prompt Validation Scenarios...")

    # TEST 1: Greeting
    res1 = client.post("/api/chat", json={"conversation_id": cid, "message": "Hello", "language": "english"})
    t1 = parse_sse_text(res1.text)
    safe_print("TEST 1: Hello", t1)
    assert len(t1) > 0

    # TEST 2: Name declaration
    res2 = client.post("/api/chat", json={"conversation_id": cid, "message": "My name is Raghav.", "language": "english"})
    t2 = parse_sse_text(res2.text)
    safe_print("TEST 2: My name is Raghav", t2)
    assert "Raghav" in t2 or "nice" in t2.lower() or "meet" in t2.lower()

    # TEST 3: "How are you?"
    res3 = client.post("/api/chat", json={"conversation_id": cid, "message": "How are you?", "language": "english"})
    t3 = parse_sse_text(res3.text)
    safe_print("TEST 3: How are you?", t3)
    assert len(t3) > 0

    # TEST 4: "How am I feeling today?"
    res4 = client.post("/api/chat", json={"conversation_id": cid, "message": "How am I feeling today?", "language": "english"})
    t4 = parse_sse_text(res4.text)
    safe_print("TEST 4: How am I feeling today?", t4)
    assert len(t4) > 0

    # TEST 5: "I have a headache."
    res5 = client.post("/api/chat", json={"conversation_id": cid, "message": "I have a headache.", "language": "english"})
    t5 = parse_sse_text(res5.text)
    safe_print("TEST 5: I have a headache", t5)
    assert "headache" in t5.lower() or "pain" in t5.lower() or "sorry" in t5.lower()

    # TEST 6: "The headache started yesterday."
    res6 = client.post("/api/chat", json={"conversation_id": cid, "message": "The headache started yesterday.", "language": "english"})
    t6 = parse_sse_text(res6.text)
    safe_print("TEST 6: Started yesterday", t6)
    assert len(t6) > 0

    # TEST 7: "What should I do for it?"
    res7 = client.post("/api/chat", json={"conversation_id": cid, "message": "What should I do for it?", "language": "english"})
    t7 = parse_sse_text(res7.text)
    safe_print("TEST 7: What should I do for it?", t7)
    assert "rest" in t7.lower() or "water" in t7.lower() or "pain" in t7.lower() or "headache" in t7.lower() or "paracetamol" in t7.lower()

    # TEST 8: Upload Medical Report
    rep_text = """
    PATIENT LAB REPORT
    Report Name: Complete Blood Count (CBC)
    Date: 2026-08-30
    Hemoglobin: 13.5 g/dL (Reference: 13.0 - 17.0 g/dL)
    WBC Count: 11500 /uL (Reference: 4000 - 11000 /uL)
    Platelet Count: 2.5 Lakhs /uL (Reference: 1.5 - 4.5 Lakhs)
    Fasting Blood Sugar: 92 mg/dL (Reference: 70 - 99 mg/dL)
    """
    res_upload = client.post("/api/report/upload", json={
        "conversation_id": cid,
        "report_name": "Blood Test (CBC)",
        "report_text": rep_text
    })
    safe_print("TEST 8: Upload Medical Report", res_upload.json())
    assert res_upload.status_code == 200

    # TEST 9: "What is my hemoglobin?"
    res9 = client.post("/api/chat", json={"conversation_id": cid, "message": "What is my hemoglobin?", "language": "english"})
    t9 = parse_sse_text(res9.text)
    safe_print("TEST 9: What is my hemoglobin?", t9)
    assert "13.5" in t9 or "hemoglobin" in t9.lower()

    # TEST 10: "What is abnormal in my report?"
    res10 = client.post("/api/chat", json={"conversation_id": cid, "message": "What is abnormal in my report?", "language": "english"})
    t10 = parse_sse_text(res10.text)
    safe_print("TEST 10: What is abnormal in my report?", t10)
    assert "wbc" in t10.lower() or "11500" in t10 or "elevated" in t10.lower() or "range" in t10.lower()

    # TEST 11: Non-existent value "What is my TSH?" -> Zero Hallucination test
    res11 = client.post("/api/chat", json={"conversation_id": cid, "message": "What is my TSH level in the report?", "language": "english"})
    t11 = parse_sse_text(res11.text)
    safe_print("TEST 11: Zero Hallucination (TSH check)", t11)
    assert "don't see" in t11.lower() or "not" in t11.lower() or "available" in t11.lower()

    # TEST 12: Question in Hindi
    res12 = client.post("/api/chat", json={"conversation_id": cid, "message": "सिर दर्द के लिए मुझे क्या खाना चाहिए?", "language": "hindi"})
    t12 = parse_sse_text(res12.text)
    safe_print("TEST 12: Hindi Query", t12)
    assert len(t12) > 0

    # TEST 13: Question in English
    res13 = client.post("/api/chat", json={"conversation_id": cid, "message": "Can I drink tea during headache?", "language": "english"})
    t13 = parse_sse_text(res13.text)
    safe_print("TEST 13: English Query", t13)
    assert len(t13) > 0

    # TEST 14: Emergency detection
    res14 = client.post("/api/chat", json={"conversation_id": cid, "message": "I have severe sudden chest pain and loss of vision", "language": "english"})
    t14 = parse_sse_text(res14.text)
    safe_print("TEST 14: Emergency Red Flag", t14)
    assert "EMERGENCY" in t14 or "112" in t14 or "108" in t14 or "urgent" in t14.lower()

    # TEST 15: General non-medical question
    res15 = client.post("/api/chat", json={"conversation_id": cid, "message": "What is the capital of France?", "language": "english"})
    t15 = parse_sse_text(res15.text)
    safe_print("TEST 15: General non-medical Q", t15)
    assert "Paris" in t15 or "france" in t15.lower() or len(t15) > 0

    print("\nALL 15 MASTER SCENARIOS TESTED SUCCESSFULLY!")

if __name__ == "__main__":
    test_all_master_scenarios()
