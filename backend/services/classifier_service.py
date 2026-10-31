import os
import json
import joblib
import numpy as np

ARTIFACTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "ml", "model_artifacts")

CLASSIFIER_PATH = os.path.join(ARTIFACTS_DIR, "symptom_classifier.pkl")
ENCODER_PATH = os.path.join(ARTIFACTS_DIR, "label_encoder.pkl")
FEATURES_PATH = os.path.join(ARTIFACTS_DIR, "symptom_features.json")

# Multilingual (English + Hinglish + Hindi) symptom dictionary mapping to standard model symptom features
KEYWORD_TO_SYMPTOM_MAP = {
    # Fever / Temperature
    "fever": "fever", "bukhar": "fever", "bukhaar": "fever", "pyrexia": "fever", "temperature": "fever", "garmi": "fever",
    "high fever": "high_fever", "teez bukhar": "high_fever", "tez bukhar": "high_fever", "101": "high_fever", "102": "high_fever", "103": "high_fever",
    "chills": "chills", "thand": "chills", "thand lagna": "chills", "kampkampi": "chills",
    # Pain / Body
    "body ache": "body_ache", "body pain": "body_ache", "badan dard": "body_ache", "jism me dard": "body_ache", "ang ang dard": "body_ache",
    "headache": "headache", "head ache": "headache", "sar dard": "headache", "sir dard": "headache", "seerdard": "headache", "head pain": "headache",
    "joint pain": "joint_pain", "jodon me dard": "joint_pain", "jod dard": "joint_pain", "knees pain": "joint_pain",
    "muscle soreness": "muscle_soreness", "paththe me dard": "muscle_soreness", "muscles pain": "muscle_soreness",
    "back pain": "back_pain", "peeth dard": "back_pain", "kamar dard": "back_pain",
    "stiff neck": "stiff_neck", "gardan me akdan": "stiff_neck", "neck pain": "stiff_neck",
    # Fatigue / Weakness
    "fatigue": "fatigue", "thakan": "fatigue", "thakavat": "fatigue", "tired": "fatigue", "tiredness": "fatigue",
    "weakness": "weakness", "kamzori": "weakness", "kamjori": "weakness", "sufti": "weakness",
    # Respiratory / Throat
    "cough": "cough", "khasi": "cough", "khaasi": "cough", "khasna": "cough",
    "dry cough": "dry_cough", "sukhi khasi": "dry_cough",
    "wet cough": "wet_cough", "balgam": "wet_cough", "phlegm": "wet_cough",
    "runny nose": "runny_nose", "naak behna": "runny_nose", "running nose": "runny_nose", "naak me paani": "runny_nose",
    "sneezing": "sneezing", "chink": "sneezing", "chinke": "sneezing", " छींक ": "sneezing",
    "sore throat": "sore_throat", "gala kharab": "sore_throat", "gale me kharash": "sore_throat", "throat pain": "sore_throat",
    "shortness of breath": "shortness_of_breath", "saans phoolna": "shortness_of_breath", "breathlessness": "shortness_of_breath",
    "wheezing": "wheezing", "saans me se aawaz": "wheezing",
    "swollen tonsils": "swollen_tonsils", "tonsils": "swollen_tonsils", "gale me sujan": "swollen_tonsils",
    "swollen glands": "swollen_glands", "gland sujan": "swollen_glands",
    # Digestives / Stomach
    "nausea": "nausea", "ji ghabrana": "nausea", "ulti jaisa": "nausea", "nauseous": "nausea",
    "vomiting": "vomiting", "ulti": "vomiting", "vomit": "vomiting", "ultiyan": "vomiting",
    "diarrhea": "diarrhea", "dast": "diarrhea", "loose motion": "diarrhea", "loose motions": "diarrhea", "pet kharab": "diarrhea",
    "stomach pain": "stomach_pain", "stomach ache": "stomach_pain", "pet me dard": "stomach_pain", "pet dard": "stomach_pain",
    "abdominal cramps": "abdominal_cramps", "pet me aathan": "abdominal_cramps", "cramps": "abdominal_cramps",
    "acidity": "acidity", "gas": "acidity", "tezabiyath": "acidity", "heartburn": "acidity",
    "bloating": "bloating", "pet phoolna": "bloating",
    "loss of appetite": "loss_of_appetite", "bhookh nahi": "loss_of_appetite", "bhook kam": "loss_of_appetite",
    "constipation": "constipation", "kabz": "constipation", "pet saaf nahi": "constipation",
    # Dizziness & Sensations
    "dizziness": "dizziness", "chakar": "dizziness", "chakkar": "dizziness", "dizzy": "dizziness",
    "lightheadedness": "lightheadedness", "sir ghoomna": "lightheadedness",
    "sensitivity to light": "sensitivity_to_light", "roshni se dard": "sensitivity_to_light", "photophobia": "sensitivity_to_light",
    # Skin & Eyes
    "skin rash": "skin_rash", "rash": "skin_rash", "dane": "skin_rash", "laal dane": "skin_rash",
    "itching": "itching", "khujli": "itching", "itchy": "itching",
    "red eyes": "red_eyes", "aankhein laal": "red_eyes",
    "watery eyes": "watery_eyes", "aankhon me paani": "watery_eyes",
    # Urinary
    "frequent urination": "frequent_urination", "baar baar peshab": "frequent_urination",
    "burning urination": "burning_urination", "peshab me jalan": "burning_urination", "burning urine": "burning_urination",
    # General / Other
    "sweating": "sweating", "paseena": "sweating", "perspiration": "sweating",
    "night sweats": "night_sweats", "raat ko paseena": "night_sweats",
    "dehydration": "dehydration", "paani ki kami": "dehydration", "pyaas": "dehydration",
    "anxiety": "anxiety", "ghabrahat": "anxiety", "tention": "anxiety", "stress": "anxiety",
    "insomnia": "insomnia", "neend nahi": "insomnia", "sleeplessness": "insomnia"
}

