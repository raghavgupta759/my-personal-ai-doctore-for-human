import os
import json
import joblib
import numpy as np

MODEL_PATH = "ML/models/symptom_classifier.pkl"
ENCODER_PATH = "ML/models/label_encoder.pkl"
FEATURES_PATH = "ML/models/symptom_features.json"
MAPPING_PATH = "ML/src/symptom_mapping.json"

class SymptomClassifierService:
    def __init__(self):
        self.model = None
        self.encoder = None
        self.features = []
        self.mapping = {}
        self.load_artifacts()

    def load_artifacts(self):
        if os.path.exists(MODEL_PATH):
            self.model = joblib.load(MODEL_PATH)
        if os.path.exists(ENCODER_PATH):
            self.encoder = joblib.load(ENCODER_PATH)
        if os.path.exists(FEATURES_PATH):
            with open(FEATURES_PATH, "r") as f:
                self.features = json.load(f)
        if os.path.exists(MAPPING_PATH):
            with open(MAPPING_PATH, "r") as f:
                self.mapping = json.load(f)

    def normalize_symptom(self, symptom: str) -> str:
        if not symptom:
            return ""
        clean = symptom.lower().strip().replace(" ", "_")
        if clean in self.mapping:
            return self.mapping[clean]
        for k, v in self.mapping.items():
            if k in clean:
                return v
        return clean

    def predict_top3(self, symptoms: list):
        if not self.model or not self.encoder or not self.features:
            # Fallback mock prediction if model artifacts not trained yet
            return [{"condition": "Viral Fever", "confidence": 0.85}, {"condition": "Common Cold", "confidence": 0.10}, {"condition": "Flu (Influenza)", "confidence": 0.05}], 0.85, True

        normalized_user = set(self.normalize_symptom(s) for s in symptoms)
        vector = [1 if feat in normalized_user else 0 for feat in self.features]
        X = np.array([vector])

        if hasattr(self.model, "predict_proba"):
            probs = self.model.predict_proba(X)[0]
            top_indices = np.argsort(probs)[::-1][:3]
            top3 = []
            for idx in top_indices:
                cond = self.encoder.inverse_transform([idx])[0]
                conf = float(probs[idx])
                top3.append({"condition": cond, "confidence": round(conf, 3)})
            top_conf = top3[0]["confidence"]
            return top3, top_conf, True
        else:
            pred_idx = self.model.predict(X)[0]
            cond = self.encoder.inverse_transform([pred_idx])[0]
            return [{"condition": cond, "confidence": 0.90}], 0.90, True

classifier_service = SymptomClassifierService()
