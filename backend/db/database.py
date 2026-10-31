import sqlite3
import os
import json
import uuid
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

DB_PATH = os.path.join(os.path.dirname(__file__), "doctor.db")


def get_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_column(cursor, table_name: str, column_name: str, column_def: str):
    cursor.execute(f"PRAGMA table_info({table_name})")
    existing_cols = [col["name"] for col in cursor.fetchall()]
    if column_name not in existing_cols:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def}")


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Users table for authentication
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Sessions table for token-based authentication
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
    )
    """)

    # Profiles table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT,
        name TEXT,
        age INTEGER,
        gender TEXT,
        allergies TEXT,
        chronic_conditions TEXT,
        height TEXT DEFAULT 'Not specified',
        weight TEXT DEFAULT 'Not specified',
        location TEXT DEFAULT 'Not specified',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Conversations table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT,
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
        user_id TEXT,
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
        user_id TEXT,
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

    # Patient Uploaded Reports table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS patient_reports (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        conversation_id TEXT,
        report_name TEXT,
        report_date TEXT,
        extracted_json TEXT,
        raw_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Generated PDF Reports table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        conversation_id TEXT,
        file_path TEXT,
        generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Safe non-destructive migrations for existing databases
    _ensure_column(cursor, "diagnoses", "foods_to_avoid", "TEXT")
    _ensure_column(cursor, "diagnoses", "natural_recovery", "TEXT")
    _ensure_column(cursor, "diagnoses", "user_id", "TEXT")

    _ensure_column(cursor, "profiles", "height", "TEXT DEFAULT 'Not specified'")
    _ensure_column(cursor, "profiles", "weight", "TEXT DEFAULT 'Not specified'")
    _ensure_column(cursor, "profiles", "location", "TEXT DEFAULT 'Not specified'")
    _ensure_column(cursor, "profiles", "user_id", "TEXT")

    _ensure_column(cursor, "conversations", "user_id", "TEXT")
    _ensure_column(cursor, "messages", "user_id", "TEXT")
    _ensure_column(cursor, "patient_reports", "user_id", "TEXT")
    _ensure_column(cursor, "reports", "user_id", "TEXT")

    # Create indexes for fast user-isolated queries
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_messages_conv_user ON messages(conversation_id, user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_diagnoses_conv_user ON diagnoses(conversation_id, user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_patient_reports_user ON patient_reports(user_id, conversation_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(id, user_id)")

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Authentication & Password Security Helpers
# ---------------------------------------------------------------------------

def _hash_password(password: str, salt_hex: str) -> str:
    salt_bytes = bytes.fromhex(salt_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, 200_000)
    return dk.hex()


def create_user(name: str, email: str, password: str) -> dict:
    clean_name = (name or "").strip()
    clean_email = (email or "").strip().lower()
    if not clean_name:
        raise ValueError("Full name is required.")
    if not clean_email or "@" not in clean_email:
        raise ValueError("A valid email address is required.")
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM users WHERE LOWER(email) = ?", (clean_email,))
    if cursor.fetchone():
        conn.close()
        raise ValueError("An account with this email address already exists.")

    user_id = str(uuid.uuid4())
    salt_hex = secrets.token_hex(16)
    pw_hash = _hash_password(password, salt_hex)

    cursor.execute(
        """
        INSERT INTO users (id, name, email, password_hash, password_salt)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user_id, clean_name, clean_email, pw_hash, salt_hex),
    )

    # Create isolated patient profile for this new user
    cursor.execute(
        """
        INSERT INTO profiles (user_id, name, age, gender, allergies, chronic_conditions, height, weight, location)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (user_id, clean_name, 25, "Male", "None", "None", "Not specified", "Not specified", "Not specified"),
    )

    conn.commit()
    conn.close()
    return {"id": user_id, "name": clean_name, "email": clean_email}


def authenticate_user(email_or_username: str, password: str):
    identifier = (email_or_username or "").strip().lower()
    if not identifier or not password:
        return None

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(name) = ? LIMIT 1",
        (identifier, identifier),
    )
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None

    expected_hash = row["password_hash"]
    salt_hex = row["password_salt"]
    computed_hash = _hash_password(password, salt_hex)
    if not hmac.compare_digest(expected_hash, computed_hash):
        return None

    return {"id": row["id"], "name": row["name"], "email": row["email"]}


def create_session(user_id: str, days_valid: int = 14) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=days_valid)).strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
        (token, user_id, expires_at),
    )
    conn.commit()
    conn.close()
    return token


def get_user_by_token(token: str):
    if not token:
        return None
    conn = get_connection()
    cursor = conn.cursor()
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        """
        SELECT u.id, u.name, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ? AND s.expires_at > ?
        """,
        (token, now_str),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def delete_session(token: str):
    if not token:
        return
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# User-Isolated Database Helper Methods
# ---------------------------------------------------------------------------

def get_or_create_default_profile(user_id: str = None):
    target_uid = user_id or "__legacy_local__"
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM profiles WHERE user_id = ? ORDER BY id LIMIT 1", (target_uid,))
    row = cursor.fetchone()
    if row:
        profile = dict(row)
        conn.close()
        return profile

    default_name = "Guest User"
    if user_id:
        cursor.execute("SELECT name FROM users WHERE id = ?", (user_id,))
        u_row = cursor.fetchone()
        if u_row and u_row["name"]:
            default_name = u_row["name"]

    cursor.execute(
        """
        INSERT INTO profiles (user_id, name, age, gender, allergies, chronic_conditions, height, weight, location)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (target_uid, default_name, 25, "Other", "None", "None", "Not specified", "Not specified", "Not specified"),
    )
    conn.commit()
    profile_id = cursor.lastrowid
    cursor.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
    profile = dict(cursor.fetchone())
    conn.close()
    return profile


