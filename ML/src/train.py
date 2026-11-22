import os
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.svm import SVC
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix, classification_report
import joblib

def create_sample_dataset(csv_path: str):
    os.makedirs(os.path.dirname(csv_path), exist_ok=True)
    if os.path.exists(csv_path):
        return
    
    # Generate robust multi-condition clinical dataset
    diseases = [
        "Viral Fever", "Common Cold", "Migraine", "Gastritis / Acid Reflux",
        "Flu (Influenza)", "Typhoid", "Malaria", "Bronchitis", "Allergic Rhinitis"
    ]
    symptoms_pool = [
        "fever", "headache", "fatigue", "body_pain", "cough", "runny_nose",
        "throat_irritation", "nausea", "abdominal_pain", "diarrhoea", "chills",
        "dizziness", "breathlessness", "loss_of_appetite", "joint_pain"
    ]
    
    np.random.seed(42)
    data = []
    for _ in range(2500):
        disease = np.random.choice(diseases)
        # assign symptoms based on disease pattern + noise
        row = {"disease": disease}
        for s in symptoms_pool:
            prob = 0.05
            if disease == "Viral Fever" and s in ["fever", "fatigue", "body_pain", "chills"]:
                prob = 0.8
            elif disease == "Common Cold" and s in ["cough", "runny_nose", "throat_irritation", "fever"]:
                prob = 0.75
            elif disease == "Migraine" and s in ["headache", "dizziness", "nausea"]:
                prob = 0.85
            elif disease == "Gastritis / Acid Reflux" and s in ["nausea", "abdominal_pain", "loss_of_appetite"]:
                prob = 0.8
            elif disease == "Flu (Influenza)" and s in ["fever", "body_pain", "fatigue", "cough", "chills"]:
                prob = 0.82
            elif disease == "Typhoid" and s in ["fever", "abdominal_pain", "fatigue", "loss_of_appetite"]:
                prob = 0.8
            elif disease == "Malaria" and s in ["fever", "chills", "body_pain", "dizziness"]:
                prob = 0.85
            elif disease == "Bronchitis" and s in ["cough", "breathlessness", "fatigue"]:
                prob = 0.8
            elif disease == "Allergic Rhinitis" and s in ["runny_nose", "throat_irritation", "cough"]:
                prob = 0.75
            
            row[s] = 1 if np.random.rand() < prob else 0
        data.append(row)
        
    df = pd.DataFrame(data)
    df.to_csv(csv_path, index=False)

def main():
    raw_csv = "ML/datasets/raw/symptom_disease_dataset.csv"
    create_sample_dataset(raw_csv)
    
    df = pd.read_csv(raw_csv)
    if "disease" not in df.columns:
        raise ValueError("Dataset must contain 'disease' column")
        
    feature_cols = [c for c in df.columns if c != "disease"]
    X = df[feature_cols].values
    y = df["disease"].values
    
    from sklearn.preprocessing import LabelEncoder
    le = LabelEncoder()
    y_encoded = le.fit_transform(y)
    
    X_train, X_test, y_train, y_test = train_test_split(X, y_encoded, test_size=0.3, random_state=42, stratify=y_encoded)
    
    models = {
        "LogisticRegression": LogisticRegression(max_iter=500),
        "RandomForest": RandomForestClassifier(n_estimators=100, max_depth=20, random_state=42),
        "GradientBoosting": GradientBoostingClassifier(random_state=42),
        "SVM": SVC(probability=True, random_state=42)
    }
    
    best_acc = 0
    best_model_name = ""
    best_model = None
    evaluation_results = {}
    
    for name, model in models.items():
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        acc = accuracy_score(y_test, preds)
        prec, rec, f1, _ = precision_recall_fscore_support(y_test, preds, average="macro", zero_division=0)
        
        evaluation_results[name] = {
            "accuracy": float(acc),
            "macro_precision": float(prec),
            "macro_recall": float(rec),
            "macro_f1": float(f1)
        }
        
        if acc > best_acc:
            best_acc = acc
            best_model_name = name
            best_model = model
            
    print(f"Best Model Selected: {best_model_name} with Accuracy: {best_acc:.4f}")
    
    os.makedirs("ML/models", exist_ok=True)
    os.makedirs("ML/reports", exist_ok=True)
    os.makedirs("ml/model_artifacts", exist_ok=True)
    
    joblib.dump(best_model, "ML/models/symptom_classifier.pkl")
    joblib.dump(best_model, "ml/model_artifacts/symptom_classifier.pkl")
    joblib.dump(le, "ML/models/label_encoder.pkl")
    joblib.dump(le, "ml/model_artifacts/label_encoder.pkl")
    
    with open("ML/models/symptom_features.json", "w") as f:
        json.dump(feature_cols, f, indent=2)
    with open("ml/model_artifacts/symptom_features.json", "w") as f:
        json.dump(feature_cols, f, indent=2)
        
    with open("ML/reports/model_evaluation.json", "w") as f:
        json.dump(evaluation_results, f, indent=2)
        
    print("Training and evaluation completed successfully.")

if __name__ == "__main__":
    main()
