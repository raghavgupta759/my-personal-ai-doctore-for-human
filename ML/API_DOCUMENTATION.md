# API Documentation

## Endpoints

### POST /api/assess
Submits patient symptoms and clinical metadata for ML disease prediction and safety evaluation.
- **Request Body:**
  ```json
  {
    "name": "Patient Name",
    "age": 28,
    "gender": "Male",
    "symptoms": ["fever", "headache", "fatigue"],
    "duration": "1-2 days",
    "severity_score": 5,
    "language": "english"
  }
  ```
- **Response:**
  ```json
  {
    "status": "success",
    "condition": "Viral Fever",
    "ml_confidence": 0.92,
    "cause": "...",
    "top3_predictions": [...]
  }
  ```
