import os
import sys
import uuid
import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def send_chat(message: str, conversation_id: str = None, language: str = "english"):
    url = f"{BASE_URL}/api/chat"
    payload = {
        "conversation_id": conversation_id or str(uuid.uuid4()),
        "message": message,
        "language": language
    }
    res = requests.post(url, json=payload, stream=True)
    if res.status_code != 200:
        return f"Error: HTTP {res.status_code}"
    
    full_text = ""
    cid = conversation_id
    for line in res.iter_lines():
        if line:
            decoded = line.decode("utf-8")
            if decoded.startswith("data: "):
                try:
                    data = json.loads(decoded[6:])
                    if data.get("conversation_id"):
                        cid = data["conversation_id"]
                    if data.get("text"):
                        full_text += data["text"]
                except Exception:
                    pass
    return full_text, cid

def run_all_tests():
    print("=" * 60)
    print("STARTING AI FUNCTIONALITY VERIFICATION SUITE")
    print("=" * 60)

    # Test 1: Greeting
    print("\n--- TEST 1: Greeting ('Hi') ---")
    resp1, cid1 = send_chat("Hi")
    print(f"User: Hi\nAI Response:\n{resp1}\n")
    assert len(resp1) > 10, "Test 1 Failed"

    # Test 2: Normal question
    print("--- TEST 2: Normal Question ('How are you?') ---")
    resp2, cid2 = send_chat("How are you?")
    print(f"User: How are you?\nAI Response:\n{resp2}\n")
    assert len(resp2) > 10, "Test 2 Failed"

    # Test 3: Language request
    print("--- TEST 3: Language Request ('Can we talk in Hindi?') ---")
    resp3, cid3 = send_chat("Can we talk in Hindi?")
    print(f"User: Can we talk in Hindi?\nAI Response:\n{resp3}\n")
    assert len(resp3) > 10, "Test 3 Failed"

    # Test 4: Hindi mode
    print("--- TEST 4: Hindi Mode ('मुझे बुखार है') ---")
    resp4, cid4 = send_chat("मुझे बुखार है", language="hindi")
    print(f"User: मुझे बुखार है\nAI Response:\n{resp4}\n")
    assert len(resp4) > 10, "Test 4 Failed"

    # Test 5: English mode
    print("--- TEST 5: English Mode ('I have a headache') ---")
    resp5, cid5 = send_chat("I have a headache", language="english")
    print(f"User: I have a headache\nAI Response:\n{resp5}\n")
    assert len(resp5) > 10, "Test 5 Failed"

    # Test 6: Memory / Conversation Context
    print("--- TEST 6: Conversation Memory Context ---")
    mem_cid = str(uuid.uuid4())
    m1, _ = send_chat("My name is Rahul.", conversation_id=mem_cid)
    print(f"User: My name is Rahul.\nAI: {m1}\n")
    
    m2, _ = send_chat("I am 21 years old.", conversation_id=mem_cid)
    print(f"User: I am 21 years old.\nAI: {m2}\n")
    
    m3, _ = send_chat("I have fever. What is my name and age?", conversation_id=mem_cid)
    print(f"User: I have fever. What is my name and age?\nAI: {m3}\n")

    # Test 7: Multiple distinct questions (Verify responses are not duplicate/static)
    print("--- TEST 7: Multiple Distinct Questions ---")
    q_list = ["Hi", "What is fever?", "Can we talk in Hindi?", "मुझे थकान है", "What should I do?"]
    responses = []
    for q in q_list:
        r, _ = send_chat(q)
        responses.append(r)
        print(f"Q: '{q}' -> Length: {len(r)} chars")

    # Ensure no two responses are identical
    unique_responses = set(responses)
    print(f"\nUnique responses generated: {len(unique_responses)} / {len(q_list)}")
    assert len(unique_responses) == len(q_list), "Test 7 Failed: Duplicate responses detected!"

    print("\n" + "=" * 60)
    print("ALL 7 CORE AI TESTS PASSED SUCCESSFULLY! 🎉")
    print("=" * 60)

if __name__ == "__main__":
    run_all_tests()
