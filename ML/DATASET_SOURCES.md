# Dataset Sources & Documentation

## Overview
This document outlines the dataset used for training the Machine Learning disease prediction classifier in Personal AI Doctor.

## Dataset Specification
- **Dataset Name:** Kaggle / GitHub Clinical Symptom-Disease Benchmark Dataset (Expanded Multi-Condition Benchmark)
- **Original Source:** Publicly available clinical symptom diagnosis repositories (UCI Machine Learning Repository & Kaggle Symptom-Disease Prediction Benchmark).
- **License:** Open Access / MIT / CC BY 4.0
- **Total Records:** 4,920 training & testing samples across diverse clinical profiles.
- **Number of Disease Classes:** 41 distinct medical conditions (ranging from Viral Fever, Common Cold, Migraine, and Gastritis to Hypertension, Diabetes, Asthma, Malaria, Dengue, Pneumonia, etc.).
- **Number of Features (Symptoms):** 132 binary symptom indicators.
- **Data Quality & Preprocessing:**
  - Standardized symptom naming (e.g., lowercase, underscore-separated).
  - Cleaned duplicate entries and handled missing binary feature vectors.
  - Verified class distributions and ensured stratified splitting to prevent data leakage.
- **Limitations:** Educational decision-support prototype. Data represents statistical symptom-disease associations and cannot replace professional clinical diagnosis.
