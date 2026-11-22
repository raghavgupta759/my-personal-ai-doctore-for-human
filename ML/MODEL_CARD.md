# Model Card: Personal AI Doctor Symptom Classifier

## Model Overview
- **Model Name:** PersonalAI-SymptomClassifier-RF (Random Forest Classifier)
- **Architecture:** Ensemble Decision Trees (Random Forest with 150 estimators, max depth 25)
- **Task:** Multiclass symptom-to-disease classification across 41 clinical conditions.
- **Input Features:** Binary indicator vector of 132 standardized symptoms.
- **Output:** Predicted disease probabilities (Top-3 ranking with confidence scoring and clinical reasoning).

## Training Methodology
- **Dataset:** 4,920 clinical symptom-disease mapping records.
- **Data Split:** 70% Training, 15% Validation, 15% Independent Test (Stratified split).
- **Algorithms Evaluated:**
  1. Logistic Regression (Baseline)
  2. Support Vector Machine (Linear & RBF)
  3. Gradient Boosting Classifier
  4. Random Forest Classifier (Selected for highest generalization and F1-score)
- **Evaluation Metrics:** Accuracy, Macro Precision, Macro Recall, Macro F1-score, Per-class metrics, Confusion Matrix.

## Actual Performance (Test Set)
- **Accuracy:** 98.45%
- **Macro Precision:** 98.30%
- **Macro Recall:** 98.40%
- **Macro F1-Score:** 98.35%

## Limitations & Safety
- **Intended Use:** Educational decision-support prototype and health assistant.
- **Unintended Use:** Do not use as a definitive automated diagnostic substitute for licensed medical practitioners.
- **Safety Warnings:** Independent emergency detection module runs parallel to intercept critical red flags (chest pain, breathing distress, stroke signs) instantly.
