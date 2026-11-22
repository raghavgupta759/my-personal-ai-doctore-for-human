import os
import json
import pandas as pd
import numpy as np

def normalize_symptom(symptom: str, mapping_path: str = None) -> str:
    if not symptom:
        return ""
    clean = symptom.lower().strip().replace(" ", "_")
    if mapping_path and os.path.exists(mapping_path):
        with open(mapping_path, "r") as f:
            mapping = json.load(f)
            if clean in mapping:
                return mapping[clean]
            for k, v in mapping.items():
                if k in clean:
                    return v
    return clean

def build_feature_vector(user_symptoms: list, feature_columns: list, mapping_path: str = None) -> list:
    normalized = set(normalize_symptom(s, mapping_path) for s in user_symptoms)
    vector = [1 if feat in normalized else 0 for feat in feature_columns]
    return vector
