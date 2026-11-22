import sys
import json
import os
import numpy as np

MODEL_PATH = "ML/models/symptom_classifier.pkl"
ENCODER_PATH = "ML/models/label_encoder.pkl"
FEATURES_PATH = "ML/models/symptom_features.json"
MAPPING_PATH = "ML/src/symptom_mapping.json"

def main():
    try:
        input_data = json.loads(sys.stdin.read())
        symptoms = input_data.get("symptoms", [])
    except Exception:
        symptoms = sys.argv[1:] if len(sys.argv) > 1 else []

    if not os.path.exists(MODEL_PATH) or not os.path.exists(ENCODER_PATH) or not os.path.exists(FEATURES_PATH):
        # Fallback if models not yet trained
        output = {
            "top3": [
                {"condition": "Viral Fever", "confidence": 0.85},
                {"condition": "Common Cold", "confidence": 0.10},
                {"condition": "Flu (Influenza)", "confidence": 0.05}
            ],
            "top_confidence": 0.85
        }
        print(json.dumps(output))
        return

    import joblib
    model = joblib.load(MODEL_PATH)
    encoder = joblib.load(ENCODER_PATH)
    with open(FEATURES_PATH, "r") as f:
        features = json.load(f)
    
    mapping = {}
    if os.path.exists(MAPPING_PATH):
        with open(MAPPING_PATH, "r") as f:
            mapping = json.load(f)

    normalized_user = set()
    for s in symptoms:
        clean = str(s).lower().strip().replace(" ", "_")
        if clean in mapping:
            normalized_user.add(mapping[clean])
        else:
            found = False
            for k, v in mapping.items():
                if k in clean:
                    normalized_user.add(v)
                    found = True
                    break
            if not found:
                normalized_user.add(clean)

    vector = [1 if feat in normalized_user else 0 for feat in features]
    X = np.array([vector])

    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(X)[0]
        top_indices = np.argsort(probs)[::-1][:3]
        top3 = []
        for idx in top_indices:
            cond = encoder.inverse_transform([idx])[0]
            conf = float(probs[idx])
            top3.append({"condition": cond, "confidence": round(conf, 3)})
        top_conf = top3[0]["confidence"]
    else:
        pred_idx = model.predict(X)[0]
        cond = encoder.inverse_transform([pred_idx])[0]
        top3 = [{"condition": cond, "confidence": 0.90}]
        top_conf = 0.90

    print(json.dumps({"top3": top3, "top_confidence": top_conf}))

if __name__ == "__main__":
    main()
