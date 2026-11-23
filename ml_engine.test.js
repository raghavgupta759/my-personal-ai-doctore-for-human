import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkRedFlags,
  checkRedFlagsInIntake,
  predictTop3,
  getConditionKnowledge,
  getAllLanguageKnowledge,
  KNOWLEDGE_BASE
} from './ml_engine.js';

test('Emergency red flag detection identifies life-threatening signs', () => {
  const result1 = checkRedFlags('I have severe chest pain and breathlessness');
  assert.equal(result1.is_emergency, true);
  assert.match(result1.emergency_message, /EMERGENCY WARNING/);

  const result2 = checkRedFlags('chhati me bahut tez dard ho raha hai');
  assert.equal(result2.is_emergency, true);

  const safe = checkRedFlags('I have mild runny nose and sneezing');
  assert.equal(safe.is_emergency, false);
});

test('Intake emergency check escalates severe ratings with critical symptoms', () => {
  const safe = checkRedFlagsInIntake(['Fever'], 'Mild fever', 4);
  assert.equal(safe.is_emergency, false);

  const dangerous = checkRedFlagsInIntake(['chest pain', 'sweating'], 'Very bad', 9);
  assert.equal(dangerous.is_emergency, true);
});

test('Symptom classifier predicts Viral Fever for fever, body ache, and chills', () => {
  const { top3, topConf } = predictTop3(['Fever', 'Body Ache', 'Chills'], 'Feeling weak and cold');
  assert.ok(top3.length === 3);
  assert.ok(topConf >= 0.65);
  const conditions = top3.map(t => t.condition);
  assert.ok(conditions.includes('Viral Fever') || conditions.includes('Flu (Influenza)'));
});

test('Symptom classifier predicts Common Cold for cough and runny nose', () => {
  const { top3 } = predictTop3(['Cough', 'Runny Nose', 'Sore Throat'], 'Sneezing frequently');
  assert.equal(top3[0].condition, 'Common Cold');
});

test('Symptom classifier predicts Migraine for throbbing headache with light sensitivity', () => {
  const { top3 } = predictTop3(['Headache', 'Dizziness'], 'Throbbing pain on one side with light nausea');
  assert.equal(top3[0].condition, 'Migraine');
});

test('Symptom classifier predicts Gastritis for acidity and stomach pain', () => {
  const { top3 } = predictTop3(['Stomach Pain', 'Acidity'], 'Burning sensation in chest and stomach');
  assert.equal(top3[0].condition, 'Gastritis / Acid Reflux');
});

test('Symptom classifier predicts Food Poisoning for loose motion and vomiting after food', () => {
  const { top3 } = predictTop3(['Loose Motion', 'Vomiting'], 'Ate outside street food last night');
  assert.equal(top3[0].condition, 'Food Poisoning / Gastroenteritis');
});

test('Multilingual knowledge base returns valid content for all supported languages', () => {
  const en = getConditionKnowledge('Viral Fever', 'english');
  assert.equal(en.condition, 'Viral Fever');
  assert.ok(en.medication_guidance.includes('Paracetamol'));

  const hi = getConditionKnowledge('Viral Fever', 'hindi');
  assert.ok(hi.condition.includes('बुखार'));

  const hinglish = getConditionKnowledge('Viral Fever', 'hinglish');
  assert.ok(hinglish.condition.includes('Bukhar'));

  const all = getAllLanguageKnowledge('Migraine');
  assert.ok(all.english);
  assert.ok(all.hindi);
  assert.ok(all.hinglish);
});
