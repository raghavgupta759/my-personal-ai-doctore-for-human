import re

# Red-flag keywords across English, Hinglish, and Hindi (Devanagari)
RED_FLAG_KEYWORDS = [
    # Chest pain / Heart attack
    r"\bchest\s*pain\b", r"\bheart\s*attack\b", r"\bchhati\s*(mein|me)\s*dard\b", r"\bchaati\s*dard\b", r"\bseene\s*(mein|me)\s*dard\b", r"\bchest\s*tightness\b",
    # Breathing / Respiratory distress
    r"\bshortness\s*of\s*breath\b", r"\bcant\s*breathe\b", r"\bcan't\s*breathe\b", r"\bsaans\s*nahi\s*aa\s*rahi\b", r"\bsaans\s*lene\s*(mein|me)\s*dikkat\b", r"\bdam\s*ghut\s*raha\b", r"\bbreathlessness\b", r"\basphyxia\b",
    # Stroke / Paralysis / Slurred speech
    r"\bstroke\b", r"\bparalysis\b", r"\bface\s*droop\b", r"\bbolne\s*(mein|me)\s*takleef\b", r"\bek\s*taraf\s*sunn\b", r"\bfaaliz\b", r"\bslurred\s*speech\b",
    # Unconsciousness / Fainting
    r"\bunconscious\b", r"\bpassed\s*out\b", r"\bbehosh\b", r"\bbehoshi\b", r"\bबेहोश\b", r"\bfainting\b", r"\bloss\s*of\s*consciousness\b",
    # Severe Bleeding / Trauma
    r"\bheavy\s*bleeding\b", r"\bsevere\s*bleeding\b", r"\bbohat\s*khoon\b", r"\bzyada\s*khoon\b", r"\bखून\b", r"\buncontrolled\s*bleeding\b",
    # Severe Allergic Reaction / Anaphylaxis
    r"\banaphylaxis\b", r"\bswollen\s*throat\b", r"\bswollen\s*tongue\b", r"\ballergic\s*shock\b",
    # Suicidal Ideation / Self harm
    r"\bsuicide\b", r"\bsuicidal\b", r"\bkill\s*myself\b", r"\bmar\s*jaana\s*chahta\b", r"\bkhudkhushi\b", r"\bself\s*harm\b",
    # Severe Seizures / Convulsions
    r"\bseizure\b", r"\bconvulsion\b", r"\bdora\s*pad\s*raha\b", r"\bdore\b"
]

EMERGENCY_RESPONSE_TEMPLATE = """🚨 **EMERGENCY WARNING — IMMEDIATE MEDICAL ATTENTION REQUIRED**

Your description includes symptoms that could indicate a severe or life-threatening emergency (such as severe chest pain, severe breathing difficulty, stroke symptoms, loss of consciousness, uncontrolled bleeding, or severe allergic reaction).

**Please do NOT wait for an AI assessment.**

📞 **Call Emergency Services Immediately:**
• **112** — National Emergency Helpline (India)
• **108** — Emergency Ambulance Services
• **911** / Local Emergency Number (International)
• Or reach the nearest Hospital / Emergency Room immediately.

*Personal AI Doctor is an educational decision-support tool and cannot treat life-threatening medical emergencies.*"""

def check_red_flags(user_message: str) -> dict:
    text = user_message.lower()
    for pattern in RED_FLAG_KEYWORDS:
        if re.search(pattern, text, re.IGNORECASE):
            return {
                "is_emergency": True,
                "emergency_message": EMERGENCY_RESPONSE_TEMPLATE
            }
    return {
        "is_emergency": False,
        "emergency_message": None
    }

def check_red_flags_in_intake(symptoms: list, notes: str = "", severity_score: int = 5) -> dict:
    combined_text = " ".join(symptoms) + " " + notes
    flag_result = check_red_flags(combined_text)
    if flag_result["is_emergency"]:
        return flag_result
    
    # Check severity score + critical symptoms
    critical_symptoms = {"shortness of breath", "chest pain", "fainting", "unconscious", "heavy bleeding", "stroke"}
    for sym in symptoms:
        if sym.lower() in critical_symptoms or any(c in sym.lower() for c in critical_symptoms):
            if severity_score >= 8:
                return {
                    "is_emergency": True,
                    "emergency_message": EMERGENCY_RESPONSE_TEMPLATE
                }
                
    return {
        "is_emergency": False,
        "emergency_message": None
    }