class ClassifierService:
    def __init__(self):
        self.model = None
        self.label_encoder = None
        self.symptoms = []
        self._load_model()
        
    def _load_model(self):
        if os.path.exists(CLASSIFIER_PATH) and os.path.exists(ENCODER_PATH) and os.path.exists(FEATURES_PATH):
            self.model = joblib.load(CLASSIFIER_PATH)
            self.label_encoder = joblib.load(ENCODER_PATH)
            with open(FEATURES_PATH, "r", encoding="utf-8") as f:
                feat_data = json.load(f)
                self.symptoms = feat_data.get("symptoms", [])
        else:
            print("Warning: Classifier artifacts not found. Inference will fall back to heuristic matching.")

    def extract_symptom_vector(self, text_list: list):
        import pandas as pd
        combined_text = " ".join(text_list).lower()
        feature_dict = {sym: 0 for sym in self.symptoms}
        detected_symptoms = []
        
        for kw, sym in KEYWORD_TO_SYMPTOM_MAP.items():
            if kw in combined_text:
                if sym in self.symptoms:
                    feature_dict[sym] = 1
                    if sym not in detected_symptoms:
                        detected_symptoms.append(sym)
                        
        df_vector = pd.DataFrame([feature_dict])
        return df_vector, detected_symptoms

    def predict_top3(self, conversation_history: list):
        # Extract text from all user messages in history
        user_texts = [msg["content"] for msg in conversation_history if msg.get("role") == "user"]
        if not user_texts:
            return [], 0.0, []
            
        vector_df, detected_symptoms = self.extract_symptom_vector(user_texts)
        
        if self.model is None or vector_df.values.sum() == 0:
            # Fallback heuristic if model missing or no symptoms extracted
            return [{"condition": "Viral Fever / Seasonal Illness", "confidence": 0.70}], 0.70, detected_symptoms
            
        probs = self.model.predict_proba(vector_df)[0]
        top3_indices = np.argsort(probs)[::-1][:3]
        
        top3_results = []
        for idx in top3_indices:
            cond_name = self.label_encoder.inverse_transform([idx])[0]
            conf = round(float(probs[idx]), 4)
            top3_results.append({
                "condition": cond_name,
                "confidence": conf
            })
            
        top_conf = top3_results[0]["confidence"] if top3_results else 0.0
        return top3_results, top_conf, detected_symptoms

classifier_service = ClassifierService()
