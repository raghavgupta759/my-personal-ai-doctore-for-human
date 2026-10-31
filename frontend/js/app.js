// -------------------------------------------------------------
// PERSONAL AI DOCTOR — FRONTEND CONTROLLER & 3D ENGINE
// -------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    
    // Application State
    let currentPage = "landing"; // 'landing', 'intake', 'results'
    let currentStep = 1;
    let activeConversationId = localStorage.getItem("ai_doctor_cid") || null;
    let activeDiagnosisData = null;
    let intakeDraft = JSON.parse(localStorage.getItem("ai_doctor_intake_draft") || "{}");
    
    let isSpeaking = false;
    let synth = window.speechSynthesis;
    let recognition = null;
    let isRecording = false;

    let voiceMode = localStorage.getItem("ai_doctor_voice_mode") || "text-only"; // 'text-only' | 'text-voice'
    let currentLanguage = localStorage.getItem("ai_doctor_lang") || "english"; // 'english' | 'hindi' | 'hinglish'

    function setLanguage(lang) {
        if (!["english", "hindi", "hinglish"].includes(lang)) lang = "english";
        currentLanguage = lang;
        localStorage.setItem("ai_doctor_lang", lang);

        // Update active class on all language selectors across Header, Drawer, and Results
        document.querySelectorAll(".lang-pill, .lang-pill-sm, .result-lang-btn").forEach(btn => {
            const targetLang = btn.getAttribute("data-lang") || btn.dataset.lang;
            if (targetLang === lang) {
                btn.classList.add("active");
            } else {
                btn.classList.remove("active");
            }
        });

        // Update chat input placeholder
        const drawerUserInput = document.getElementById("drawerUserInput");
        if (drawerUserInput) {
            if (lang === "hindi") {
                drawerUserInput.placeholder = "AI डॉक्टर से कुछ भी पूछें (उदा. बुखार में क्या खाएं?)...";
            } else if (lang === "hinglish") {
                drawerUserInput.placeholder = "Ask AI anything (e.g. Fever me kya khayein?)...";
            } else {
                drawerUserInput.placeholder = "Ask AI anything (e.g. What should I eat for fever?)...";
            }
        }

        // Update suggested chat prompt chips
        const chatSuggestionsRow = document.getElementById("chatSuggestionsRow");
        if (chatSuggestionsRow) {
            if (lang === "hindi") {
                chatSuggestionsRow.innerHTML = `
                    <button type="button" class="chat-suggest-chip" data-prompt="मेरी स्थिति सरल भाषा में समझाएं">स्थिति समझाएं</button>
                    <button type="button" class="chat-suggest-chip" data-prompt="मुझे किन लक्षणों पर ध्यान देना चाहिए?">क्या मॉनिटर करें?</button>
                    <button type="button" class="chat-suggest-chip" data-prompt="मुझे तुरंत डॉक्टर के पास कब जाना चाहिए?">डॉक्टर कब दिखाएं?</button>
                    <button type="button" class="chat-suggest-chip" data-prompt="मुझे क्या खाना चाहिए और क्या नहीं?">डाइट सलाह</button>
                `;
            } else if (lang === "hinglish") {
                chatSuggestionsRow.innerHTML = `
                    <button type="button" class="chat-suggest-chip" data-prompt="Mera assessment simple bhasha me samjhao">Assessment samjhao</button>
                    <button type="button" class="chat-suggest-chip" data-prompt="Konse symptoms monitor karne chahiye?">Kya monitor karein?</button>
                    <button type="button" class="chat-suggest-chip" data-prompt="Doctor ke paas kab jana chahiye?">Doctor kab dikhayein?</button>
                    <button type="button" class="chat-suggest-chip" data-prompt="Kya khayein aur kya avoid karein?">Diet advice</button>
                `;
            } else {
                chatSuggestionsRow.innerHTML = `
                    <button type="button" class="chat-suggest-chip" data-prompt="Explain my assessment in simple language">Explain assessment</button>
                    <button type="button" class="chat-suggest-chip" data-prompt="What symptoms should I monitor?">What to monitor?</button>
                    <button type="button" class="chat-suggest-chip" data-prompt="When should I see a doctor immediately?">When to see doctor?</button>
                    <button type="button" class="chat-suggest-chip" data-prompt="What foods should I eat and avoid?">Diet advice</button>
                `;
            }
        }

        // Re-render active results page if currently visible
        if (activeDiagnosisData && currentPage === "results") {
            renderResultsPage(activeDiagnosisData, getFormIntakeData());
        }
    }

    // Initialize active language state on load
    setLanguage(currentLanguage);

    // Event listener for language buttons & suggested prompt chips across the app
    document.addEventListener("click", (e) => {
        const langBtn = e.target.closest("[data-lang]");
        if (langBtn) {
            const lang = langBtn.getAttribute("data-lang") || langBtn.dataset.lang;
            if (lang) setLanguage(lang);
        }

        const suggestChip = e.target.closest(".chat-suggest-chip");
        if (suggestChip) {
            const prompt = suggestChip.getAttribute("data-prompt");
            const drawerUserInput = document.getElementById("drawerUserInput");
            if (prompt && drawerUserInput) {
                drawerUserInput.value = prompt;
                sendSideChatMessage(prompt);
                drawerUserInput.value = "";
            }
        }
    });

    // -------------------------------------------------------------
    // 0. PREMIUM AI DOCTOR INTRODUCTION & WELCOME CONTROLLER
    // -------------------------------------------------------------
    function initSplashScreen() {
        const splashOverlay    = document.getElementById("appSplashScreen");
        const splashSkipBtn    = document.getElementById("splashSkipBtn");
        const tapToSpeakBtn    = document.getElementById("tapToSpeakBtn");
        const soundwaveRow     = document.getElementById("soundwaveVisualizer");
        const progressText     = document.getElementById("splashProgressText");
        const loadingPercent   = document.getElementById("loadingPercent");
        const loadingLabel     = document.getElementById("loadingLabel");
        const arcProgress      = document.getElementById("arcProgress");
        const arcRingSvg       = document.querySelector(".arc-ring-svg");

        if (!splashOverlay) return;

        // Inject SVG gradient defs for the arc
        if (arcRingSvg) {
            const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            defs.innerHTML = `
                <linearGradient id="arcGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stop-color="#38BDF8"/>
                    <stop offset="100%" stop-color="#2DD4BF"/>
                </linearGradient>`;
            arcRingSvg.prepend(defs);
        }

        let isDismissed = false;
        let speechUtterance = null;
        let timers = [];
        const CIRCUMFERENCE = 2 * Math.PI * 120; // r=120 → ≈754

        // ── Arc progress animation ──────────────────────────────────
        let currentPct = 0;
        let arcInterval = null;

        function startArcProgress(targetPct, durationMs) {
            if (!arcProgress) return;
            const step = (targetPct - currentPct) / (durationMs / 50);
            arcInterval = setInterval(() => {
                if (isDismissed) { clearInterval(arcInterval); return; }
                currentPct = Math.min(currentPct + step, targetPct);
                const offset = CIRCUMFERENCE * (1 - currentPct / 100);
                arcProgress.style.strokeDashoffset = offset;
                if (loadingPercent) loadingPercent.textContent = Math.round(currentPct) + "%";
                if (currentPct >= targetPct) clearInterval(arcInterval);
            }, 50);
        }

        function dismissSplash() {
            if (isDismissed) return;
            isDismissed = true;
            timers.forEach(t => clearTimeout(t));
            clearInterval(arcInterval);
            if (window.speechSynthesis) window.speechSynthesis.cancel();
            if (soundwaveRow) soundwaveRow.classList.remove("active");
            // Finish arc to 100%
            if (arcProgress) arcProgress.style.strokeDashoffset = "0";
            if (loadingPercent) loadingPercent.textContent = "100%";
            if (loadingLabel) loadingLabel.textContent = "Ready!";
            if (progressText) progressText.textContent = "✓ Starting...";
            splashOverlay.classList.add("fade-out");
            timers.push(setTimeout(() => { splashOverlay.style.display = "none"; }, 800));
        }

        if (splashSkipBtn) splashSkipBtn.addEventListener("click", dismissSplash);

        // ── Speech synthesis ────────────────────────────────────────
        const fullGreeting = "Hello! Welcome to my Personal AI Doctor. Let's check how you're feeling today.";

        function speakGreeting() {
            if (!("speechSynthesis" in window)) { fallbackTimeline(); return; }
            window.speechSynthesis.cancel();
            speechUtterance = new SpeechSynthesisUtterance(fullGreeting);
            speechUtterance.rate = 0.93;
            speechUtterance.pitch = 1.0;
            const voices = window.speechSynthesis.getVoices();
            const pick = voices.find(v => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Male") || v.name.includes("David") || v.name.includes("Alex")));
            if (pick) speechUtterance.voice = pick;

            speechUtterance.onstart = () => {
                if (soundwaveRow) soundwaveRow.classList.add("active");
                if (progressText) progressText.textContent = "AI Doctor is speaking...";
                startArcProgress(90, 5500); // animate to 90% while speaking
            };
            speechUtterance.onend = () => {
                if (soundwaveRow) soundwaveRow.classList.remove("active");
                if (progressText) progressText.textContent = "✓ Ready to help you.";
                timers.push(setTimeout(dismissSplash, 900));
            };
            speechUtterance.onerror = () => {
                if (soundwaveRow) soundwaveRow.classList.remove("active");
                if (tapToSpeakBtn) tapToSpeakBtn.classList.remove("hidden");
                fallbackTimeline();
            };
            try {
                window.speechSynthesis.speak(speechUtterance);
                if (voices.length === 0) {
                    window.speechSynthesis.onvoiceschanged = () => {
                        const vv = window.speechSynthesis.getVoices();
                        const p = vv.find(v => v.lang.startsWith("en") && (v.name.includes("Natural") || v.name.includes("Google")));
                        if (p && speechUtterance) speechUtterance.voice = p;
                    };
                }
            } catch (e) {
                if (tapToSpeakBtn) tapToSpeakBtn.classList.remove("hidden");
                fallbackTimeline();
            }
        }

        function fallbackTimeline() {
            startArcProgress(85, 4000);
            if (progressText) progressText.textContent = "AI Doctor is speaking...";
            if (soundwaveRow) soundwaveRow.classList.add("active");
            timers.push(setTimeout(() => {
                if (soundwaveRow) soundwaveRow.classList.remove("active");
                if (progressText) progressText.textContent = "✓ Ready to help you.";
                timers.push(setTimeout(dismissSplash, 1200));
            }, 4200));
        }

        if (tapToSpeakBtn) {
            tapToSpeakBtn.addEventListener("click", () => {
                tapToSpeakBtn.classList.add("hidden");
                speakGreeting();
            });
        }

        // Boot sequence — small initial delay then speak + arc start
        timers.push(setTimeout(() => {
            if (progressText) progressText.textContent = "AI Doctor is speaking...";
            speakGreeting();
        }, 500));
    }


    initSplashScreen();

    // DOM Elements — Navigation & Pages
    const pageLanding = document.getElementById("pageLanding");
    const pageIntake = document.getElementById("pageIntake");
    const pageResults = document.getElementById("pageResults");
    const navHealthCheckBtn = document.getElementById("navHealthCheckBtn");
    const startCheckCtaBtn = document.getElementById("startCheckCtaBtn");
    const heroOpenChatBtn = document.getElementById("heroOpenChatBtn");
    const navLogoBtn = document.getElementById("navLogoBtn");
    const themeToggleBtn = document.getElementById("themeToggleBtn");
    const themeIcon = document.getElementById("themeIcon");

    if (heroOpenChatBtn) {
        heroOpenChatBtn.addEventListener("click", toggleChatDrawer);
    }

    // DOM Elements — Sidebar & Profile
    const sidebarDrawer = document.getElementById("sidebarDrawer");
    const openSidebarBtn = document.getElementById("openSidebarBtn");
    const closeSidebarBtn = document.getElementById("closeSidebarBtn");
    const profileForm = document.getElementById("profileForm");
    const profileName = document.getElementById("profileName");
    const profileAge = document.getElementById("profileAge");
    const profileGender = document.getElementById("profileGender");
    const profileLocation = document.getElementById("profileLocation");
    const profileAllergies = document.getElementById("profileAllergies");
    const profileChronic = document.getElementById("profileChronic");
    const historyList = document.getElementById("historyList");

    // DOM Elements — Multi-step Form
    const multiStepForm = document.getElementById("multiStepForm");
    const progressBarFill = document.getElementById("progressBarFill");
    const stepBadgeText = document.getElementById("stepBadgeText");
    const stepTitleText = document.getElementById("stepTitleText");
    const stepDots = Array.from(document.querySelectorAll(".step-dot"));
    const formSteps = Array.from(document.querySelectorAll(".form-step-content"));
    const prevStepBtn = document.getElementById("prevStepBtn");
    const nextStepBtn = document.getElementById("nextStepBtn");
    const submitAssessmentBtn = document.getElementById("submitAssessmentBtn");

    // Form Field Elements
    const stepName = document.getElementById("stepName");
    const stepAge = document.getElementById("stepAge");
    const stepGender = document.getElementById("stepGender");
    const stepLocation = document.getElementById("stepLocation");
    const symptomChipsGrid = document.getElementById("symptomChipsGrid");
    const customSymptomInput = document.getElementById("customSymptomInput");
    const addCustomSymptomBtn = document.getElementById("addCustomSymptomBtn");
    const stepDuration = document.getElementById("stepDuration");
    const stepTrajectory = document.getElementById("stepTrajectory");
    const stepRecentFood = document.getElementById("stepRecentFood");
    const stepCurrentMedications = document.getElementById("stepCurrentMedications");
    const stepAllergies = document.getElementById("stepAllergies");
    const severitySlider = document.getElementById("severitySlider");
    const severityScoreBadge = document.getElementById("severityScoreBadge");
    const stepNotes = document.getElementById("stepNotes");
    const reviewSummaryCard = document.getElementById("reviewSummaryCard");

    // DOM Elements — Results & Modals
    const resultsContainer = document.getElementById("resultsContainer");
    const loadingOverlay = document.getElementById("loadingOverlay");

    // Past Consultation Summary Modal
    const consultationModal = document.getElementById("consultationModal");
    const consultationModalBody = document.getElementById("consultationModalBody");
    const closeConsultationModalBtn = document.getElementById("closeConsultationModalBtn");

    // DOM Elements — Floating AI Drawer
    const floatingChatBtn = document.getElementById("floatingChatBtn");
    const sideChatDrawer = document.getElementById("sideChatDrawer");
    const closeChatDrawerBtn = document.getElementById("closeChatDrawerBtn");
    const drawerBackdrop = document.getElementById("drawerBackdrop");
    const chatContextSubtext = document.getElementById("chatContextSubtext");
    const drawerChatMessages = document.getElementById("drawerChatMessages");
    const drawerChatForm = document.getElementById("drawerChatForm");
    const drawerUserInput = document.getElementById("drawerUserInput");
    const micBtn = document.getElementById("micBtn");

    // Voice Toggle Controls
    const voiceToggleBtn = document.getElementById("voiceToggleBtn");
    const voiceToggleIcon = document.getElementById("voiceToggleIcon");
    const voiceToggleText = document.getElementById("voiceToggleText");
    const ttsToggle = document.getElementById("ttsToggle");
    const stopSpeechBtn = document.getElementById("stopSpeechBtn");
    const audioVisualizer = document.getElementById("audioVisualizer");

    // Step Titles Mapping
    const STEP_TITLES = {
        1: "Basic Information",
        2: "Current Symptoms & Duration",
        3: "Food, Activity & Medical History",
        4: "Severity & Discomfort Rating",
        5: "Review & Confirm Intake"
    };

    // -------------------------------------------------------------
    // 1. PAGE NAVIGATION CONTROLLER
    // -------------------------------------------------------------
    function showPage(targetPage) {
        currentPage = targetPage;
        
        [pageLanding, pageIntake, pageResults].forEach(p => {
            if (p) p.classList.remove("active");
        });

        if (targetPage === "landing" && pageLanding) pageLanding.classList.add("active");
        if (targetPage === "intake" && pageIntake) pageIntake.classList.add("active");
        if (targetPage === "results" && pageResults) pageResults.classList.add("active");

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (startCheckCtaBtn) startCheckCtaBtn.addEventListener("click", () => showPage("intake"));
    if (navHealthCheckBtn) navHealthCheckBtn.addEventListener("click", () => showPage("intake"));
    if (navLogoBtn) navLogoBtn.addEventListener("click", () => showPage("landing"));

    // -------------------------------------------------------------
    // 2. THEME SWITCHER
    // -------------------------------------------------------------
    function initTheme() {
        const savedTheme = localStorage.getItem("ai_doctor_theme") || "light";
        if (savedTheme === "dark") {
            document.body.classList.add("dark-theme");
            document.body.classList.remove("light-theme");
            if (themeIcon) themeIcon.setAttribute("data-lucide", "sun");
        } else {
            document.body.classList.add("light-theme");
            document.body.classList.remove("dark-theme");
            if (themeIcon) themeIcon.setAttribute("data-lucide", "moon");
        }
        if (typeof lucide !== "undefined") lucide.createIcons();
    }

    themeToggleBtn.addEventListener("click", () => {
        if (document.body.classList.contains("dark-theme")) {
            document.body.classList.remove("dark-theme");
            document.body.classList.add("light-theme");
            localStorage.setItem("ai_doctor_theme", "light");
            if (themeIcon) themeIcon.setAttribute("data-lucide", "moon");
        } else {
            document.body.classList.remove("light-theme");
            document.body.classList.add("dark-theme");
            localStorage.setItem("ai_doctor_theme", "dark");
            if (themeIcon) themeIcon.setAttribute("data-lucide", "sun");
        }
        if (typeof lucide !== "undefined") lucide.createIcons();
    });

    initTheme();

    // -------------------------------------------------------------
    // 3. MULTI-STEP FORM CONTROLLER & DRAFT PERSISTENCE
    // -------------------------------------------------------------
    function updateStepUI() {
        // Update Step badge & Title
        if (stepBadgeText) stepBadgeText.textContent = `Step ${currentStep} of 5`;
        if (stepTitleText) stepTitleText.textContent = STEP_TITLES[currentStep] || "";

        // Progress bar fill %
        const progressPct = (currentStep / 5) * 100;
        if (progressBarFill) progressBarFill.style.width = `${progressPct}%`;

        // Update step dots
        stepDots.forEach(dot => {
            const dotStep = parseInt(dot.dataset.step);
            dot.classList.toggle("active", dotStep <= currentStep);
        });

        // Show active step content
        formSteps.forEach(stepContent => {
            const contentStep = parseInt(stepContent.dataset.step);
            stepContent.classList.toggle("active", contentStep === currentStep);
        });

        // Button visibility
        if (prevStepBtn) prevStepBtn.classList.toggle("hidden", currentStep === 1);
        if (nextStepBtn) nextStepBtn.classList.toggle("hidden", currentStep === 5);
        if (submitAssessmentBtn) submitAssessmentBtn.classList.toggle("hidden", currentStep !== 5);

        if (currentStep === 5) {
            renderReviewSummary();
        }

        saveIntakeDraft();
    }

    function validateStep(stepNum) {
        if (stepNum === 1) {
            if (!stepName.value.trim()) { alert("Please enter your name!"); stepName.focus(); return false; }
            if (!stepAge.value || stepAge.value < 1) { alert("Please enter a valid age!"); stepAge.focus(); return false; }
            return true;
        }
        if (stepNum === 2) {
            const activeChips = getSelectedSymptoms();
            if (activeChips.length === 0) {
                alert("Please select at least 1 symptom chip or type a custom symptom!");
                return false;
            }
            return true;
        }
        return true;
    }

    if (nextStepBtn) {
        nextStepBtn.addEventListener("click", () => {
            if (validateStep(currentStep)) {
                currentStep = Math.min(5, currentStep + 1);
                updateStepUI();
            }
        });
    }

    if (prevStepBtn) {
        prevStepBtn.addEventListener("click", () => {
            currentStep = Math.max(1, currentStep - 1);
            updateStepUI();
        });
    }

    // Step dots direct navigation
    stepDots.forEach(dot => {
        dot.addEventListener("click", () => {
            const targetStep = parseInt(dot.dataset.step);
            if (targetStep < currentStep || validateStep(currentStep)) {
                currentStep = targetStep;
                updateStepUI();
            }
        });
    });

    // Voice Mode Toggle (Text-Only vs Text+Voice)
    function initVoiceToggle() {
        if (!voiceToggleBtn) return;
        if (voiceMode === "text-voice") {
            voiceToggleBtn.className = "voice-toggle-btn text-voice";
            if (voiceToggleIcon) voiceToggleIcon.setAttribute("data-lucide", "volume-2");
            if (voiceToggleText) voiceToggleText.textContent = "Text + Voice";
        } else {
            voiceToggleBtn.className = "voice-toggle-btn text-only";
            if (voiceToggleIcon) voiceToggleIcon.setAttribute("data-lucide", "volume-x");
            if (voiceToggleText) voiceToggleText.textContent = "Text Only";
        }
        if (typeof lucide !== "undefined") lucide.createIcons();
    }

    if (voiceToggleBtn) {
        voiceToggleBtn.addEventListener("click", () => {
            voiceMode = voiceMode === "text-only" ? "text-voice" : "text-only";
            localStorage.setItem("ai_doctor_voice_mode", voiceMode);
            initVoiceToggle();
        });
    }

    initVoiceToggle();

    // Symptom Chips Selection
    symptomChipsGrid.addEventListener("click", (e) => {
        const chip = e.target.closest(".symptom-chip");
        if (chip) {
            chip.classList.toggle("active");
            saveIntakeDraft();
        }
    });

    function getSelectedSymptoms() {
        return Array.from(symptomChipsGrid.querySelectorAll(".symptom-chip.active")).map(c => c.dataset.symptom);
    }

    function addCustomSymptom() {
        const val = customSymptomInput.value.trim();
        if (!val) return;

        const existing = Array.from(symptomChipsGrid.querySelectorAll(".symptom-chip")).find(c => c.dataset.symptom.toLowerCase() === val.toLowerCase());
        if (existing) {
            existing.classList.add("active");
        } else {
            const newChip = document.createElement("button");
            newChip.type = "button";
            newChip.className = "symptom-chip active";
            newChip.dataset.symptom = val;
            newChip.innerHTML = `🩺 ${escapeHtml(val)}`;
            symptomChipsGrid.appendChild(newChip);
        }
        customSymptomInput.value = "";
        saveIntakeDraft();
    }

    if (addCustomSymptomBtn) addCustomSymptomBtn.addEventListener("click", addCustomSymptom);
    if (customSymptomInput) {
        customSymptomInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                addCustomSymptom();
            }
        });
    }

    // Quick text chips for context food/activity
    document.querySelectorAll(".quick-text-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const targetId = chip.dataset.target;
            const val = chip.dataset.val;
            const targetInput = document.getElementById(targetId);
            if (targetInput) {
                targetInput.value = targetInput.value ? `${targetInput.value}, ${val}` : val;
                saveIntakeDraft();
            }
        });
    });

    // Pain Severity Slider Live Badge Update
    if (severitySlider) {
        severitySlider.addEventListener("input", (e) => {
            const val = parseInt(e.target.value);
            let label = "Mild";
            let cls = "score-mild";
            if (val >= 4 && val <= 7) { label = "Moderate"; cls = "score-moderate"; }
            if (val >= 8) { label = "Severe"; cls = "score-severe"; }

            if (severityScoreBadge) {
                severityScoreBadge.textContent = `${val} / 10 (${label})`;
                severityScoreBadge.className = `severity-badge ${cls}`;
            }
            saveIntakeDraft();
        });
    }

    // Save & Load Draft to LocalStorage
    function getFormIntakeData() {
        const chronicSelected = Array.from(document.querySelectorAll("input[name='chronicCondition']:checked")).map(c => c.value);
        return {
            name: stepName.value.trim() || "Guest",
            age: parseInt(stepAge.value) || 25,
            gender: stepGender.value || "Male",
            location: stepLocation.value.trim() || "Not specified",
            symptoms: getSelectedSymptoms(),
            duration: stepDuration.value,
            trajectory: stepTrajectory ? stepTrajectory.value : "Unchanged",
            recent_food_activity: stepRecentFood.value.trim() || "None",
            current_medications: stepCurrentMedications ? stepCurrentMedications.value.trim() || "None" : "None",
            allergies: stepAllergies.value.trim() || "None",
            chronic_conditions: chronicSelected.length ? chronicSelected.join(", ") : "None",
            severity_score: parseInt(severitySlider.value) || 5,
            notes: stepNotes.value.trim() || ""
        };
    }

    function saveIntakeDraft() {
        const data = getFormIntakeData();
        localStorage.setItem("ai_doctor_intake_draft", JSON.stringify(data));
    }

    function loadIntakeDraft() {
        const draft = JSON.parse(localStorage.getItem("ai_doctor_intake_draft") || "{}");
        if (draft.name && stepName) stepName.value = draft.name;
        if (draft.age && stepAge) stepAge.value = draft.age;
        if (draft.gender && stepGender) stepGender.value = draft.gender;
        if (draft.location && stepLocation) stepLocation.value = draft.location;
        if (draft.duration && stepDuration) stepDuration.value = draft.duration;
        if (draft.trajectory && stepTrajectory) stepTrajectory.value = draft.trajectory;
        if (draft.recent_food_activity && stepRecentFood) stepRecentFood.value = draft.recent_food_activity;
        if (draft.current_medications && stepCurrentMedications) stepCurrentMedications.value = draft.current_medications;
        if (draft.allergies && stepAllergies) stepAllergies.value = draft.allergies;
        if (draft.notes && stepNotes) stepNotes.value = draft.notes;
        if (draft.severity_score && severitySlider) {
            severitySlider.value = draft.severity_score;
            severitySlider.dispatchEvent(new Event("input"));
        }
        if (draft.symptoms && Array.isArray(draft.symptoms)) {
            draft.symptoms.forEach(sym => {
                const chip = Array.from(symptomChipsGrid.querySelectorAll(".symptom-chip")).find(c => c.dataset.symptom.toLowerCase() === sym.toLowerCase());
                if (chip) chip.classList.add("active");
            });
        }
    }

    loadIntakeDraft();

    // Step 5 Review Summary Renderer
    function renderReviewSummary() {
        const data = getFormIntakeData();
        if (!reviewSummaryCard) return;

        reviewSummaryCard.innerHTML = `
            <div class="summary-section-card">
                <div class="summary-header">
                    <h4>Step 1: Patient Profile</h4>
                    <button type="button" class="summary-edit-btn" onclick="jumpToStep(1)">✏️ Edit</button>
                </div>
                <div class="summary-body">
                    <p><strong>Name:</strong> ${escapeHtml(data.name)} (${data.age} yrs, ${data.gender})</p>
                    <p><strong>Location:</strong> ${escapeHtml(data.location)}</p>
                </div>
            </div>

            <div class="summary-section-card">
                <div class="summary-header">
                    <h4>Step 2: Symptoms &amp; Duration</h4>
                    <button type="button" class="summary-edit-btn" onclick="jumpToStep(2)">✏️ Edit</button>
                </div>
                <div class="summary-body">
                    <p><strong>Symptoms:</strong> ${data.symptoms.length ? data.symptoms.map(s => `<span class="symptom-chip active" style="font-size:0.75rem; padding:2px 8px;">${escapeHtml(s)}</span>`).join(" ") : "None selected"}</p>
                    <p><strong>Duration:</strong> ${escapeHtml(data.duration)} (${escapeHtml(data.trajectory)})</p>
                </div>
            </div>

            <div class="summary-section-card">
                <div class="summary-header">
                    <h4>Step 3: Context &amp; History</h4>
                    <button type="button" class="summary-edit-btn" onclick="jumpToStep(3)">✏️ Edit</button>
                </div>
                <div class="summary-body">
                    <p><strong>Recent Food / Activity:</strong> ${escapeHtml(data.recent_food_activity)}</p>
                    <p><strong>Current Medications:</strong> ${escapeHtml(data.current_medications)}</p>
                    <p><strong>Allergies:</strong> ${escapeHtml(data.allergies)}</p>
                    <p><strong>Conditions:</strong> ${escapeHtml(data.chronic_conditions)}</p>
                </div>
            </div>

            <div class="summary-section-card">
                <div class="summary-header">
                    <h4>Step 4: Severity &amp; Description</h4>
                    <button type="button" class="summary-edit-btn" onclick="jumpToStep(4)">✏️ Edit</button>
                </div>
                <div class="summary-body">
                    <p><strong>Discomfort Score:</strong> ${data.severity_score}/10</p>
                    <p><strong>Additional Notes:</strong> ${escapeHtml(data.notes || "None")}</p>
                </div>
            </div>
        `;
    }

    window.jumpToStep = function(stepNum) {
        currentStep = stepNum;
        updateStepUI();
    };

    // -------------------------------------------------------------
    // 4. SUBMIT ASSESSMENT & RENDER RESULTS PAGE
    // -------------------------------------------------------------
    multiStepForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const data = getFormIntakeData();
        if (!data.symptoms || data.symptoms.length === 0) {
            alert("Please select at least 1 symptom in Step 2!");
            currentStep = 2;
            updateStepUI();
            return;
        }

        const payload = {
            ...data,
            conversation_id: activeConversationId,
            language: currentLanguage
        };

        if (loadingOverlay) loadingOverlay.classList.remove("hidden");

        try {
            const res = await fetch("/api/assess", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (loadingOverlay) loadingOverlay.classList.add("hidden");

            if (res.ok) {
                const resultData = await res.json();
                activeConversationId = resultData.conversation_id;
                localStorage.setItem("ai_doctor_cid", activeConversationId);

                if (resultData.is_emergency) {
                    renderEmergencyPage(resultData.emergency_message, data);
                } else {
                    activeDiagnosisData = resultData;
                    renderResultsPage(resultData, data);
                    updateChatContextSubtext(resultData.condition);
                }
                loadHistory();
                showPage("results");
            } else {
                alert("Failed to analyze symptoms. Please check server.");
            }
        } catch (err) {
            if (loadingOverlay) loadingOverlay.classList.add("hidden");
            console.error("Assessment error:", err);
            showNotification("Connection error. Please ensure backend server is running.", "error");
        }
    });

    function renderEmergencyPage(msg, intake) {
        resultsContainer.innerHTML = `
            <div class="results-header-card" style="border-left: 6px solid var(--accent-danger);">
                <div>
                    <h2 style="color: var(--accent-danger);">🚨 EMERGENCY MEDICAL WARNING</h2>
                    <div class="patient-meta-badge">
                        <span>Patient: <strong>${escapeHtml(intake.name)}</strong> (${intake.age}y)</span>
                    </div>
                </div>
            </div>
            <div class="warning-red-flag-card" style="background: rgba(239,68,68,0.1); border: 2px solid var(--accent-danger); padding: 2rem;">
                <i data-lucide="alert-triangle" style="width:48px; height:48px; color:var(--accent-danger);"></i>
                <div>
                    ${renderFormattedContent(msg)}
                </div>
            </div>
        `;
        if (typeof lucide !== "undefined") lucide.createIcons();
    }

    function renderResultsPage(diag, intake) {
        const lang = currentLanguage || "english";
        const multiKnowledge = diag.multilingual_knowledge || {};
        const langKnowledge = multiKnowledge[lang] || {};

        const condition = langKnowledge.condition || diag.condition || "Viral Fever / Seasonal Flu";
        const confidenceNote = diag.ml_confidence ? `${(diag.ml_confidence * 100).toFixed(1)}% ML Confidence` : "High Probability Estimate";
        const top3 = diag.top3_predictions || diag.ml_top3 || [];
        const top3Badges = top3.map(p => `<span class="symptom-chip" style="font-size:0.75rem; padding:2px 8px;"><strong>${escapeHtml(p.condition)}</strong> (${(p.confidence * 100).toFixed(1)}%)</span>`).join(" ");

        const cause = langKnowledge.cause || diag.cause || "Immune reaction triggered by viral or environmental exposure.";
        const homeRemedies = langKnowledge.home_remedies || diag.home_remedies || "Warm saltwater gargling, adequate rest, staying hydrated with ORS.";
        const medication = langKnowledge.medication_guidance || diag.medication_guidance || "Paracetamol for fever relief. Consult doctor before taking.";
        const dietAdvice = langKnowledge.diet_advice || diag.diet_advice || "Warm khichdi, vegetable soup, ORS solution, banana.";
        const foodsToAvoid = langKnowledge.foods_to_avoid || diag.foods_to_avoid || "Spicy curries, oily fried foods, cold carbonated drinks, ice cream.";
        const restDays = langKnowledge.rest_days || diag.rest_days || "2 to 3 days bed rest.";
        const recoveryDays = langKnowledge.recovery_days || diag.recovery_days || "3 to 5 days expected recovery.";
        const redFlags = langKnowledge.red_flags || diag.red_flags || "Chest pain, fever >103°F, shortness of breath, continuous vomiting.";

        // Language specific headers
        let sectionTitles = {
            langTitle: "Assessment Language / रिपोर्ट भाषा:",
            headerTitle: "Clinical Health Assessment",
            downloadBtn: "Download Signed PDF Report",
            restartBtn: "New Assessment",
            card1Title: "1. Likely Condition",
            card2Title: "2. What It Means & Cause",
            card3Title: "3. Home Care & Self-Care Steps",
            card4Title: "4. OTC Medicine Guidance",
            card5Title: "5. Diet Plan (What to Eat / Avoid)",
            eatHeader: "Foods to Eat",
            avoidHeader: "Foods to Avoid",
            card6Title: "6. Rest & Recovery Timeline",
            card7Title: "7. Emergency Red Flags Warning",
            card8Title: "8. Have Follow-Up Questions?",
            askAiBtn: "Ask AI Doctor Assistant"
        };

        if (lang === "hindi") {
            sectionTitles = {
                langTitle: "रिपोर्ट भाषा (Assessment Language):",
                headerTitle: "नैदानिक स्वास्थ्य आकलन (Clinical Assessment)",
                downloadBtn: "हस्ताक्षरित PDF रिपोर्ट डाउनलोड करें",
                restartBtn: "नया आकलन शुरू करें",
                card1Title: "1. संभावित बीमारी / स्थिति",
                card2Title: "2. इसका क्या अर्थ और कारण है",
                card3Title: "3. घरेलू देखभाल और उपाय",
                card4Title: "4. OTC दवा सुझाव (सलाह)",
                card5Title: "5. आहार योजना (क्या खाएं / क्या न खाएं)",
                eatHeader: "क्या खाएं (Foods to Eat)",
                avoidHeader: "क्या परहेज करें (Foods to Avoid)",
                card6Title: "6. आराम की अवधि और रिकवरी समय",
                card7Title: "7. आपातकालीन गंभीर चेतावनी (Red Flags)",
                card8Title: "8. कोई सवाल पूछना चाहते हैं?",
                askAiBtn: "AI डॉक्टर से सवाल पूछें"
            };
        } else if (lang === "hinglish") {
            sectionTitles = {
                langTitle: "Assessment Language:",
                headerTitle: "Clinical Health Assessment",
                downloadBtn: "Download Signed PDF Report",
                restartBtn: "New Assessment",
                card1Title: "1. Likely Condition (Bimari)",
                card2Title: "2. What It Means (Iska matlab)",
                card3Title: "3. Home Care (Ghar pe Remedies)",
                card4Title: "4. OTC Medicines Guidance",
                card5Title: "5. Diet Guidance (Kya khayein / avoid karein)",
                eatHeader: "Kya Khayein (Foods to Eat)",
                avoidHeader: "Kya Avoid Karein (Foods to Avoid)",
                card6Title: "6. Rest Duration & Timeline",
                card7Title: "7. Emergency Warning (Red Flags)",
                card8Title: "8. Ask Follow-up Questions?",
                askAiBtn: "Ask AI Doctor Assistant"
            };
        }

        resultsContainer.innerHTML = `
            <!-- MULTILINGUAL LANGUAGE SWITCHER BAR -->
            <div class="result-lang-bar">
                <div class="result-lang-title">
                    <i data-lucide="globe"></i>
                    <span>${sectionTitles.langTitle}</span>
                </div>
                <div class="result-lang-options">
                    <button type="button" class="result-lang-btn ${lang === 'english' ? 'active' : ''}" data-lang="english">🇬🇧 English</button>
                    <button type="button" class="result-lang-btn ${lang === 'hindi' ? 'active' : ''}" data-lang="hindi">🇮🇳 हिंदी (Hindi)</button>
                    <button type="button" class="result-lang-btn ${lang === 'hinglish' ? 'active' : ''}" data-lang="hinglish">💬 Hinglish</button>
                </div>
            </div>

            <!-- RESULTS HEADER CARD -->
            <div class="results-header-card">
                <div>
                    <h2>${sectionTitles.headerTitle}</h2>
                    <div class="patient-meta-badge">
                        <span>Patient: <strong>${escapeHtml(intake.name)}</strong> (${intake.age}y, ${intake.gender})</span>
                        <span>•</span>
                        <span>Severity: <strong>${intake.severity_score}/10</strong></span>
                    </div>
                </div>
                <div class="results-header-actions">
                    <button id="downloadPdfBtn" class="btn btn-primary btn-sm shine-effect">
                        <i data-lucide="file-text"></i> ${sectionTitles.downloadBtn}
                    </button>
                    <button id="restartBtn" class="btn btn-outline btn-sm">
                        <i data-lucide="rotate-ccw"></i> ${sectionTitles.restartBtn}
                    </button>
                </div>
            </div>

            <!-- STRUCTURED 8-CARD BREAKDOWN -->
            <div class="results-grid-8col">
                
                <!-- CARD 1: POSSIBLE CONDITION(S) -->
                <div class="result-card">
                    <div class="card-title-row">
                        <i data-lucide="activity"></i>
                        <span>${sectionTitles.card1Title}</span>
                    </div>
                    <div class="result-card-body">
                        <p style="font-size:1.1rem; font-weight:700;">Likely: <span style="color:var(--accent-primary);">${escapeHtml(condition)}</span></p>
                        <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:8px;">*${confidenceNote} — general estimate, not a confirmed diagnosis.</p>
                        <div style="display:flex; flex-wrap:wrap; gap:4px;">${top3Badges}</div>
                    </div>
                </div>

                <!-- CARD 2: WHAT IT MEANS -->
                <div class="result-card">
                    <div class="card-title-row">
                        <i data-lucide="info"></i>
                        <span>${sectionTitles.card2Title}</span>
                    </div>
                    <div class="result-card-body">
                        <p>${escapeHtml(cause)}</p>
                    </div>
                </div>

                <!-- CARD 3: HOME CARE STEPS -->
                <div class="result-card">
                    <div class="card-title-row">
                        <i data-lucide="home"></i>
                        <span>${sectionTitles.card3Title}</span>
                    </div>
                    <div class="result-card-body">
                        <p>${escapeHtml(homeRemedies)}</p>
                    </div>
                </div>

                <!-- CARD 4: OTC MEDICINE SUGGESTIONS -->
                <div class="result-card">
                    <div class="card-title-row">
                        <i data-lucide="pill"></i>
                        <span>${sectionTitles.card4Title}</span>
                    </div>
                    <div class="result-card-body">
                        <p>${escapeHtml(medication)}</p>
                        <div class="otc-disclaimer">⚠️ Common over-the-counter options — consult a pharmacist/doctor before taking.</div>
                    </div>
                </div>

                <!-- CARD 5: DIET GUIDANCE (2-COLUMN LIST) -->
                <div class="result-card">
                    <div class="card-title-row">
                        <i data-lucide="utensils"></i>
                        <span>${sectionTitles.card5Title}</span>
                    </div>
                    <div class="result-card-body">
                        <div class="diet-two-col">
                            <div class="diet-col eat">
                                <h5><i data-lucide="check-circle"></i> ${sectionTitles.eatHeader}</h5>
                                <p>${escapeHtml(dietAdvice)}</p>
                            </div>
                            <div class="diet-col avoid">
                                <h5><i data-lucide="x-circle"></i> ${sectionTitles.avoidHeader}</h5>
                                <p>${escapeHtml(foodsToAvoid)}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- CARD 6: REST DURATION & TIMELINE -->
                <div class="result-card">
                    <div class="card-title-row">
                        <i data-lucide="moon"></i>
                        <span>${sectionTitles.card6Title}</span>
                    </div>
                    <div class="result-card-body">
                        <p><strong>Recommended Rest:</strong> ${escapeHtml(restDays)}</p>
                        <p><strong>Expected Recovery:</strong> ${escapeHtml(recoveryDays)}</p>
                    </div>
                </div>

                <!-- CARD 7: RED FLAGS WARNING CARD -->
                <div class="warning-red-flag-card">
                    <i data-lucide="alert-triangle"></i>
                    <div>
                        <h4>${sectionTitles.card7Title}</h4>
                        <p><strong>Warning Signs:</strong> ${escapeHtml(redFlags)}</p>
                    </div>
                </div>

                <!-- CARD 8: ASK AI MORE ABOUT THIS BUTTON -->
                <div class="result-card result-card-full" style="background: var(--bg-card-subtle); align-items: center; text-align: center;">
                    <div class="card-title-row" style="margin-bottom: 0.4rem;">
                        <i data-lucide="bot"></i>
                        <span>${sectionTitles.card8Title}</span>
                    </div>
                    <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom: 1rem;">Ask your Personal AI Doctor assistant for instant, context-aware answers about your medicines, diet, or symptoms.</p>
                    <button id="askAiMoreBtn" class="btn btn-primary btn-md shine-effect">
                        <i data-lucide="message-square"></i>
                        <span>${sectionTitles.askAiBtn}</span>
                    </button>
                </div>

            </div>
        `;

        if (typeof lucide !== "undefined") lucide.createIcons();

        document.getElementById("downloadPdfBtn").addEventListener("click", () => downloadPdfReport(activeConversationId));
        document.getElementById("restartBtn").addEventListener("click", () => {
            currentStep = 1;
            updateStepUI();
            showPage("intake");
        });
        document.getElementById("askAiMoreBtn").addEventListener("click", () => {
            openChatDrawer();
            if (lang === "hindi") {
                drawerUserInput.value = `${condition} के इलाज और डाइट प्लान के बारे में और बताएं।`;
            } else if (lang === "hinglish") {
                drawerUserInput.value = `${condition} ke treatment aur diet plan ke baare me aur batao.`;
            } else {
                drawerUserInput.value = `Tell me more about handling ${condition} and my diet plan.`;
            }
            drawerUserInput.focus();
        });
    }

    // -------------------------------------------------------------
    // 5. FLOATING AI ASSISTANT DRAWER & CHAT HANDLER
    // -------------------------------------------------------------
    function syncDrawerBackdrop() {
        if (!drawerBackdrop) return;
        const isChatOpen = sideChatDrawer && sideChatDrawer.classList.contains("open");
        const isSidebarOpen = sidebarDrawer && sidebarDrawer.classList.contains("open") && window.innerWidth <= 1024;
        if (isChatOpen || isSidebarOpen) {
            drawerBackdrop.classList.remove("hidden");
        } else {
            drawerBackdrop.classList.add("hidden");
        }
    }

    function openChatDrawer() {
        if (!sideChatDrawer) return;
        sideChatDrawer.classList.add("open");
        syncDrawerBackdrop();
        if (drawerUserInput) {
            setTimeout(() => drawerUserInput.focus(), 100);
        }
    }

    function closeChatDrawer() {
        if (!sideChatDrawer) return;
        sideChatDrawer.classList.remove("open");
        syncDrawerBackdrop();
    }

    function toggleChatDrawer() {
        if (!sideChatDrawer) return;
        if (sideChatDrawer.classList.contains("open")) {
            closeChatDrawer();
        } else {
            openChatDrawer();
        }
    }

    if (floatingChatBtn) floatingChatBtn.addEventListener("click", openChatDrawer);
    if (closeChatDrawerBtn) closeChatDrawerBtn.addEventListener("click", closeChatDrawer);
    if (drawerBackdrop) {
        drawerBackdrop.addEventListener("click", () => {
            closeChatDrawer();
            if (sidebarDrawer) sidebarDrawer.classList.remove("open");
            syncDrawerBackdrop();
        });
    }
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sideChatDrawer && sideChatDrawer.classList.contains("open")) {
            closeChatDrawer();
        }
    });

    function updateChatContextSubtext(condName) {
        if (condName) {
            chatContextSubtext.innerHTML = `🧠 Active Memory: <strong>${escapeHtml(condName)}</strong>`;
        } else {
            chatContextSubtext.innerHTML = `🧠 General AI Assistant`;
        }
    }

    function appendDrawerMessage(role, content) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
        
        const avatarIcon = role === "user" ? "user" : "bot";
        const speakerTag = role === "user" ? "You" : "AI Doctor";
        
        const isTyping = content === "...";
        const bodyContent = isTyping ? `
            <div class="typing-bubble">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        ` : renderFormattedContent(content);

        const copyAction = (role === "assistant" && !isTyping) ? `
            <div class="message-actions">
                <button type="button" class="copy-btn" onclick="copyMessageText(this)" title="Copy response">
                    <i data-lucide="copy"></i> Copy
                </button>
            </div>
        ` : "";

        msgDiv.innerHTML = `
            <div class="avatar"><i data-lucide="${avatarIcon}"></i></div>
            <div class="message-content">
                <div class="speaker-tag">${speakerTag}</div>
                <div class="msg-text">${bodyContent}</div>
                ${copyAction}
            </div>
        `;
        
        drawerChatMessages.appendChild(msgDiv);
        drawerChatMessages.scrollTop = drawerChatMessages.scrollHeight;
        if (typeof lucide !== "undefined") lucide.createIcons();
        return msgDiv;
    }

    window.copyMessageText = function(btn) {
        const textContainer = btn.closest(".message-content").querySelector(".msg-text");
        if (!textContainer) return;
        const text = textContainer.innerText || textContainer.textContent;
        navigator.clipboard.writeText(text).then(() => {
            showNotification("Copied response to clipboard!");
        }).catch(err => {
            console.error("Copy failed:", err);
        });
    };

    let isGenerating = false;

    drawerChatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        if (isGenerating) return;
        const text = drawerUserInput.value.trim();
        if (text) {
            sendSideChatMessage(text);
            drawerUserInput.value = "";
        }
    });

    async function sendSideChatMessage(text) {
        if (isGenerating) return;
        isGenerating = true;

        const drawerSendBtn = drawerChatForm.querySelector("button[type='submit']");
        if (drawerSendBtn) drawerSendBtn.disabled = true;
        if (drawerUserInput) drawerUserInput.disabled = true;

        appendDrawerMessage("user", text);

        // Placeholder assistant message with typing dots animation
        const assistantMsgDiv = appendDrawerMessage("assistant", "...");
        const textContainer = assistantMsgDiv.querySelector(".msg-text");

        const payload = {
            conversation_id: activeConversationId,
            message: text,
            active_diagnosis: activeDiagnosisData,
            intake_data: getFormIntakeData(),
            language: currentLanguage
        };

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                textContainer.innerHTML = "⚠️ Service temporarily unavailable. Please check your network or server connection.";
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let fullText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n\n");

                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        try {
                            const parsed = JSON.parse(line.slice(6));
                            if (parsed.conversation_id && !activeConversationId) {
                                activeConversationId = parsed.conversation_id;
                                localStorage.setItem("ai_doctor_cid", activeConversationId);
                            }
                            if (parsed.text) {
                                fullText += parsed.text;
                                textContainer.innerHTML = renderFormattedContent(fullText);
                                drawerChatMessages.scrollTop = drawerChatMessages.scrollHeight;
                            }
                        } catch (e) {
                            // Non-json chunk
                        }
                    }
                }
            }

            // Add copy button action after response generation completes
            const msgContent = assistantMsgDiv.querySelector(".message-content");
            if (msgContent && !msgContent.querySelector(".message-actions")) {
                const copyDiv = document.createElement("div");
                copyDiv.className = "message-actions";
                copyDiv.innerHTML = `<button type="button" class="copy-btn" onclick="copyMessageText(this)" title="Copy response"><i data-lucide="copy"></i> Copy</button>`;
                msgContent.appendChild(copyDiv);
                if (typeof lucide !== "undefined") lucide.createIcons();
            }

            // Speak if Voice Mode is set to 'text-voice'
            if (voiceMode === "text-voice" && fullText) {
                speakText(fullText);
            }
        } catch (err) {
            console.error("Side chat error:", err);
            textContainer.innerHTML = "⚠️ Network connection error. Unable to connect to server.";
        } finally {
            isGenerating = false;
            if (drawerSendBtn) drawerSendBtn.disabled = false;
            if (drawerUserInput) {
                drawerUserInput.disabled = false;
                drawerUserInput.focus();
            }
        }
    }

    // -------------------------------------------------------------
    // 6. HISTORY & PAST CONSULTATIONS SUMMARY MODAL
    // -------------------------------------------------------------
    if (closeConsultationModalBtn) {
        closeConsultationModalBtn.addEventListener("click", () => {
            if (consultationModal) consultationModal.classList.add("hidden");
        });
    }

    async function loadHistory() {
        try {
            const res = await fetch("/api/history");
            if (res.ok) {
                const data = await res.json();
                if (!data || data.length === 0) {
                    historyList.innerHTML = `<div class="empty-state">No previous consultations.</div>`;
                    return;
                }
                historyList.innerHTML = data.map(item => {
                    const dateStr = item.started_at ? new Date(item.started_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recent";
                    const cond = item.condition || "Health Assessment";
                    const confText = item.ml_confidence ? `${(item.ml_confidence * 100).toFixed(0)}% Match` : "Clinical Summary";
                    return `
                        <div class="history-summary-card" onclick="openConsultationSummary('${item.conversation_id}')">
                            <div class="history-card-header">
                                <span class="history-card-title">${escapeHtml(cond)}</span>
                                <span class="history-card-date">${dateStr}</span>
                            </div>
                            <div class="history-card-body">
                                <span>Condition Estimate • <strong>${confText}</strong></span>
                            </div>
                            <div class="history-expand-btn">
                                <i data-lucide="file-text" style="font-size:0.75rem;"></i> View Clinical Summary
                            </div>
                        </div>
                    `;
                }).join("");
                if (typeof lucide !== "undefined") lucide.createIcons();
            }
        } catch (err) {
            console.error("History fetch error:", err);
        }
    }

    window.openConsultationSummary = async function(cid) {
        try {
            const res = await fetch(`/api/diagnosis/${cid}`);
            if (res.ok) {
                const diag = await res.json();
                const dateStr = diag.created_at ? new Date(diag.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Recent";
                const top3 = diag.ml_top3_predictions || [];
                const top3Badges = top3.map(p => `<span class="symptom-chip" style="font-size:0.75rem; padding:2px 8px; margin-right:4px;"><strong>${escapeHtml(p.condition)}</strong> (${(p.confidence * 100).toFixed(0)}%)</span>`).join("");

                consultationModalBody.innerHTML = `
                    <div class="summary-section-card">
                        <div class="summary-header">
                            <h4>Consultation Record</h4>
                            <span style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</span>
                        </div>
                        <div class="summary-body">
                            <p><strong>Predicted Condition:</strong> <span style="color:var(--accent-primary); font-weight:700;">${escapeHtml(diag.condition)}</span></p>
                            <p><strong>Confidence:</strong> ${(diag.ml_confidence * 100).toFixed(1)}%</p>
                            ${top3Badges ? `<div style="margin-top:6px;"><strong>Differential Possibilities:</strong><br>${top3Badges}</div>` : ""}
                        </div>
                    </div>

                    <div class="summary-section-card">
                        <div class="summary-header">
                            <h4>Clinical Assessment &amp; Cause</h4>
                        </div>
                        <div class="summary-body">
                            <p>${escapeHtml(diag.cause || "N/A")}</p>
                        </div>
                    </div>

                    <div class="summary-section-card">
                        <div class="summary-header">
                            <h4>Home Care &amp; OTC Suggestions</h4>
                        </div>
                        <div class="summary-body">
                            <p><strong>Home Remedies:</strong> ${escapeHtml(diag.home_remedies || "Rest and hydration")}</p>
                            <p><strong>OTC Guidance:</strong> ${escapeHtml(diag.medication_guidance || "Consult pharmacist")}</p>
                        </div>
                    </div>

                    <div class="summary-section-card">
                        <div class="summary-header">
                            <h4>Diet &amp; Recovery Plan</h4>
                        </div>
                        <div class="summary-body">
                            <p><strong>Foods to Eat:</strong> ${escapeHtml(diag.diet_advice || "N/A")}</p>
                            <p><strong>Foods to Avoid:</strong> ${escapeHtml(diag.foods_to_avoid || "N/A")}</p>
                            <p><strong>Rest Duration:</strong> ${escapeHtml(diag.rest_days || "N/A")}</p>
                        </div>
                    </div>

                    <div class="warning-red-flag-card" style="margin-top:4px;">
                        <i data-lucide="alert-triangle"></i>
                        <div>
                            <h4>Red Flags Warning</h4>
                            <p>${escapeHtml(diag.red_flags || "Consult a doctor if symptoms worsen.")}</p>
                        </div>
                    </div>
                `;
                if (typeof lucide !== "undefined") lucide.createIcons();
                if (consultationModal) consultationModal.classList.remove("hidden");
            } else {
                alert("Summary record not found for this consultation.");
            }
        } catch (err) {
            console.error("Fetch summary error:", err);
        }
    };

    window.loadConversation = async function(cid) {
        activeConversationId = cid;
        localStorage.setItem("ai_doctor_cid", cid);
        try {
            const res = await fetch(`/api/diagnosis/${cid}`);
            if (res.ok) {
                const diag = await res.json();
                activeDiagnosisData = diag;
                renderResultsPage(diag, getFormIntakeData());
                updateChatContextSubtext(diag.condition);
                showPage("results");
                if (sidebarDrawer) sidebarDrawer.classList.remove("open");
            }
        } catch (e) {
            console.error("Load conversation error:", e);
        }
    };

    async function downloadPdfReport(cid) {
        if (!cid) { alert("No active assessment to export PDF!"); return; }
        try {
            showNotification("Generating Signed PDF Report...");
            const res = await fetch("/api/report/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ conversation_id: cid })
            });
            if (res.ok) {
                const data = await res.json();
                window.open(data.download_url, "_blank");
            } else {
                alert("Could not generate PDF report.");
            }
        } catch (e) {
            console.error("PDF generation error:", e);
        }
    }

    // -------------------------------------------------------------
    // 7. SPEECH SYNTHESIS & VOICE INPUT
    // -------------------------------------------------------------
    function speakText(text) {
        if (!synth || voiceMode !== "text-voice") return;
        synth.cancel();
        
        const cleanText = text.replace(/[*#_`]/g, "");
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        const voices = synth.getVoices();
        const indianVoice = voices.find(v => v.lang.includes("hi") || v.lang.includes("en-IN"));
        if (indianVoice) utterance.voice = indianVoice;

        utterance.onstart = () => {
            isSpeaking = true;
            if (audioVisualizer) audioVisualizer.classList.remove("hidden");
            if (stopSpeechBtn) stopSpeechBtn.classList.remove("hidden");
        };

        utterance.onend = () => {
            isSpeaking = false;
            if (audioVisualizer) audioVisualizer.classList.add("hidden");
            if (stopSpeechBtn) stopSpeechBtn.classList.add("hidden");
        };

        synth.speak(utterance);
    }

    if (stopSpeechBtn) {
        stopSpeechBtn.addEventListener("click", () => {
            if (synth) synth.cancel();
            isSpeaking = false;
            if (audioVisualizer) audioVisualizer.classList.add("hidden");
            if (stopSpeechBtn) stopSpeechBtn.classList.add("hidden");
        });
    }

    // Sidebar toggle controls
    if (openSidebarBtn) {
        openSidebarBtn.addEventListener("click", () => {
            if (window.innerWidth <= 1024) {
                sidebarDrawer.classList.remove("closed");
                sidebarDrawer.classList.add("open");
                syncDrawerBackdrop();
            } else {
                sidebarDrawer.classList.toggle("closed");
            }
        });
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener("click", () => {
            if (window.innerWidth <= 1024) {
                sidebarDrawer.classList.remove("open");
                syncDrawerBackdrop();
            } else {
                sidebarDrawer.classList.add("closed");
            }
        });
    }

    // -------------------------------------------------------------
    // 9. PROFILE API SYNC, CHAT CONTROLS, TOASTS & STT
    // -------------------------------------------------------------
    const profileHeight = document.getElementById("profileHeight");
    const profileWeight = document.getElementById("profileWeight");

    async function loadProfileFromAPI() {
        try {
            const res = await fetch("/api/profile");
            if (res.ok) {
                const data = await res.json();
                if (data.name && profileName) profileName.value = data.name;
                if (data.age && profileAge) profileAge.value = data.age;
                if (data.gender && profileGender) profileGender.value = data.gender;
                if (data.allergies && profileAllergies) profileAllergies.value = data.allergies;
                if (data.chronic_conditions && profileChronic) profileChronic.value = data.chronic_conditions;
                if (data.height && profileHeight) profileHeight.value = data.height;
                if (data.weight && profileWeight) profileWeight.value = data.weight;
                
                // Sync to Step 1 form if step 1 inputs exist
                if (data.name && stepName && !stepName.value) stepName.value = data.name;
                if (data.age && stepAge) stepAge.value = data.age;
                if (data.gender && stepGender) stepGender.value = data.gender;
            }
        } catch (e) {
            console.error("Load profile API error:", e);
        }
    }

    if (profileForm) {
        profileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const payload = {
                name: profileName.value.trim(),
                age: parseInt(profileAge.value) || 25,
                gender: profileGender.value,
                allergies: profileAllergies.value.trim() || "None",
                chronic_conditions: profileChronic.value.trim() || "None",
                height: profileHeight ? profileHeight.value.trim() || "Not specified" : "Not specified",
                weight: profileWeight ? profileWeight.value.trim() || "Not specified" : "Not specified"
            };
            try {
                const res = await fetch("/api/profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    showNotification("Patient profile updated successfully!");
                    if (stepName) stepName.value = payload.name;
                } else {
                    showNotification("Failed to update profile", "error");
                }
            } catch (err) {
                showNotification("Error saving profile", "error");
            }
        });
    }

    // Medical Report Upload & Context Sync
    const attachReportBtn = document.getElementById("attachReportBtn");
    const uploadReportModal = document.getElementById("uploadReportModal");
    const closeUploadReportModalBtn = document.getElementById("closeUploadReportModalBtn");
    const cancelReportModalBtn = document.getElementById("cancelReportModalBtn");
    const reportUploadForm = document.getElementById("reportUploadForm");
    const reportNameInput = document.getElementById("reportNameInput");
    const reportTextInput = document.getElementById("reportTextInput");

    if (attachReportBtn && uploadReportModal) {
        attachReportBtn.addEventListener("click", () => {
            uploadReportModal.classList.remove("hidden");
            if (reportTextInput) reportTextInput.focus();
        });
    }

    if (closeUploadReportModalBtn) {
        closeUploadReportModalBtn.addEventListener("click", () => {
            if (uploadReportModal) uploadReportModal.classList.add("hidden");
        });
    }

    if (cancelReportModalBtn) {
        cancelReportModalBtn.addEventListener("click", () => {
            if (uploadReportModal) uploadReportModal.classList.add("hidden");
        });
    }

    if (reportUploadForm) {
        reportUploadForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const repText = reportTextInput ? reportTextInput.value.trim() : "";
            const repName = reportNameInput ? reportNameInput.value.trim() || "Blood Test Report" : "Blood Test Report";

            if (!repText) {
                showNotification("Please paste or type report test values!", "error");
                return;
            }

            try {
                showNotification("Parsing & saving report data...");
                const res = await fetch("/api/report/upload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        conversation_id: activeConversationId,
                        report_name: repName,
                        report_text: repText
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data.conversation_id && !activeConversationId) {
                        activeConversationId = data.conversation_id;
                        localStorage.setItem("ai_doctor_cid", activeConversationId);
                    }

                    if (uploadReportModal) uploadReportModal.classList.add("hidden");
                    if (reportTextInput) reportTextInput.value = "";

                    const parsedTests = (data.parsed_summary && data.parsed_summary.tests) ? data.parsed_summary.tests : [];
                    let summaryMessage = `📄 **Medical Report Uploaded Successfully!**\n- Report Name: **${escapeHtml(repName)}**\n`;
                    if (parsedTests.length > 0) {
                        summaryMessage += `- Extracted Test Findings:\n` + parsedTests.map(t => `  * **${escapeHtml(t.test)}**: ${escapeHtml(t.value)} ${escapeHtml(t.unit || "")} (Ref: ${escapeHtml(t.reference_range)})`).join("\n");
                    } else {
                        summaryMessage += `- Report text saved to conversation context.`;
                    }
                    summaryMessage += `\n\nYou can now ask me questions about your report findings!`;

                    appendDrawerMessage("assistant", summaryMessage);
                    showNotification("Medical report saved to AI Doctor context!");
                } else {
                    showNotification("Failed to save report data", "error");
                }
            } catch (err) {
                console.error("Report upload error:", err);
                showNotification("Error saving medical report", "error");
            }
        });
    }

    // Clear Chat Context
    const clearChatBtn = document.getElementById("clearChatBtn");
    if (clearChatBtn) {
        clearChatBtn.addEventListener("click", () => {
            activeConversationId = null;
            localStorage.removeItem("ai_doctor_cid");
            activeDiagnosisData = null;
            updateChatContextSubtext(null);
            drawerChatMessages.innerHTML = `
                <div class="message assistant-message">
                    <div class="avatar"><i data-lucide="bot"></i></div>
                    <div class="message-content">
                        <div class="speaker-tag">AI Doctor</div>
                        <p>Chat session reset. How can I help you today?</p>
                    </div>
                </div>
            `;
            if (typeof lucide !== "undefined") lucide.createIcons();
            showNotification("Chat session cleared.");
        });
    }

    // Suggested Questions Chips
    document.querySelectorAll(".chat-suggest-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const prompt = chip.dataset.prompt;
            if (prompt) {
                sendSideChatMessage(prompt);
            }
        });
    });

    // Speech-to-Text (STT) Mic Integration
    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition || !micBtn) return;

        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onstart = () => {
            isRecording = true;
            micBtn.classList.add("recording");
            showNotification("Listening... Speak now 🎙️");
        };

        recognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            if (drawerUserInput) {
                drawerUserInput.value = transcript;
                drawerUserInput.focus();
            }
        };

        recognition.onerror = (e) => {
            isRecording = false;
            micBtn.classList.remove("recording");
            showNotification("Voice input cancelled or not recognized.", "error");
        };

        recognition.onend = () => {
            isRecording = false;
            micBtn.classList.remove("recording");
        };

        micBtn.addEventListener("click", () => {
            if (!recognition) return;
            if (isRecording) {
                recognition.stop();
            } else {
                try {
                    recognition.start();
                } catch (e) {
                    console.error("Recognition start error:", e);
                }
            }
        });
    }

    initSpeechRecognition();

    // Initial Setup
    updateStepUI();
    loadHistory();
    loadProfileFromAPI();

    // Helper functions
    function escapeHtml(text) {
        if (!text) return "";
        return String(text)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function renderFormattedContent(text) {
        if (!text) return "";
        let formatted = escapeHtml(text);
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
        formatted = formatted.replace(/\n\n/g, "<br><br>");
        formatted = formatted.replace(/\n/g, "<br>");
        return formatted;
    }

    function showNotification(msg, type = "info") {
        const container = document.getElementById("toastContainer");
        if (!container) {
            console.log("Notification:", msg);
            return;
        }
        const toast = document.createElement("div");
        toast.className = "toast-msg";
        const iconName = type === "error" ? "alert-circle" : "info";
        toast.innerHTML = `<i data-lucide="${iconName}"></i> <span>${escapeHtml(msg)}</span>`;
        container.appendChild(toast);
        if (typeof lucide !== "undefined") lucide.createIcons();
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transition = "opacity 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

});

