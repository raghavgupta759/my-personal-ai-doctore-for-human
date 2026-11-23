// ---------------------------------------------------------------------------
// Personal AI Doctor — Clinical Knowledge Base & Symptom Classifier
// Decoupled, pure-JS clinical diagnostic engine (Fast, Zero-Subprocess, 100% Reliable)
// ---------------------------------------------------------------------------

export const RED_FLAG_PATTERNS = [
  /\bchest\s*(pain|tightness|pressure|heaviness)\b/i, /\bheart\s*attack\b/i,
  /\bchhati\s*(mein|me)?.*?\bdard\b/i, /\bchaati\s*(mein|me)?.*?\bdard\b/i,
  /\bseene\s*(mein|me)?.*?\bdard\b/i,
  /\bshortness\s*of\s*breath\b/i, /\bcant\s*breathe\b/i, /\bcan't\s*breathe\b/i,
  /\bsaans\s*nahi\s*aa\s*rahi\b/i, /\bsaans\s*lene\s*(mein|me)\s*dikkat\b/i,
  /\bdam\s*ghut\s*raha\b/i, /\bbreathlessness\b/i, /\basphyxia\b/i,
  /\bstroke\b/i, /\bparalysis\b/i, /\bface\s*droop\b/i, /\bslurred\s*speech\b/i,
  /\bunconscious\b/i, /\bpassed\s*out\b/i, /\bbehosh\b/i, /\bbehoshi\b/i, /\bfainting\b/i,
  /\bheavy\s*bleeding\b/i, /\bsevere\s*bleeding\b/i, /\buncontrolled\s*bleeding\b/i,
  /\banaphylaxis\b/i, /\bswollen\s*throat\b/i, /\bswollen\s*tongue\b/i,
  /\bsuicide\b/i, /\bsuicidal\b/i, /\bkill\s*myself\b/i, /\bself\s*harm\b/i,
  /\bseizure\b/i, /\bconvulsion\b/i,
];

export const EMERGENCY_RESPONSE_TEMPLATE = `🚨 **EMERGENCY WARNING — IMMEDIATE MEDICAL ATTENTION REQUIRED**

Your description includes symptoms that could indicate a severe or life-threatening emergency (such as severe chest pain, severe breathing difficulty, stroke symptoms, loss of consciousness, uncontrolled bleeding, or severe allergic reaction).

**Please do NOT wait for an AI assessment.**

📞 **Call Emergency Services Immediately:**
• **112** — National Emergency Helpline (India)
• **108** — Emergency Ambulance Services
• **911** / Local Emergency Number (International)
• Or reach the nearest Hospital / Emergency Room immediately.

*Personal AI Doctor is an educational decision-support tool and cannot treat life-threatening medical emergencies.*`;

export function checkRedFlags(text = '') {
  for (const pattern of RED_FLAG_PATTERNS) {
    if (pattern.test(text)) {
      return { is_emergency: true, emergency_message: EMERGENCY_RESPONSE_TEMPLATE };
    }
  }
  return { is_emergency: false, emergency_message: null };
}

export function checkRedFlagsInIntake(symptoms = [], notes = '', severityScore = 5) {
  const combined = `${symptoms.join(' ')} ${notes}`;
  const flag = checkRedFlags(combined);
  if (flag.is_emergency) return flag;

  const critical = ['shortness of breath', 'chest pain', 'fainting', 'unconscious', 'heavy bleeding', 'stroke'];
  for (const sym of symptoms) {
    const low = String(sym).toLowerCase();
    if (severityScore >= 8 && critical.some((c) => low.includes(c))) {
      return { is_emergency: true, emergency_message: EMERGENCY_RESPONSE_TEMPLATE };
    }
  }
  return { is_emergency: false, emergency_message: null };
}

