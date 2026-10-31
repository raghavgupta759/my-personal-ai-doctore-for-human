import os
import sys
import uuid
from datetime import datetime

workspace_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if workspace_root not in sys.path:
    sys.path.insert(0, workspace_root)

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from backend.db.database import get_connection, get_latest_diagnosis, get_conversation_messages, get_or_create_default_profile

REPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

def generate_pdf_report(conversation_id: str) -> str:
    profile = get_or_create_default_profile()
    messages = get_conversation_messages(conversation_id)
    diagnosis = get_latest_diagnosis(conversation_id)
    
    report_filename = f"consultation_report_{conversation_id[:8]}.pdf"
    file_path = os.path.join(REPORTS_DIR, report_filename)
    
    doc = SimpleDocTemplate(
        file_path,
        pagesize=letter,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1A365D"),
        alignment=0
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#4A5568")
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#2B6CB0"),
        spaceBefore=10,
        spaceAfter=6
    )
    
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#2D3748")
    )
    
    bold_label = ParagraphStyle(
        'BoldLabel',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1A202C")
    )
    
    disclaimer_style = ParagraphStyle(
        'DisclaimerText',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#718096")
    )
    
    signature_style = ParagraphStyle(
        'SignatureText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#2B6CB0"),
        alignment=2
    )

    elements = []
    
    # 1. Header Banner
    elements.append(Paragraph("🩺 Personal AI Doctor — Consultation Summary Report", title_style))
    elements.append(Paragraph(f"Date & Time: {datetime.now().strftime('%d %B %Y, %I:%M %p')} | Consultation ID: {conversation_id[:12]}", subtitle_style))
    elements.append(Spacer(1, 10))
    elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#3182CE"), spaceBefore=2, spaceAfter=12))
    
    # 2. Patient Profile Box
    elements.append(Paragraph("👤 Patient Profile Information", section_heading))
    profile_data = [
        [Paragraph("<b>Name:</b>", bold_label), Paragraph(profile.get("name", "Guest"), body_style),
         Paragraph("<b>Age / Gender:</b>", bold_label), Paragraph(f"{profile.get('age', 25)} yrs / {profile.get('gender', 'Other')}", body_style)],
        [Paragraph("<b>Known Allergies:</b>", bold_label), Paragraph(profile.get("allergies", "None"), body_style),
         Paragraph("<b>Chronic Conditions:</b>", bold_label), Paragraph(profile.get("chronic_conditions", "None"), body_style)]
    ]
    t_profile = Table(profile_data, colWidths=[110, 160, 110, 160])
    t_profile.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F7FAFC")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#EDF2F7")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(t_profile)
    elements.append(Spacer(1, 12))
    
    # 3. Diagnosis & ML Prediction Breakdown
    elements.append(Paragraph("🧠 Clinical AI Diagnosis & Assessment", section_heading))
    if diagnosis:
        ml_top3 = diagnosis.get("ml_top3_predictions", [])
        ml_conf = diagnosis.get("ml_confidence", 0.0) * 100
        
        diag_rows = [
            [Paragraph("<b>Primary Condition:</b>", bold_label), Paragraph(f"<b>{diagnosis.get('condition', 'N/A')}</b> (ML Confidence: {ml_conf:.1f}%)", body_style)],
            [Paragraph("<b>Why This Happens:</b>", bold_label), Paragraph(diagnosis.get("cause", "N/A"), body_style)],
            [Paragraph("<b>Medicine Guidance:</b>", bold_label), Paragraph(diagnosis.get("medication_guidance", "N/A"), body_style)],
            [Paragraph("<b>Recovery Timeline:</b>", bold_label), Paragraph(diagnosis.get("recovery_days", "N/A"), body_style)],
            [Paragraph("<b>Diet & Home Remedies:</b>", bold_label), Paragraph(f"{diagnosis.get('diet_advice', '')} {diagnosis.get('home_remedies', '')}", body_style)],
            [Paragraph("<b>Rest Needed:</b>", bold_label), Paragraph(diagnosis.get("rest_days", "N/A"), body_style)],
            [Paragraph("<b>Red-Flag Warnings:</b>", bold_label), Paragraph(f"<font color='#C53030'><b>{diagnosis.get('red_flags', 'N/A')}</b></font>", body_style)]
        ]
        t_diag = Table(diag_rows, colWidths=[140, 400])
        t_diag.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#EBF8FF")),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#BEE3F8")),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E0")),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        elements.append(t_diag)
    else:
        elements.append(Paragraph("No formal diagnosis recorded for this consultation.", body_style))
        
    elements.append(Spacer(1, 12))
    
    # 4. Medically Relevant Conversation & Key Findings Summary
    elements.append(Paragraph("📋 Key Clinical Summary & Discussion Points", section_heading))
    
    # Extract user queries and assistant highlights for concise summary
    user_queries = [m["content"] for m in messages if m["role"] == "user" and not m["content"].startswith("Patient:")]
    summary_text = ""
    if user_queries:
        summary_text = "<b>Topics Discussed:</b> " + ", ".join([f'"{q}"' for q in user_queries[:5]])
    else:
        summary_text = "Initial symptom intake assessment completed. No follow-up queries recorded."
        
    summary_rows = [
        [Paragraph("<b>Key Findings Summary:</b>", bold_label), Paragraph(summary_text, body_style)],
        [Paragraph("<b>Recommended Next Steps:</b>", bold_label), Paragraph("1. Follow diet & hydration guidance.<br/>2. Monitor symptoms closely over the next 24-48 hours.<br/>3. Consult a healthcare provider if symptoms worsen or fail to improve.", body_style)]
    ]
    
    t_summary = Table(summary_rows, colWidths=[140, 400])
    t_summary.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#F7FAFC")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#E2E8F0")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#EDF2F7")),
        ('PADDING', (0,0), (-1,-1), 6),
    ]))
    elements.append(t_summary)
    
    elements.append(Spacer(1, 15))
    elements.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CBD5E0"), spaceBefore=4, spaceAfter=8))
    
    # 5. Medical Disclaimer & Footer Signature
    elements.append(Paragraph("<b>MEDICAL DISCLAIMER:</b> Personal AI Doctor is a local privacy-first AI assistant intended for informational and educational symptom assessment only. It does not provide a binding medical diagnosis or prescription dosage. In case of emergency, immediately call 112 (India Emergency) or 108 (Ambulance).", disclaimer_style))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("Made by Raghav", signature_style))
    
    doc.build(elements)
    
    # Save record to SQLite
    conn = get_connection()
    cursor = conn.cursor()
    report_id = str(uuid.uuid4())
    cursor.execute("INSERT INTO reports (id, conversation_id, file_path) VALUES (?, ?, ?)", (report_id, conversation_id, file_path))
    conn.commit()
    conn.close()
    
    return report_id


