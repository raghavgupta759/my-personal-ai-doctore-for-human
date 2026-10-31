import sqlite3
import os
import json
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "doctor.db")

def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()
    
    # Profiles table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        age INTEGER,
        gender TEXT,
        allergies TEXT,
        chronic_conditions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Conversations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        profile_id INTEGER,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        status TEXT DEFAULT 'active'
    )
    """)
    
    # Messages table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        role TEXT,
        content TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Diagnoses table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS diagnoses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        condition TEXT,
        cause TEXT,
        medication_guidance TEXT,
        recovery_days TEXT,
        diet_advice TEXT,
        foods_to_avoid TEXT,
        natural_recovery TEXT,
        home_remedies TEXT,
        rest_days TEXT,
        red_flags TEXT,
        ml_top3_predictions TEXT,
        ml_confidence REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Check and add new columns if upgrading existing sqlite table
    cursor.execute("PRAGMA table_info(diagnoses)")
    columns = [col["name"] for col in cursor.fetchall()]
    if "foods_to_avoid" not in columns:
        cursor.execute("ALTER TABLE diagnoses ADD COLUMN foods_to_avoid TEXT")
    if "natural_recovery" not in columns:
        cursor.execute("ALTER TABLE diagnoses ADD COLUMN natural_recovery TEXT")

    # Check and add new columns if upgrading existing sqlite table
    cursor.execute("PRAGMA table_info(profiles)")
    prof_cols = [col["name"] for col in cursor.fetchall()]
    if "height" not in prof_cols:
        cursor.execute("ALTER TABLE profiles ADD COLUMN height TEXT DEFAULT 'Not specified'")
    if "weight" not in prof_cols:
        cursor.execute("ALTER TABLE profiles ADD COLUMN weight TEXT DEFAULT 'Not specified'")

    # Patient Uploaded Reports table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patient_reports (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        report_name TEXT,
        report_date TEXT,
        extracted_json TEXT,
        raw_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Reports table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        file_path TEXT,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    conn.commit()
    conn.close()

# Database Helper Methods

def get_or_create_default_profile():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM profiles ORDER BY id LIMIT 1")
    row = cursor.fetchone()
    if row:
        profile = dict(row)
        conn.close()
        return profile
    else:
        cursor.execute("""
            INSERT INTO profiles (name, age, gender, allergies, chronic_conditions, height, weight)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ("Guest User", 25, "Other", "None", "None", "Not specified", "Not specified"))
        conn.commit()
        profile_id = cursor.lastrowid
        cursor.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
        profile = dict(cursor.fetchone())
        conn.close()
        return profile

def update_profile(name: str, age: int, gender: str, allergies: str, chronic_conditions: str, height: str = "Not specified", weight: str = "Not specified"):
    conn = get_connection()
    cursor = conn.cursor()
    profile = get_or_create_default_profile()
    cursor.execute("""
        UPDATE profiles
        SET name = ?, age = ?, gender = ?, allergies = ?, chronic_conditions = ?, height = ?, weight = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (name, age, gender, allergies, chronic_conditions, height or "Not specified", weight or "Not specified", profile["id"]))
    conn.commit()
    cursor.execute("SELECT * FROM profiles WHERE id = ?", (profile["id"],))
    updated = dict(cursor.fetchone())
    conn.close()
    return updated

def save_patient_report(conversation_id: str, report_name: str, report_date: str, extracted_json: dict, raw_text: str):
    import uuid
    conn = get_connection()
    cursor = conn.cursor()
    report_id = str(uuid.uuid4())
    cursor.execute("""
        INSERT INTO patient_reports (id, conversation_id, report_name, report_date, extracted_json, raw_text)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (report_id, conversation_id or "default", report_name, report_date, json.dumps(extracted_json), raw_text))
    conn.commit()
    conn.close()
    return report_id

def get_latest_patient_report(conversation_id: str = None):
    conn = get_connection()
    cursor = conn.cursor()
    if conversation_id:
        cursor.execute("SELECT * FROM patient_reports WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1", (conversation_id,))
        row = cursor.fetchone()
        if row:
            res = dict(row)
            res["extracted_json"] = json.loads(res["extracted_json"]) if res.get("extracted_json") else {}
            conn.close()
            return res
    cursor.execute("SELECT * FROM patient_reports ORDER BY created_at DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        res = dict(row)
        res["extracted_json"] = json.loads(res["extracted_json"]) if res.get("extracted_json") else {}
        return res
    return None

def save_message(conversation_id: str, role: str, content: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM conversations WHERE id = ?", (conversation_id,))
    if not cursor.fetchone():
        profile = get_or_create_default_profile()
        cursor.execute("INSERT INTO conversations (id, profile_id) VALUES (?, ?)", (conversation_id, profile["id"]))
    cursor.execute("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", (conversation_id, role, content))
    conn.commit()
    conn.close()

def get_conversation_messages(conversation_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY id ASC", (conversation_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

def save_diagnosis(conversation_id: str, condition: str, cause: str, medication_guidance: str, recovery_days: str, diet_advice: str, foods_to_avoid: str, natural_recovery: str, home_remedies: str, rest_days: str, red_flags: str, ml_top3: list, ml_confidence: float):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO diagnoses (conversation_id, condition, cause, medication_guidance, recovery_days, diet_advice, foods_to_avoid, natural_recovery, home_remedies, rest_days, red_flags, ml_top3_predictions, ml_confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        conversation_id, condition, cause, medication_guidance, recovery_days, diet_advice, foods_to_avoid, natural_recovery, home_remedies, rest_days, red_flags,
        json.dumps(ml_top3), ml_confidence
    ))
    conn.commit()
    conn.close()

def get_latest_diagnosis(conversation_id: str):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM diagnoses WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", (conversation_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        res = dict(row)
        res["ml_top3_predictions"] = json.loads(res["ml_top3_predictions"]) if res.get("ml_top3_predictions") else []
        return res
    return None

def get_all_conversations():
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.id as conversation_id, c.started_at, c.status, 
               (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY id ASC LIMIT 1) as initial_user_msg,
               d.condition, d.cause, d.medication_guidance, d.diet_advice, d.foods_to_avoid, d.home_remedies, d.rest_days, d.red_flags, d.ml_confidence, d.ml_top3_predictions
        FROM conversations c
        LEFT JOIN diagnoses d ON d.id = (SELECT id FROM diagnoses WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1)
        ORDER BY c.started_at DESC
    """)
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for r in rows:
        item = dict(r)
        if item.get("ml_top3_predictions"):
            try:
                item["ml_top3_predictions"] = json.loads(item["ml_top3_predictions"])
            except Exception:
                item["ml_top3_predictions"] = []
        else:
            item["ml_top3_predictions"] = []
        item["summary"] = item.get("condition") or "Health Consultation"
        result.append(item)
    return result

init_db()