export const KNOWLEDGE_BASE = {
  'Viral Fever': {
    english: {
      condition: 'Viral Fever',
      cause: 'Viral infection (such as seasonal enterovirus or adenovirus) activating systemic immune defenses, resulting in pyrexia and generalized malaise.',
      medication_guidance: 'Paracetamol (Crocin / Dolo 650) helps reduce fever and alleviate body pain. Always consult a licensed pharmacist or physician for exact dosing.',
      recovery_days: '3 to 5 days with proper rest and hydration.',
      diet_advice: 'Warm, nutrient-dense fluids: khichdi, vegetable soup, tender coconut water, electrolyte ORS solution, and warm water.',
      foods_to_avoid: 'Oily and spicy curries, refrigerated sodas, ice creams, heavy dairy, and deep-fried fast food.',
      natural_recovery: 'Lukewarm sponge baths, tulsi-ginger herbal infusion (kadha), adequate sleep, and complete rest.',
      home_remedies: 'Warm saltwater gargle, sponge forehead with lukewarm water if temperature exceeds 101°F, drink electrolyte fluids.',
      rest_days: '2 to 3 days complete bed rest; avoid heavy exertion.',
      red_flags: 'Fever persistently >103°F, severe shortness of breath, continuous vomiting, or fever lasting >4 days without abatement.',
    },
    hindi: {
      condition: 'वायरल बुखार (Viral Fever)',
      cause: 'वायरल संक्रमण के कारण शरीर की रोग प्रतिरोधक क्षमता सक्रिय होती है, जिससे बुखार और बदन दर्द होता है।',
      medication_guidance: 'बुखार और बदन दर्द कम करने के लिए पैरासिटामोल (जैसे डोलो 650 या क्रोसिन) ली जाती है। सही खुराक के लिए डॉक्टर या फार्मासिस्ट से सलाह लें।',
      recovery_days: '3 से 5 दिन सही आराम और पानी पीने से।',
      diet_advice: 'हल्का और गर्म खाना: खिचड़ी, वेज सूप, दलिया, नारियल पानी, ओआरएस (ORS) और गुनगुना पानी।',
      foods_to_avoid: 'तला-भुना खाना, ज्यादा मसालेदार सब्जियां, आइसक्रीम, ठंडी कोल्ड ड्रिंक्स और जंक फूड।',
      natural_recovery: 'गुनगुने पानी की पट्टियां माथे पर रखें, तुलसी-अदरक का काढ़ा पिएं और पूरा आराम करें।',
      home_remedies: 'नमक के गुनगुने पानी से गरारे करें, 101°F से ऊपर बुखार होने पर माथे पर गुनगुनी पट्टी रखें।',
      rest_days: '2 से 3 दिन पूरा बेड रेस्ट करें; भारी काम से बचें।',
      red_flags: '103°F से ज्यादा तेज बुखार, सांस लेने में तकलीफ, लगातार उल्टी होना या 4 दिन से ज्यादा बुखार रहना।',
    },
    hinglish: {
      condition: 'Viral Bukhar (Viral Fever)',
      cause: 'Viral infection ki wajah se immune system activate hota hai aur body temperature badh jata hai.',
      medication_guidance: 'Bukhar aur badan dard ke liye Paracetamol (jaise Dolo 650 ya Crocin) istemal hoti hai. Sahi dosage ke liye doctor ya pharmacist se confirm karein.',
      recovery_days: '3 se 5 din sahi rest aur paani peene se.',
      diet_advice: 'Halka aur garam khana: khichdi, veg soup, daliya, nariyal paani, ORS ghol aur gunguna paani.',
      foods_to_avoid: 'Tala-bhuna khana, masaledar cheezein, ice cream, thandi cold drinks aur junk food.',
      natural_recovery: 'Gungune paani ki patti mathe par rakhein, tulsi-adrak ka kadha pio aur poora bed rest karein.',
      home_remedies: 'Gungune namak ke paani se garare karein aur bukhar 101°F se zyada ho toh mathe par patti rakhein.',
      rest_days: '2 se 3 din poora bed rest karein.',
      red_flags: '103°F se zyada bukhar, saans lene me takleef, continuous vomiting ya 4 din se zyada bukhar rehna.',
    },
  },
  'Common Cold': {
    english: {
      condition: 'Common Cold',
      cause: 'Viral infection (primarily rhinovirus) affecting the upper respiratory mucosal lining, causing nasal congestion, rhinorrhea, and mild pharyngitis.',
      medication_guidance: 'OTC antihistamines (such as Cetirizine 10mg) for sneezing and runny nose, saline nasal spray, and mild analgesics for sinus discomfort.',
      recovery_days: '4 to 7 days.',
      diet_advice: 'Warm herbal infusions (tulsi, ginger, honey), clear chicken or vegetable broth, warm water, citrus fruits with natural Vitamin C.',
      foods_to_avoid: 'Cold beverages, excessive chilled dairy, deep-fried snacks, and highly sugary items.',
      natural_recovery: 'Steam inhalation twice daily with carom seeds (ajwain), saline nasal rinses, honey with crushed black pepper.',
      home_remedies: 'Steam inhalation with a towel over head, warm saline gargling, honey-ginger paste for throat soothing.',
      rest_days: '1 to 2 days of relaxed physical schedule and restful sleep.',
      red_flags: 'High fever (>102°F), severe earache, shortness of breath, or symptoms worsening beyond 7 days.',
    },
    hindi: {
      condition: 'सामान्य जुकाम / सर्दी (Common Cold)',
      cause: 'राइनोवायरस संक्रमण के कारण ऊपरी श्वास नली में सूजन और नाक बहने की समस्या होती है।',
      medication_guidance: 'छींक और बहती नाक के लिए सिट्रीज़ीन (Cetirizine), नेज़ल सेलाइन ड्रॉप्स और सिरदर्द में पैरासिटामोल ली जा सकती है।',
      recovery_days: '4 से 7 दिन।',
      diet_advice: 'गर्म हर्बल चाय (तुलसी, अदरक, शहद), गर्म सूप, गुनगुना पानी और विटामिन सी से भरपूर फल।',
      foods_to_avoid: 'ठंडा पानी, रात में दही, तली हुई चीजें और ज्यादा मीठा खाना।',
      natural_recovery: 'दिन में 2 बार अजवाइन या विक्स डाल कर भाप लें, अदरक-शहद का सेवन करें।',
      home_remedies: 'गर्म भाप (steam) लें, गुनगुने नमक के पानी से गरारे करें और अदरक-काली मिर्च शहद में मिलाकर खाएं।',
      rest_days: '1 से 2 दिन हल्का आराम और 8 घंटे की नींद लें।',
      red_flags: 'तेज बुखार, कान में असहनीय दर्द, सांस फूलना या 7 दिन से ज्यादा जुकाम न जाना।',
    },
    hinglish: {
      condition: 'Sardi / Jukam (Common Cold)',
      cause: 'Rhinovirus infection ki wajah se upper respiratory tract me sujan aur naak behne ki problem hoti hai.',
      medication_guidance: 'Chheenkein aur runny nose ke liye Cetirizine, nasal saline spray aur sir dard ke liye Paracetamol le sakte hain.',
      recovery_days: '4 se 7 din.',
      diet_advice: 'Garam herbal chai (tulsi, adrak, honey), garam soup, gunguna paani aur Vitamin C wale fruits.',
      foods_to_avoid: 'Thanda paani, raat me dahi, fried snacks aur chilled cold drinks.',
      natural_recovery: 'Din me 2 baar steam lein, adrak-shahad ka paste khayein aur garam kapde pehnein.',
      home_remedies: 'Steam inhalation, namak ke paani se gargle aur adrak-kali mirch honey ke sath.',
      rest_days: '1 se 2 din relaxed schedule aur achhi neend.',
      red_flags: 'Tez bukhar (>102°F), kaan me tez dard, saans lene me dikat ya 7 din se zyada takleef.',
    },
  },
  'Flu (Influenza)': {
    english: {
      condition: 'Flu (Influenza)',
      cause: 'Influenza virus infection (Type A or B) causing acute onset high fever, intense myalgia, fatigue, dry cough, and chills.',
      medication_guidance: 'Antipyretics (Paracetamol) for fever and myalgia. Severe or high-risk cases may require prescription antivirals (e.g. Oseltamivir).',
      recovery_days: '5 to 8 days; fatigue may linger for up to 2 weeks.',
      diet_advice: 'Hot broths, electrolytes (ORS, coconut water), mashed potatoes, boiled eggs, soft rice, and plenty of fluids.',
      foods_to_avoid: 'Greasy foods, raw uncooked salads, caffeine, cold drinks, and processed sweets.',
      natural_recovery: 'Rigorous bed rest, warm sponge baths, room humidification, and continuous hydration.',
      home_remedies: 'Turmeric-ginger warm milk, steam inhalation, and throat lozenges.',
      rest_days: '3 to 5 days strict bed rest away from other family members.',
      red_flags: 'Difficulty breathing, chest tightness, bluish lips, confusion, or unable to keep fluids down.',
    },
    hindi: {
      condition: 'इन्फ्लुएंजा / फ्लू (Flu)',
      cause: 'इन्फ्लुएंजा वायरस संक्रमण से अचानक तेज बुखार, अत्यधिक थकान, जोड़ों व मांसपेशियों में दर्द और सूखी खांसी होती है।',
      medication_guidance: 'बुखार और मांसपेशियों के दर्द के लिए पैरासिटामोल लें। गंभीर स्थिति में डॉक्टर की सलाह से एंटीवायरल दवा ली जाती है।',
      recovery_days: '5 से 8 दिन।',
      diet_advice: 'गर्म सूप, ओआरएस घोल, नारियल पानी, खिचड़ी, उबला अंडा और खूब सारा पानी।',
      foods_to_avoid: 'तला हुआ खाना, कोल्ड ड्रिंक, ज्यादा कैफीन और बाहर का जंक फूड।',
      natural_recovery: 'कमरे में आराम, हल्दी वाला गर्म दूध, भाप लेना और पूरी तरह आराम करना।',
      home_remedies: 'गुनगुने पानी से भाप लें, हल्दी-अदरक का काढ़ा पिएं और शरीर को गर्म रखें।',
      rest_days: '3 से 5 दिन सख्त बेड रेस्ट करें।',
      red_flags: 'सांस लेने में भारीपन, सीने में जकड़न, होंठ नीले पड़ना या अत्यधिक चक्कर आना।',
    },
    hinglish: {
      condition: 'Flu / Influenza',
      cause: 'Influenza virus ki wajah se achanak tez bukhar, body pain, severe weakness aur dry cough hota hai.',
      medication_guidance: 'Fever aur myalgia ke liye Paracetamol lein. Jyada problem ho toh doctor se consult karein.',
      recovery_days: '5 se 8 din.',
      diet_advice: 'Garam soup, ORS ghol, nariyal paani, khichdi aur continuous fluids.',
      foods_to_avoid: 'Tali hui cheezein, cold drinks, heavy spices aur junk food.',
      natural_recovery: 'Complete bed rest, steam inhalation aur haldi wala gunguna doodh.',
      home_remedies: 'Steam lein, haldi-adrak kadha aur poora aaram.',
      rest_days: '3 se 5 din strict bed rest karein.',
      red_flags: 'Saans phoolna, chest pain, continuously ulti aana ya extreme chakkar aana.',
    },
  },
  'Migraine': {
    english: {
      condition: 'Migraine',
      cause: 'Neurovascular hyper-reactivity and cortical spreading depression triggered by stress, sleep disruptions, hormonal shifts, bright screens, or dehydration.',
      medication_guidance: 'OTC analgesics (Ibuprofen / Naproxen or Paracetamol + caffeine) taken at immediate aura onset. Chronic migraines require prescription triptans.',
      recovery_days: '4 to 24 hours per episode.',
      diet_advice: 'Electrolyte hydration, magnesium-rich foods (spinach, almonds, pumpkin seeds), ginger tea, and regular unskipped meals.',
      foods_to_avoid: 'Aged cheeses, excessive caffeine, artificial sweeteners, monosodium glutamate (MSG), processed meats, and alcohol.',
      natural_recovery: 'Resting in a pitch-dark, quiet room with a cold ice pack on forehead or temples; gentle acupressure.',
      home_remedies: 'Cold gel compress over eyes/forehead, sipping warm peppermint or ginger tea, deep diaphragm breathing.',
      rest_days: '1 day of reduced light exposure and screen-free rest.',
      red_flags: 'Sudden "thunderclap" headache (worst headache of life), fever with neck stiffness, speech difficulty, or visual loss.',
    },
    hindi: {
      condition: 'माइग्रेन (Migraine)',
      cause: 'तनाव, नींद की गड़बड़ी, तेज रोशनी, स्क्रीन चमक या डिहाइड्रेशन से मस्तिष्क की नसों में अत्यधिक संवेदनशीलता और तेज एकतरफा सिरदर्द।',
      medication_guidance: 'दर्द शुरू होते ही पैरासिटामोल या आइबुप्रोफेन ली जा सकती है। बार-बार माइग्रेन होने पर न्यूरोलॉजिस्ट से मिलें।',
      recovery_days: '4 से 24 घंटे।',
      diet_advice: 'खूब पानी, अदरक की चाय, बादाम, पालक और समय पर भोजन करना।',
      foods_to_avoid: 'अधिक चाय/कॉफी, भूखे रहना, तेज रोशनी और प्रोसेस्ड पैकेट वाला खाना।',
      natural_recovery: 'अंधेरे और शांत कमरे में लेटें, माथे पर ठंडी पट्टी या आइस पैक रखें।',
      home_remedies: 'माथे पर ठंडा सेंक, पुदीने के तेल से हल्की मालिश और शांत वातावरण में गहरी सांस लें।',
      rest_days: '1 दिन शांत माहौल में आराम और स्क्रीन से दूरी।',
      red_flags: 'अचानक बहुत तेज सिरदर्द (बिजली जैसा), गर्दन में अकड़न, बोलने में लड़खड़ाहट या देखने में धुंधलापन।',
    },
    hinglish: {
      condition: 'Migraine',
      cause: 'Stress, screen glare, neend ki kami ya dehydration ki wajah se neurovascular headache trigger hota hai.',
      medication_guidance: 'Dard shuru hote hi Paracetamol ya Ibuprofen li ja sakti hai. Doctor ki salah behtar hai.',
      recovery_days: '4 se 24 ghante.',
      diet_advice: 'Paani, adrak chai, badam, palak aur time par meal khayein.',
      foods_to_avoid: 'Zyada coffee, empty stomach rehna, bright screen aur processed snacks.',
      natural_recovery: 'Andhere aur shant kamre me aaram, mathe par cold compress lagayein.',
      home_remedies: 'Cold gel pack on forehead, dark room rest aur deep breathing.',
      rest_days: '1 din ka screen-free quiet rest.',
      red_flags: 'Achanak bahut tez thunderclap sir dard, gardan akadna, speech l लड़खड़ाना ya sunnpan.',
    },
  },
  'Gastritis / Acid Reflux': {
    english: {
      condition: 'Gastritis / Acid Reflux (GERD)',
      cause: 'Irritation or inflammation of the gastric mucosal lining and retrograde acid flow into esophagus, triggered by spicy/fried foods, NSAIDs, irregular meals, or stress.',
      medication_guidance: 'Antacids (Digene, Gelusil) for rapid symptomatic relief, or H2 blockers / PPIs (Famotidine, Pantoprazole) taken 30 minutes before breakfast as prescribed.',
      recovery_days: '2 to 4 days with dietary correction.',
      diet_advice: 'Alkaline bland diet: oatmeal, ripe bananas, fresh curd/yogurt, tender coconut water, boiled rice, daliya, and cold skim milk.',
      foods_to_avoid: 'Chili powder, deep-fried snacks, citrus fruits, raw tomatoes, carbonated beverages, coffee on empty stomach, and late-night heavy dinners.',
      natural_recovery: 'Drink fennel (saunf) and cumin (jeera) steeped lukewarm water; elevate head of bed by 6 inches while sleeping.',
      home_remedies: 'Chew 1 teaspoon fennel seeds post meals, drink fresh coconut water, avoid lying down for 2 hours after food.',
      rest_days: '1 day of light activity; refrain from strenuous abdominal workouts.',
      red_flags: 'Severe persistent abdominal cramps, vomiting blood or coffee-ground material, tarry black stools, or severe difficulty swallowing.',
    },
    hindi: {
      condition: 'गैस्ट्राइटिस / एसिडिटी (Gastritis)',
      cause: 'मसालेदार, तला-भुना खाना, खाली पेट चाय या तनाव के कारण पेट की अंदरूनी परत में जलन और एसिड बनना।',
      medication_guidance: 'तुरंत राहत के लिए एंटासिड (डाइजीन / जेलुसिल) या डॉक्टर की सलाह से पैंटोप्राज़ोल 40mg खाली पेट ली जाती है।',
      recovery_days: '2 से 4 दिन सादे खान-पान से।',
      diet_advice: 'सादा खाना: दलिया, केला, ठंडा दूध, दही, नारियल पानी, सादा उबला चावल और मूंग दाल।',
      foods_to_avoid: 'तीखा मिर्च-मसाला, समोसे-पकोड़े, खाली पेट चाय-कॉफी, टमाटर, नींबू पानी और देर रात का भारी खाना।',
      natural_recovery: 'सौंफ और जीरे का पानी पिएं, खाने के तुरंत बाद न लेटें, और थोड़ा-थोड़ा खाना खाएं।',
      home_remedies: 'खाने के बाद सौंफ चबाएं, नारियल पानी पिएं और सोते समय सिर थोड़ा ऊंचा रखें।',
      rest_days: '1 दिन हल्का आराम करें।',
      red_flags: 'पेट में बहुत तेज असहनीय दर्द, खून की उल्टी, काला मल आना या लगातार उल्टी होना।',
    },
    hinglish: {
      condition: 'Gastritis / Acidity / Acid Reflux',
      cause: 'Spicy/fried khana, irregular meals, khali pet chai ya stress ki wajah se stomach me acid badh jata hai.',
      medication_guidance: 'Quick relief ke liye Digene/Gelusil antacid syrup ya doctor ki salah se Pantoprazole khali pet.',
      recovery_days: '2 se 4 din bland diet ke saath.',
      diet_advice: 'Oatmeal, kela, thanda doodh, dahi, nariyal paani, sada chawal aur daliya.',
      foods_to_avoid: 'Tez mirch-masala, pakode, khali pet chai/coffee aur late night heavy khana.',
      natural_recovery: 'Saunf-jeera ka paani pio, khane ke turant baad mat letein.',
      home_remedies: 'Khane ke baad saunf chabayein, coconut water piyein aur small meals lein.',
      rest_days: '1 din light activity.',
      red_flags: 'Pet me unbearable dard, khoon ki ulti, black stool ya persistent vomiting.',
    },
  },
  'Food Poisoning / Gastroenteritis': {
    english: {
      condition: 'Food Poisoning / Acute Gastroenteritis',
      cause: 'Bacterial toxins (e.g. Staphylococcus, Salmonella) or enteric viral infection ingested via contaminated street food or untreated water, causing mucosal enteritis.',
      medication_guidance: 'Oral Rehydration Salts (ORS) are essential. Zinc supplements and probiotics (e.g., Saccharomyces boulardii). Avoid antimotility drugs unless directed by doctor.',
      recovery_days: '2 to 4 days.',
      diet_advice: 'BRAT diet (Bananas, Rice, Applesauce, Toast), clear vegetable broth, diluted coconut water, and frequent small sips of ORS solution.',
      foods_to_avoid: 'Dairy products, milk, oily gravies, raw salads, fruit juices with pulp, caffeine, and spicy curries.',
      natural_recovery: 'Sip electrolyte fluids every 15 minutes; do not gulp large volumes at once.',
      home_remedies: 'WHO-formula ORS solution, pomegranate juice, boiled curd rice, ginger infusion.',
      rest_days: '2 to 3 days bed rest with easy bathroom access.',
      red_flags: 'High fever (>102°F), signs of severe dehydration (dry mouth, no urine in 8 hours, sunken eyes), or blood in stool.',
    },
    hindi: {
      condition: 'फूड पॉइजनिंग / दस्त (Gastroenteritis)',
      cause: 'दूषित भोजन या पानी से पेट में बैक्टीरिया या वायरस का संक्रमण, जिससे उल्टी, दस्त और पेट में मरोड़ होती है।',
      medication_guidance: 'ओआरएस (ORS) घोल सबसे जरूरी है। प्रोबायोटिक्स (Probiotics) और जिंक सिरप/टैबलेट डॉक्टर की सलाह से लें।',
      recovery_days: '2 से 4 दिन।',
      diet_advice: 'केला, सादा चावल, दाल का पानी, नारियल पानी, टोस्ट और ओआरएस घोल थोड़ा-थोड़ा पिएं।',
      foods_to_avoid: 'दूध और पनीर, तला हुआ खाना, कच्चा सलाद, तीखा मसाला और बाजार का खाना।',
      natural_recovery: 'हर 15-20 मिनट में ओआरएस का घूंट पिएं ताकि शरीर में पानी की कमी न हो।',
      home_remedies: 'ओआरएस घोल, उबला जीरे का पानी, दही-चावल और अनार का रस।',
      rest_days: '2 से 3 दिन घर पर आराम करें।',
      red_flags: '8 घंटे तक पेशाब न आना, अत्यधिक कमजोरी, मल में खून या लगातार उल्टी के कारण पानी भी न पच पाना।',
    },
    hinglish: {
      condition: 'Food Poisoning / Gastroenteritis (Loose Motion & Vomiting)',
      cause: 'Contaminated food ya paani ki wajah se stomach aur intestine me bacterial/viral infection ho gaya hai.',
      medication_guidance: 'ORS (Electral) sabse critical hai. Probiotics le sakte hain. Bina doctor antibitoics na lein.',
      recovery_days: '2 se 4 din.',
      diet_advice: 'Khichdi, dahi chawal, kela, nariyal paani, dal ka paani aur frequent ORS sips.',
      foods_to_avoid: 'Doodh, ghee, fried snacks, raw salads aur spicy gravies.',
      natural_recovery: 'Har 15 minute me thoda thoda ORS piyein taaki dehydration na ho.',
      home_remedies: 'WHO formulation ORS, boiled water with cumin, curd rice.',
      rest_days: '2 se 3 din rest karein.',
      red_flags: 'Urine pass na hona (8+ hours), extreme chakkar, blood in stool ya dehydration.',
    },
  },
  'Acute Bronchitis': {
    english: {
      condition: 'Acute Bronchitis',
      cause: 'Inflammation of the bronchial tubes following a viral upper respiratory infection, causing persistent cough with sputum, chest discomfort, and fatigue.',
      medication_guidance: 'OTC cough expectorants (Guaifenesin) for productive cough, paracetamol for chest wall soreness, and steam inhalation. Antibiotics are rarely needed as 90% are viral.',
      recovery_days: '7 to 14 days (cough may linger up to 3 weeks).',
      diet_advice: 'Warm broths, turmeric-infused warm water, honey with lemon, ginger tea, and plenty of fluids to loosen airway secretions.',
      foods_to_avoid: 'Cold beverages, ice creams, dusty environments, smoke, and air-conditioned cold drafts.',
      natural_recovery: 'Steam inhalation twice daily, honey with crushed ginger, warm humidified air.',
      home_remedies: 'Steam inhalation with eucalyptus drops, warm honey-ginger tea, staying well-hydrated.',
      rest_days: '3 to 5 days of restful recovery; avoid cardio workouts.',
      red_flags: 'Coughing up frank blood (hemoptysis), high fever lasting >4 days, severe breathlessness at rest, or wheezing.',
    },
    hindi: {
      condition: 'ब्रोंकाइटिस / श्वासनली की सूजन (Bronchitis)',
      cause: 'वायरल इन्फेक्शन के बाद फेफड़ों की श्वासनली में सूजन से बलगम वाली खांसी और सीने में जकड़न।',
      medication_guidance: 'बलगम निकालने वाला कफ सिरप (Guaifenesin), सीने के दर्द में पैरासिटामोल और भाप लें।',
      recovery_days: '7 से 14 दिन।',
      diet_advice: 'गर्म सूप, हल्दी-अदरक का गर्म पानी, शहद-नींबू की चाय और खूब सारा गुनगुना पानी।',
      foods_to_avoid: 'ठंडी चीजें, सिगरेट का धुआं, धूल-मिट्टी और एसी की सीधी ठंडी हवा।',
      natural_recovery: 'दिन में 2 बार भाप लें, अदरक-शहद खाएं और सीने पर गर्म सेंक लें।',
      home_remedies: 'अजवाइन डालकर भाप लें, शहद में अदरक मिलाकर चाटें और गर्म तरल पदार्थ पिएं।',
      rest_days: '3 से 5 दिन आराम करें और भारी कसरत से बचें।',
      red_flags: 'खांसी में खून आना, तेज सांस फूलना, सीने में तेज दर्द या 2 हफ्ते से ज्यादा खांसी रहना।',
    },
    hinglish: {
      condition: 'Acute Bronchitis (Chest Cold / Balgam wali Khasi)',
      cause: 'Viral infection ke baad respiratory tubes me sujan se balgam wali khasi aur chest tightness hoti hai.',
      medication_guidance: 'Expectorant cough syrup, steam inhalation aur Paracetamol for chest muscle pain.',
      recovery_days: '7 se 14 din.',
      diet_advice: 'Garam soup, haldi-adrak warm water, honey-lemon tea aur gunguna paani.',
      foods_to_avoid: 'Thandi cheezein, smoking/smoke exposure, AC ki direct thandi hawa.',
      natural_recovery: 'Steam lein twice daily, honey-adrak paste aur plenty of liquids.',
      home_remedies: 'Steam with ajwain/eucalyptus, honey with ginger, warm fluids.',
      rest_days: '3 se 5 din proper rest karein.',
      red_flags: 'Khasi me khoon aana, saans lene me heavy problem ya continuous high fever.',
    },
  },
  'Allergic Rhinitis': {
    english: {
      condition: 'Allergic Rhinitis / Dust Allergy',
      cause: 'IgE-mediated inflammatory response of the nasal mucosa to airborne allergens such as house dust mites, pollen, pet dander, or seasonal weather shifts.',
      medication_guidance: 'Second-generation non-sedating antihistamines (Cetirizine 10mg, Fexofenadine 120mg), and fluticasone nasal spray under medical guidance.',
      recovery_days: 'Symptom relief within 2 to 4 hours of antihistamine; condition is seasonal/episodic.',
      diet_advice: 'Warm anti-inflammatory teas (tulsi, green tea, ginger), Vitamin C rich foods (oranges, amla, bell peppers), warm water.',
      foods_to_avoid: 'Histamine-rich foods (fermented foods, aged cheese), iced drinks that trigger airway hypersensitivity.',
      natural_recovery: 'Saline nasal irrigation (Neti pot / saline spray) to rinse allergen particles, keeping indoor windows closed during high pollen.',
      home_remedies: 'Saline nasal wash, warm water steam, washing face and eyes immediately after outdoor exposure.',
      rest_days: 'No bed rest required; avoid known allergen triggers.',
      red_flags: 'Facial swelling, wheezing / asthma flare-up, or difficulty breathing.',
    },
    hindi: {
      condition: 'एलर्जी राइनाइटिस / धूल से एलर्जी (Allergic Rhinitis)',
      cause: 'धूल-मिट्टी, परागकण (pollen) या मौसम बदलने पर नाक की झिल्ली में एलर्जी के कारण लगातार छींकें और पानी बहना।',
      medication_guidance: 'सिट्रीज़ीन (Cetirizine 10mg) या फेक्सोफेनाडाइन (Fexofenadine) और सेलाइन नेज़ल स्प्रे।',
      recovery_days: 'दवाई लेने पर कुछ ही घंटों में राहत।',
      diet_advice: 'तुलसी-अदरक की गर्म चाय, आंवला, संतरा, गुनगुना पानी और हल्का गर्म भोजन।',
      foods_to_avoid: 'ठंडा पानी, आइसक्रीम, धूल भरे वातावरण में बिना मास्क जाना।',
      natural_recovery: 'बाहर से आने पर मुंह-आंखें धोएं, सेलाइन नेज़ल ड्रॉप्स से नाक साफ रखें।',
      home_remedies: 'भाप लें, गुनगुने नमक के पानी से नाक धोएं और घर में धूल साफ रखें।',
      rest_days: 'बेड रेस्ट जरूरी नहीं है, एलर्जी वाली चीजों से बचें।',
      red_flags: 'सांस में सीटी की आवाज (wheezing), चेहरे या होंठों पर सूजन, या सांस फूलना।',
    },
    hinglish: {
      condition: 'Allergic Rhinitis (Dust & Weather Allergy)',
      cause: 'Dust, pollen ya weather change se naak me allergy hoti hai jisse continuous chheenkein aur runny nose aati hai.',
      medication_guidance: 'Cetirizine 10mg ya Fexofenadine 120mg tablet aur saline nasal spray.',
      recovery_days: 'Antihistamine lene par 2-4 hours me relief mil jata hai.',
      diet_advice: 'Tulsi-ginger tea, Amla, warm water aur Vitamin C foods.',
      foods_to_avoid: 'Chilled drinks, dusty rooms aur damp moisture.',
      natural_recovery: 'Face wash karein outdoor se aate hi, saline drops use karein.',
      home_remedies: 'Steam inhalation, saline nasal rinse, mask pehnein bahar jate waqt.',
      rest_days: 'Normal routine continue karein, dust se door rahein.',
      red_flags: 'Saans phoolna, chest wheezing ya face par sujan.',
    },
  },
  'Skin Rash / Contact Dermatitis': {
    english: {
      condition: 'Skin Rash / Contact Dermatitis',
      cause: 'Skin hypersensitivity reaction triggered by contact with allergens/irritants (soaps, cosmetics, synthetic fabrics, heat, or insect exposure).',
      medication_guidance: 'Calamine lotion or 1% hydrocortisone cream applied topically. Oral Cetirizine 10mg for itching.',
      recovery_days: '3 to 7 days.',
      diet_advice: 'Hydrating water, cucumber, coconut water, fresh fruits, and cooling antioxidant foods.',
      foods_to_avoid: 'Excessive spicy foods, artificial food colorings, and potential food allergens (shellfish, nuts).',
      natural_recovery: 'Cold compresses, wearing loose breathable cotton clothing, avoiding hot showers and perfumed soaps.',
      home_remedies: 'Apply cool calamine lotion, cold aloe vera gel, avoid scratching to prevent secondary bacterial infection.',
      rest_days: 'Normal activity; keep affected skin clean and dry.',
      red_flags: 'Rapidly spreading rash, blisters with yellow pus, fever with rash, or facial/lip swelling.',
    },
    hindi: {
      condition: 'त्वचा पर चकत्ते / एलर्जी (Skin Rash)',
      cause: 'साबुन, पसीना, सिंथेटिक कपड़े या किसी कीड़े/एलर्जी के संपर्क में आने से त्वचा पर लाल चकत्ते और खुजली।',
      medication_guidance: 'खुजली कम करने के लिए कैलामाइन लोशन लगाएं और सिट्रीज़ीन (Cetirizine) टैबलेट लें।',
      recovery_days: '3 से 7 दिन।',
      diet_advice: 'खूब पानी, खीरा, नारियल पानी और ताजे फल।',
      foods_to_avoid: 'ज्यादा तीखा-मसालेदार खाना, गर्म चीजें और जंक फूड।',
      natural_recovery: 'ढीले सूती (cotton) कपड़े पहनें, गर्म पानी की जगह सामान्य पानी से नहाएं और खुजली न करें।',
      home_remedies: 'एलोवेरा जेल लगाएं, ठंडे पानी की पट्टी रखें और त्वचा को सूखा व साफ रखें।',
      rest_days: 'सामान्य दिनचर्या रखें; धूप और पसीने से बचें।',
      red_flags: 'चकत्तों में मवाद (pus) पड़ना, बुखार के साथ दाने निकलना, या चेहरे-गले पर सूजन।',
    },
    hinglish: {
      condition: 'Skin Rash / Allergy (Dane aur Khujli)',
      cause: 'Soap, sweat, synthetic clothes ya allergen contact se skin par red spots aur itching hoti hai.',
      medication_guidance: 'Calamine lotion lagayein aur itching kam karne ke liye Cetirizine 10mg lein.',
      recovery_days: '3 se 7 din.',
      diet_advice: 'Nariyal paani, kheera, fresh fruits aur plenty of drinking water.',
      foods_to_avoid: 'Zyada spicy khana aur excessive oily items.',
      natural_recovery: 'Loose cotton kapde pehnein, scratch na karein taaki infection na ho.',
      home_remedies: 'Calamine lotion, aloe vera gel aur cold compress.',
      rest_days: 'Normal routine, dhoop aur pasine se bachein.',
      red_flags: 'Pus/chhale banna, bukhar ke saath rash ya face/lips me sujan.',
    },
  },
  'Tension Headache': {
    english: {
      condition: 'Tension-Type Headache',
      cause: 'Muscle contractions in the head and neck triggered by prolonged screen time, mental stress, poor posture, neck strain, or lack of sleep.',
      medication_guidance: 'OTC analgesics like Paracetamol 650mg or Ibuprofen 400mg with a meal. Rest and stress reduction are first-line.',
      recovery_days: 'A few hours to 1 day with rest and hydration.',
      diet_advice: 'Ample water hydration, peppermint tea, chamomile tea, light meals with balanced proteins and carbs.',
      foods_to_avoid: 'Excessive coffee/energy drinks, skipping meals, and alcoholic drinks.',
      natural_recovery: 'Gentle neck and shoulder stretching, taking 10-minute screen breaks every hour, warm shower.',
      home_remedies: 'Warm compress on back of neck, gentle temple massage with balm, 20-minute power nap in quiet area.',
      rest_days: 'Early bedtime and 8 hours restful sleep.',
      red_flags: 'Severe sudden headache, vision changes, weakness in limbs, or headache with high fever.',
    },
    hindi: {
      condition: 'तनाव सिरदर्द (Tension Headache)',
      cause: 'लगातार स्क्रीन देखने, गर्दन की मांसपेशियों में तनाव, मानसिक चिंता या नींद पूरी न होने से दोनों तरफ भारी सिरदर्द।',
      medication_guidance: 'हल्के दर्द में पैरासिटामोल (650mg) ली जा सकती है। आराम और स्ट्रेस कम करना सबसे असरदार है।',
      recovery_days: 'कुछ घंटे से 1 दिन।',
      diet_advice: 'खूब पानी पिएं, हर्बल चाय, हल्का भोजन और समय पर खाना।',
      foods_to_avoid: 'ज्यादा चाय-कॉफी, देर रात तक जागना और खाना छोड़ना।',
      natural_recovery: 'गर्दन और कंधों की हल्की स्ट्रेचिंग करें, मोबाइल-कंप्यूटर से ब्रेक लें।',
      home_remedies: 'गर्दन के पीछे गर्म सेंक, माथे की हल्की मालिश और 20 मिनट शांत नींद लें।',
      rest_days: 'जल्दी सोएं और पूरी 8 घंटे की नींद लें।',
      red_flags: 'अचानक असहनीय सिरदर्द, हाथ-पैरों में कमजोरी या तेज बुखार के साथ सिरदर्द।',
    },
    hinglish: {
      condition: 'Tension Headache (Screen & Stress Sar Dard)',
      cause: 'Continuous screen time, stress, neck strain ya neend ki kami ki wajah se dono side heavy sir dard hota hai.',
      medication_guidance: 'Paracetamol 650mg meal ke baad le sakte hain. Rest lena sabse best medicine hai.',
      recovery_days: 'Kuch ghante se 1 din.',
      diet_advice: 'Paani, herbal tea, time par lunch/dinner aur adequate hydration.',
      foods_to_avoid: 'Zyada coffee/energy drinks, fasting aur late night phone use.',
      natural_recovery: 'Neck stretching karein, har ghante 5 minute screen se door rahein.',
      home_remedies: 'Gardan par warm compress, temple massage aur restful nap.',
      rest_days: 'Time par soyein aur 8 ghante sleep complete karein.',
      red_flags: 'Achanak tez dard, haath-paon me sunnpan ya bukhar ke sath sar dard.',
    },
  },
};