import re
import json

COMMON_LAB_PATTERNS = [
    {"name": "Hemoglobin", "regex": r"(?:hemoglobin|hb|hgb)\b[^\d]*(\d+(?:\.\d+)?)\s*(g/dl|g/l|gm%)?", "unit": "g/dL", "ref": "13.0 - 17.0 g/dL (Male) / 12.0 - 15.5 g/dL (Female)"},
    {"name": "WBC (Total Leucocyte Count)", "regex": r"(?:wbc|white blood cell|tlc|total leucocyte count)\b[^\d]*(\d+(?:\.\d+)?|\d+,\d+)\s*(/\s*ul|/\s*cumm|x10\^3/\s*ul)?", "unit": "/uL", "ref": "4,000 - 11,000 /uL"},
    {"name": "RBC (Red Blood Cell Count)", "regex": r"(?:rbc|red blood cell)\b[^\d]*(\d+(?:\.\d+)?)\s*(mil/ul|million/ul|x10\^6/\s*ul)?", "unit": "million/uL", "ref": "4.5 - 5.9 million/uL"},
    {"name": "Platelet Count", "regex": r"(?:platelet|plt|platlets)\b[^\d]*(\d+(?:\.\d+)?|\d+,\d+)\s*(lakhs?/cumm|/cumm|x10\^3/\s*ul)?", "unit": "/uL", "ref": "150,000 - 450,000 /uL (1.5 - 4.5 Lakhs)"},
    {"name": "Fasting Blood Sugar (Glucose)", "regex": r"(?:fasting blood sugar|fasting glucose|fbs)\b[^\d]*(\d+(?:\.\d+)?)\s*(mg/dl)?", "unit": "mg/dL", "ref": "70 - 99 mg/dL"},
    {"name": "HbA1c (Glycated Hemoglobin)", "regex": r"(?:hba1c|glycated hemoglobin)\b[^\d]*(\d+(?:\.\d+)?)\s*(%)?", "unit": "%", "ref": "< 5.7% (Normal), 5.7-6.4% (Prediabetes)"},
    {"name": "Total Cholesterol", "regex": r"(?:total cholesterol|cholesterol total)\b[^\d]*(\d+(?:\.\d+)?)\s*(mg/dl)?", "unit": "mg/dL", "ref": "< 200 mg/dL"},
    {"name": "Triglycerides", "regex": r"(?:triglycerides|triglyceride)\b[^\d]*(\d+(?:\.\d+)?)\s*(mg/dl)?", "unit": "mg/dL", "ref": "< 150 mg/dL"},
    {"name": "TSH (Thyroid Stimulating Hormone)", "regex": r"(?:tsh|thyroid stimulating hormone)\b[^\d]*(\d+(?:\.\d+)?)\s*(uIU/ml|uIU/mL|mIU/L)?", "unit": "uIU/mL", "ref": "0.45 - 4.5 uIU/mL"},
    {"name": "Vitamin D (25-OH)", "regex": r"(?:vitamin d|25-hydroxy vitamin d)\b[^\d]*(\d+(?:\.\d+)?)\s*(ng/ml)?", "unit": "ng/mL", "ref": "30 - 100 ng/mL"},
    {"name": "Vitamin B12", "regex": r"(?:vitamin b12|b12)\b[^\d]*(\d+(?:\.\d+)?)\s*(pg/ml)?", "unit": "pg/mL", "ref": "200 - 900 pg/mL"},
    {"name": "Serum Creatinine", "regex": r"(?:serum creatinine|creatinine)\b[^\d]*(\d+(?:\.\d+)?)\s*(mg/dl)?", "unit": "mg/dL", "ref": "0.74 - 1.35 mg/dL"},
    {"name": "Uric Acid", "regex": r"(?:uric acid)\b[^\d]*(\d+(?:\.\d+)?)\s*(mg/dl)?", "unit": "mg/dL", "ref": "3.5 - 7.2 mg/dL"},
    {"name": "Bilirubin Total", "regex": r"(?:bilirubin total|total bilirubin)\b[^\d]*(\d+(?:\.\d+)?)\s*(mg/dl)?", "unit": "mg/dL", "ref": "0.2 - 1.2 mg/dL"},
    {"name": "ALT / SGPT", "regex": r"(?:sgpt|alt|alanine aminotransferase)\b[^\d]*(\d+(?:\.\d+)?)\s*(u/l|iu/l)?", "unit": "U/L", "ref": "7 - 56 U/L"}
]

