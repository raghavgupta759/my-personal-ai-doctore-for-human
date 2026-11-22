# Training Guide

## Prerequisites
- Python 3.10+
- `numpy`, `pandas`, `scikit-learn`, `joblib`

## Steps to Train the Model
1. Place the dataset CSV in `ML/datasets/raw/symptom_disease_dataset.csv`.
2. Run the preprocessing and training script:
   ```bash
   python3 ML/src/train.py
   ```
3. The training script will:
   - Load and clean raw symptom-disease records.
   - Build binary feature matrices and train/test splits.
   - Train multiple candidate algorithms (Logistic Regression, Random Forest, SVM, Gradient Boosting).
   - Evaluate performance on the independent test set.
   - Serialize the best model and label encoder into `ML/model_artifacts/` (or `ML/models/`).
   - Generate evaluation reports and confusion matrix plots under `ML/reports/`.
