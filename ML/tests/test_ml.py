import os
import unittest
import json
import subprocess

class TestMLPipeline(unittest.TestCase):
    def test_dataset_exists(self):
        self.assertTrue(os.path.exists("ML/datasets/raw/symptom_disease_dataset.csv"))

    def test_model_artifacts_exist(self):
        self.assertTrue(os.path.exists("ML/models/symptom_classifier.pkl"))
        self.assertTrue(os.path.exists("ML/models/label_encoder.pkl"))
        self.assertTrue(os.path.exists("ML/models/symptom_features.json"))

    def test_inference_script(self):
        payload = json.dumps({"symptoms": ["fever", "headache"]})
        res = subprocess.run(
            ["python3", "ML/src/run_inference.py"],
            input=payload,
            text=True,
            capture_output=True,
            timeout=5
        )
        self.assertEqual(res.returncode, 0)
        data = json.loads(res.stdout)
        self.assertIn("top3", data)
        self.assertGreater(len(data["top3"]), 0)

if __name__ == "__main__":
    unittest.main()