def update_profile(
    name: str,
    age: int,
    gender: str,
    allergies: str,
    chronic_conditions: str,
    height: str = "Not specified",
    weight: str = "Not specified",
    location: str = None,
    user_id: str = None,
):
    profile = get_or_create_default_profile(user_id=user_id)
    conn = get_connection()
    cursor = conn.cursor()
    loc_val = location if location is not None else profile.get("location", "Not specified")
    cursor.execute(
        """
        UPDATE profiles
        SET name = ?, age = ?, gender = ?, allergies = ?, chronic_conditions = ?,
            height = ?, weight = ?, location = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
        """,
        (
            name,
            age,
            gender,
            allergies,
            chronic_conditions,
            height or "Not specified",
            weight or "Not specified",
            loc_val or "Not specified",
            profile["id"],
            profile["user_id"],
        ),
    )
    conn.commit()
    cursor.execute("SELECT * FROM profiles WHERE id = ?", (profile["id"],))
    updated = dict(cursor.fetchone())
    conn.close()
    return updated


def verify_conversation_ownership(conversation_id: str, user_id: str) -> str:
    """
    Checks whether `conversation_id` exists:
      - Returns 'owned' if owned by `user_id`
      - Returns 'forbidden' if it belongs to another user (or is a legacy record)
      - Returns 'not_found' if it does not exist yet
    """
    if not conversation_id:
        return "not_found"
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM conversations WHERE id = ?", (conversation_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return "not_found"
    if row["user_id"] == user_id and user_id is not None:
        return "owned"
    return "forbidden"


