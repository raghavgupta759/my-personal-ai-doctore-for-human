import os
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, accuracy_score, precision_recall_fscore_support, confusion_matrix

# Ensure directories exist
os.makedirs("ml/dataset", exist_ok=True)
os.makedirs("ml/model_artifacts", exist_ok=True)

# 1. Define Standard Symptoms List (50 structured symptoms)
SYMPTOMS = [
    "fever", "chills", "high_fever", "body_ache", "headache", "fatigue", "weakness",
    "cough", "dry_cough", "wet_cough", "runny_nose", "sneezing", "sore_throat",
    "shortness_of_breath", "chest_pain", "wheezing",
    "nausea", "vomiting", "diarrhea", "stomach_pain", "abdominal_cramps", "loss_of_appetite", "acidity", "bloating",
    "dizziness", "lightheadedness", "joint_pain", "muscle_soreness", "back_pain",
    "skin_rash", "itching", "red_eyes", "watery_eyes",
    "frequent_urination", "burning_urination", "sweating", "night_sweats", "stiff_neck",
    "sensitivity_to_light", "confusion", "anxiety", "insomnia", "dehydration",
    "swollen_tonsils", "hoarseness", "loss_of_taste", "loss_of_smell", "constipation",
    "weight_loss", "swollen_glands"
]

# 2. Define Diseases & Symptom Profiles for Clean Dataset Generation
DISEASE_SYMPTOM_MAP = {
    "Viral Fever": ["fever", "chills", "body_ache", "headache", "fatigue", "weakness", "sweating", "loss_of_appetite"],
    "Common Cold": ["runny_nose", "sneezing", "sore_throat", "cough", "headache", "watery_eyes"],
    "Flu (Influenza)": ["high_fever", "chills", "cough", "sore_throat", "body_ache", "headache", "fatigue", "weakness"],
    "Migraine": ["headache", "nausea", "sensitivity_to_light", "dizziness", "vomiting"],
    "Tension Headache": ["headache", "stiff_neck", "muscle_soreness", "fatigue"],
    "Food Poisoning": ["nausea", "vomiting", "diarrhea", "stomach_pain", "abdominal_cramps", "fever", "dehydration", "weakness"],
    "Gastroenteritis (Stomach Flu)": ["diarrhea", "vomiting", "stomach_pain", "nausea", "fever", "weakness"],
    "Gastritis / Acid Reflux": ["acidity", "stomach_pain", "nausea", "bloating", "loss_of_appetite"],
    "Typhoid": ["high_fever", "stomach_pain", "headache", "weakness", "loss_of_appetite", "diarrhea", "constipation"],
    "Dengue": ["high_fever", "joint_pain", "muscle_soreness", "headache", "skin_rash", "fatigue", "nausea"],
    "Allergic Rhinitis": ["sneezing", "runny_nose", "itching", "watery_eyes", "red_eyes"],
    "Bronchitis": ["cough", "wet_cough", "shortness_of_breath", "chest_pain", "fatigue", "wheezing"],
    "Pneumonia": ["high_fever", "chills", "cough", "shortness_of_breath", "chest_pain", "fatigue", "sweating"],
    "Urinary Tract Infection (UTI)": ["frequent_urination", "burning_urination", "stomach_pain", "fever", "back_pain"],
    "Tonsillitis": ["sore_throat", "swollen_tonsils", "fever", "headache", "swollen_glands"],
    "Sinusitis": ["headache", "runny_nose", "fever", "cough", "fatigue"],
    "Hypertension (High BP)": ["headache", "dizziness", "lightheadedness", "shortness_of_breath"],
    "Hypoglycemia (Low Blood Sugar)": ["sweating", "dizziness", "weakness", "confusion", "anxiety", "headache"],
    "Asthma Flare-up": ["shortness_of_breath", "wheezing", "cough", "chest_pain"],
    "Contact Dermatitis / Skin Allergy": ["skin_rash", "itching"],
    "Insomnia / Anxiety Stress": ["insomnia", "anxiety", "fatigue", "headache", "muscle_soreness"],
    "Dehydration": ["dizziness", "fatigue", "headache", "dehydration", "weakness"],
}

def generate_synthetic_dataset(num_samples_per_disease=80):
    np.random.seed(42)
    data = []
    
    for disease, primary_symptoms in DISEASE_SYMPTOM_MAP.items():
        for _ in range(num_samples_per_disease):
            row = {sym: 0 for sym in SYMPTOMS}
            # Primary symptoms present with high probability (85-100%)
            for sym in primary_symptoms:
                if sym in row:
                    row[sym] = 1 if np.random.rand() < 0.90 else 0
            
            # Add random noise (unrelated symptom with 4% chance)
            for sym in SYMPTOMS:
                if sym not in primary_symptoms:
                    row[sym] = 1 if np.random.rand() < 0.04 else 0
                    
            row["disease"] = disease
            data.append(row)
            
    df = pd.DataFrame(data)
    df.to_csv("ml/dataset/symptom_disease_dataset.csv", index=False)
    print(f"Generated dataset with {len(df)} rows and {len(df.columns)} columns.")
    return df

def train_and_evaluate():
    df = generate_synthetic_dataset()
    
    X = df[SYMPTOMS]
    y_raw = df["disease"]
    
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(y_raw)
    
    # Stratified split: 70% Train, 15% Val, 15% Test
    X_train, X_temp, y_train, y_temp = train_test_split(X, y, test_size=0.30, random_state=42, stratify=y)
    X_val, X_test, y_val, y_test = train_test_split(X_temp, y_temp, test_size=0.50, random_state=42, stratify=y_temp)
    
    print(f"Train size: {len(X_train)}, Val size: {len(X_val)}, Test size: {len(X_test)}")
    
    # Model: Random Forest with bounded depth & min_samples_leaf to prevent overfitting
    rf_model = RandomForestClassifier(
        n_estimators=120,
        max_depth=12,
        min_samples_split=4,
        min_samples_leaf=2,
        random_state=42
    )
    
    # 5-fold Cross-Validation on Training set
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(rf_model, X_train, y_train, cv=skf, scoring="accuracy")
    print(f"5-Fold Cross-Validation Accuracy: {np.mean(cv_scores):.4f} (+/- {np.std(cv_scores):.4f})")
    
    rf_model.fit(X_train, y_train)
    
    # Evaluate on Validation set
    val_preds = rf_model.predict(X_val)
    val_acc = accuracy_score(y_val, val_preds)
    print(f"Validation Accuracy: {val_acc:.4f}")
    
    # Final evaluation on Test set
    test_preds = rf_model.predict(X_test)
    test_acc = accuracy_score(y_test, test_preds)
    print(f"Test Accuracy: {test_acc:.4f}")
    
    precision, recall, f1, _ = precision_recall_fscore_support(y_test, test_preds, average="weighted")
    print(f"Weighted Precision: {precision:.4f}, Recall: {recall:.4f}, F1-score: {f1:.4f}")
    
    # Save artifacts
    joblib.dump(rf_model, "ml/model_artifacts/symptom_classifier.pkl")
    joblib.dump(label_encoder, "ml/model_artifacts/label_encoder.pkl")
    
    with open("ml/model_artifacts/symptom_features.json", "w", encoding="utf-8") as f:
        json.dump({
            "symptoms": SYMPTOMS,
            "classes": label_encoder.classes_.tolist(),
            "test_accuracy": round(float(test_acc), 4),
            "f1_score": round(float(f1), 4)
        }, f, indent=2)
        
    print("Successfully trained model and saved artifacts in ml/model_artifacts/")

if __name__ == "__main__":
    train_and_evaluate()