// ---------------------------------------------------------------------------
// Clinical Classification Engine
// ---------------------------------------------------------------------------
const SYMPTOM_FEATURE_WEIGHTS = {
  'Viral Fever': {
    fever: 4,
    high_fever: 3,
    body_pain: 3,
    chills: 3,
    fatigue: 2,
    headache: 2,
    weakness: 2,
  },
  'Common Cold': {
    cough: 4,
    runny_nose: 4,
    sore_throat: 4,
    throat_irritation: 3,
    sneezing: 3,
    fever: 1,
    headache: 1,
  },
  'Flu (Influenza)': {
    high_fever: 5,
    fever: 4,
    body_pain: 4,
    chills: 4,
    cough: 3,
    fatigue: 4,
    weakness: 3,
    headache: 3,
  },
  'Migraine': {
    headache: 5,
    dizziness: 3,
    nausea: 3,
    vomiting: 2,
    light_sensitivity: 4,
  },
  'Gastritis / Acid Reflux': {
    acidity: 5,
    stomach_pain: 4,
    abdominal_pain: 4,
    nausea: 3,
    vomiting: 2,
    indigestion: 4,
  },
  'Food Poisoning / Gastroenteritis': {
    diarrhoea: 5,
    vomiting: 4,
    stomach_pain: 4,
    nausea: 3,
    fever: 2,
    weakness: 3,
  },
  'Acute Bronchitis': {
    cough: 5,
    breathlessness: 3,
    chest_tightness: 4,
    fatigue: 2,
    fever: 2,
  },
  'Allergic Rhinitis': {
    runny_nose: 5,
    sneezing: 4,
    throat_irritation: 3,
    red_eyes: 4,
    cough: 2,
  },
  'Skin Rash / Contact Dermatitis': {
    skin_rash: 5,
    itching: 4,
    redness: 3,
  },
  'Tension Headache': {
    headache: 4,
    neck_pain: 3,
    fatigue: 3,
    dizziness: 2,
  },
};