def save_patient_report(
    conversation_id: str,
    report_name: str,
    report_date: str,
    extracted_json: dict,
    raw_text: str,
    user_id: str = None,
):
    target_uid = user_id or "__legacy_local__"
    conn = get_connection()
    cursor = conn.cursor()
    report_id = str(uuid.uuid4())
    cursor.execute(
        """
        INSERT INTO patient_reports (id, user_id, conversation_id, report_name, report_date, extracted_json, raw_text)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (report_id, target_uid, conversation_id or "default", report_name, report_date, json.dumps(extracted_json), raw_text),
    )
    conn.commit()
    conn.close()
    return report_id


def get_latest_patient_report(conversation_id: str = None, user_id: str = None):
    target_uid = user_id or "__legacy_local__"
    conn = get_connection()
    cursor = conn.cursor()
    if conversation_id:
        cursor.execute(
            """
            SELECT * FROM patient_reports
            WHERE conversation_id = ? AND user_id = ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (conversation_id, target_uid),
        )
        row = cursor.fetchone()
        if row:
            res = dict(row)
            res["extracted_json"] = json.loads(res["extracted_json"]) if res.get("extracted_json") else {}
            conn.close()
            return res

    cursor.execute(
        """
        SELECT * FROM patient_reports
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 1
        """,
        (target_uid,),
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        res = dict(row)
        res["extracted_json"] = json.loads(res["extracted_json"]) if res.get("extracted_json") else {}
        return res
    return None


def save_message(conversation_id: str, role: str, content: str, user_id: str = None):
    target_uid = user_id or "__legacy_local__"
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, user_id FROM conversations WHERE id = ?", (conversation_id,))
    existing = cursor.fetchone()
    if not existing:
        profile = get_or_create_default_profile(user_id=target_uid)
        cursor.execute(
            "INSERT INTO conversations (id, user_id, profile_id) VALUES (?, ?, ?)",
            (conversation_id, target_uid, profile["id"]),
        )
    elif existing["user_id"] != target_uid:
        conn.close()
        raise PermissionError("Unauthorized access to conversation.")

    cursor.execute(
        "INSERT INTO messages (user_id, conversation_id, role, content) VALUES (?, ?, ?, ?)",
        (target_uid, conversation_id, role, content),
    )
    conn.commit()
    conn.close()


def get_conversation_messages(conversation_id: str, user_id: str = None):
    target_uid = user_id or "__legacy_local__"
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT role, content, timestamp
        FROM messages
        WHERE conversation_id = ? AND user_id = ?
        ORDER BY id ASC
        """,
        (conversation_id, target_uid),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def save_diagnosis(
    conversation_id: str,
    condition: str,
    cause: str,
    medication_guidance: str,
    recovery_days: str,
    diet_advice: str,
    foods_to_avoid: str,
    natural_recovery: str,
    home_remedies: str,
    rest_days: str,
    red_flags: str,
    ml_top3: list,
    ml_confidence: float,
    user_id: str = None,
):
    target_uid = user_id or "__legacy_local__"
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO diagnoses (
            user_id, conversation_id, condition, cause, medication_guidance,
            recovery_days, diet_advice, foods_to_avoid, natural_recovery,
            home_remedies, rest_days, red_flags, ml_top3_predictions, ml_confidence
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            target_uid,
            conversation_id,
            condition,
            cause,
            medication_guidance,
            recovery_days,
            diet_advice,
            foods_to_avoid,
            natural_recovery,
            home_remedies,
            rest_days,
            red_flags,
            json.dumps(ml_top3),
            ml_confidence,
        ),
    )
    conn.commit()
    conn.close()


def get_latest_diagnosis(conversation_id: str, user_id: str = None):
    target_uid = user_id or "__legacy_local__"
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM diagnoses
        WHERE conversation_id = ? AND user_id = ?
        ORDER BY id DESC LIMIT 1
        """,
        (conversation_id, target_uid),
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        res = dict(row)
        res["ml_top3_predictions"] = (
            json.loads(res["ml_top3_predictions"]) if res.get("ml_top3_predictions") else []
        )
        return res
    return None


def get_all_conversations(user_id: str = None):
    target_uid = user_id or "__legacy_local__"
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT c.id as conversation_id, c.started_at, c.status,
               (SELECT content FROM messages WHERE conversation_id = c.id AND user_id = ? ORDER BY id ASC LIMIT 1) as initial_user_msg,
               d.condition, d.cause, d.medication_guidance, d.diet_advice, d.foods_to_avoid,
               d.home_remedies, d.rest_days, d.red_flags, d.ml_confidence, d.ml_top3_predictions
        FROM conversations c
        LEFT JOIN diagnoses d ON d.id = (
            SELECT id FROM diagnoses WHERE conversation_id = c.id AND user_id = ? ORDER BY id DESC LIMIT 1
        )
        WHERE c.user_id = ?
        ORDER BY c.started_at DESC
        """,
        (target_uid, target_uid, target_uid),
    )
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