def parse_medical_report_text(report_text: str, report_name: str = "Medical Report") -> dict:
    cleaned = report_text.strip()
    extracted_tests = []
    lines = cleaned.split("\n")
    
    # Try structured pattern matching
    for pattern in COMMON_LAB_PATTERNS:
        match = re.search(pattern["regex"], cleaned, re.IGNORECASE)
        if match:
            val_str = match.group(1).replace(",", "")
            unit = match.group(2) or pattern["unit"]
            try:
                val_num = float(val_str)
                flag = "normal"
                if "Hemoglobin" in pattern["name"]:
                    if val_num < 12.0: flag = "low (Anaemia indicator)"
                    elif val_num > 17.5: flag = "high"
                elif "WBC" in pattern["name"]:
                    if val_num > 11000 or val_num < 4000: flag = "out of range (Infection/Immune flag)"
                elif "Platelet" in pattern["name"]:
                    if val_num < 150000 and val_num > 150: val_num = val_num * 1000 # convert lakhs/k if needed
                    if val_num < 150000: flag = "low (Thrombocytopenia flag)"
                elif "Glucose" in pattern["name"]:
                    if val_num > 100: flag = "elevated"
                elif "HbA1c" in pattern["name"]:
                    if val_num >= 5.7: flag = "elevated"

                extracted_tests.append({
                    "test": pattern["name"],
                    "value": str(val_str),
                    "unit": unit,
                    "reference_range": pattern["ref"],
                    "flag": flag
                })
            except Exception:
                extracted_tests.append({
                    "test": pattern["name"],
                    "value": val_str,
                    "unit": unit,
                    "reference_range": pattern["ref"],
                    "flag": "normal"
                })

    # If key-value line patterns exist like "Test Name: Value"
    if not extracted_tests:
        for line in lines:
            if ":" in line or "=" in line:
                parts = re.split(r"[:=]", line, maxsplit=1)
                t_name = parts[0].strip()
                t_val = parts[1].strip()
                if t_name and t_val:
                    extracted_tests.append({
                        "test": t_name,
                        "value": t_val,
                        "unit": "",
                        "reference_range": "Not specified",
                        "flag": "normal"
                    })

    return {
        "report_name": report_name,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "raw_text": cleaned,
        "tests": extracted_tests
    }

def format_structured_report_context(report_record: dict) -> str:
    if not report_record:
        return "No uploaded medical report available."

    extracted = report_record.get("extracted_json", {})
    if isinstance(extracted, str):
        try: extracted = json.loads(extracted)
        except Exception: extracted = {}

    rep_name = report_record.get("report_name") or extracted.get("report_name") or "Medical Lab Report"
    rep_date = report_record.get("report_date") or extracted.get("date") or "Recent"
    tests = extracted.get("tests", [])
    raw_text = report_record.get("raw_text") or extracted.get("raw_text") or ""

    output_lines = [
        f"MEDICAL REPORT CONTEXT:",
        f"- Report Name: {rep_name}",
        f"- Date: {rep_date}"
    ]

    if tests:
        output_lines.append("- Parsed Lab Test Findings:")
        for t in tests:
            t_name = t.get("test", "Test")
            val = t.get("value", "N/A")
            unit = t.get("unit", "")
            ref = t.get("reference_range", "")
            flag = t.get("flag", "normal")
            output_lines.append(f"  * {t_name}: {val} {unit} (Ref Range: {ref}) [Status: {flag.upper()}]")
    elif raw_text:
        output_lines.append(f"- Raw Report Text Excerpt:\n  {raw_text[:800]}")
    else:
        output_lines.append("- Report Content: Attached")

    return "\n".join(output_lines)