const SYMPTOM_SYNONYM_MAP = {
  'fever': 'fever',
  'high fever': 'high_fever',
  'bukhar': 'fever',
  'tez bukhar': 'high_fever',
  'headache': 'headache',
  'sar dard': 'headache',
  'cough': 'cough',
  'khasi': 'cough',
  'sore throat': 'sore_throat',
  'kharash': 'sore_throat',
  'stomach pain': 'stomach_pain',
  'pet dard': 'stomach_pain',
  'vomiting': 'vomiting',
  'ulti': 'vomiting',
  'loose motion': 'diarrhoea',
  'diarrhea': 'diarrhoea',
  'acidity': 'acidity',
  'gas': 'acidity',
  'body ache': 'body_pain',
  'body pain': 'body_pain',
  'badan dard': 'body_pain',
  'weakness': 'weakness',
  'fatigue': 'fatigue',
  'kamzori': 'weakness',
  'dizziness': 'dizziness',
  'chakkar': 'dizziness',
  'chills': 'chills',
  'thand lagna': 'chills',
  'runny nose': 'runny_nose',
  'cold': 'runny_nose',
  'sardi': 'runny_nose',
  'skin rash': 'skin_rash',
  'rash': 'skin_rash',
  'dane': 'skin_rash',
  'red eyes': 'red_eyes',
  'sneezing': 'sneezing',
  'chheenkein': 'sneezing',
};

export function predictTop3(symptoms = [], notes = '', trajectory = '', duration = '') {
  const normalizedUserSymptoms = new Set();
  const textBlob = `${symptoms.join(' ')} ${notes} ${trajectory} ${duration}`.toLowerCase();

  // Normalize user symptoms from array and text
  for (const s of symptoms) {
    const raw = String(s).toLowerCase().trim();
    if (SYMPTOM_SYNONYM_MAP[raw]) {
      normalizedUserSymptoms.add(SYMPTOM_SYNONYM_MAP[raw]);
    } else {
      normalizedUserSymptoms.add(raw.replace(/\s+/g, '_'));
    }
  }

  // Scan text for symptom keywords
  for (const [key, normalized] of Object.entries(SYMPTOM_SYNONYM_MAP)) {
    if (textBlob.includes(key)) {
      normalizedUserSymptoms.add(normalized);
    }
  }

  const scores = [];
  for (const [condition, weights] of Object.entries(SYMPTOM_FEATURE_WEIGHTS)) {
    let score = 0.15; // baseline prior
    let maxWeight = 0;

    for (const [feat, weight] of Object.entries(weights)) {
      maxWeight += weight;
      if (normalizedUserSymptoms.has(feat) || textBlob.includes(feat.replace(/_/g, ' '))) {
        score += weight * 0.22;
      }
    }

    // Specific context bonuses
    if (condition === 'Food Poisoning / Gastroenteritis' && (textBlob.includes('food') || textBlob.includes('outside') || textBlob.includes('restaurant'))) {
      score += 0.35;
    }
    if (condition === 'Migraine' && (textBlob.includes('light') || textBlob.includes('one side') || textBlob.includes('throbbing'))) {
      score += 0.35;
    }
    if (condition === 'Allergic Rhinitis' && (textBlob.includes('dust') || textBlob.includes('pollen') || textBlob.includes('morning'))) {
      score += 0.35;
    }
    if (condition === 'Skin Rash / Contact Dermatitis' && (textBlob.includes('itching') || textBlob.includes('rash') || textBlob.includes('red'))) {
      score += 0.40;
    }
    if (condition === 'Flu (Influenza)' && normalizedUserSymptoms.has('high_fever') && normalizedUserSymptoms.has('body_pain')) {
      score += 0.30;
    }

    scores.push({ condition, rawScore: score });
  }

  scores.sort((a, b) => b.rawScore - a.rawScore);

  // Normalize confidence probabilities
  const topSlice = scores.slice(0, 3);
  const total = topSlice.reduce((acc, curr) => acc + curr.rawScore, 0) || 1;
  const top3 = topSlice.map((item, index) => {
    let conf = item.rawScore / total;
    if (index === 0) conf = Math.max(0.68, Math.min(0.95, conf + 0.15));
    if (index === 1) conf = Math.max(0.18, Math.min(0.35, conf));
    if (index === 2) conf = Math.max(0.05, Math.min(0.20, conf));
    return {
      condition: item.condition,
      confidence: Math.round(conf * 100) / 100,
    };
  });

  return { top3, topConf: top3[0].confidence };
}

export function getConditionKnowledge(condition, lang = 'english') {
  const entry = KNOWLEDGE_BASE[condition] || KNOWLEDGE_BASE['Viral Fever'];
  const normalized = ['hindi', 'hi'].includes(lang) ? 'hindi' : ['hinglish'].includes(lang) ? 'hinglish' : 'english';
  return entry[normalized] || entry.english;
}

export function getAllLanguageKnowledge(condition) {
  return KNOWLEDGE_BASE[condition] || KNOWLEDGE_BASE['Viral Fever'];
}
