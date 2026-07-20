// ==========================================
// REGISTER ALL WINDOW FUNCTIONS FIRST
// This ensures buttons work even if code
// below fails to initialize
// ==========================================

var setupBlock = document.getElementById("setupBlock");
var planSelectionArea = document.getElementById("planSelectionArea");
var mainTimerArea = document.getElementById("mainTimerArea");
var changePlanBtn = document.getElementById("changePlanBtn");
var timerDisplay = document.getElementById("timerDisplay");
var messageBox = document.getElementById("messageBox");
var toggleBtn = document.getElementById("toggleBtn");
var sessionCount = document.getElementById("sessionCount");
var modeDisplay = document.getElementById("modeDisplay");
var nextBreak = document.getElementById("nextBreak");
var pipBtn = document.getElementById("pipBtn");
var pipVideo = document.getElementById("pipVideo");
var progressBtn = document.getElementById("progressBtn");
var progressViewArea = document.getElementById("progressViewArea");
var backToTimerBtn = document.getElementById("backToTimerBtn");
var progressFocusSeconds = document.getElementById("progressFocusSeconds");
var progressTargetMinutes = document.getElementById("progressTargetMinutes");
var progressCycles = document.getElementById("progressCycles");

// --- STATE ---
var timer = null;
var remainingSeconds = 0;
var totalSeconds = 0;
var planSelected = false;
var selectedStudyTime = 25;
var selectedBreakTime = 5;
var selectedLongBreakTime = 15;
var totalTargetMinutes = 240;
var totalElapsedSeconds = 0;
var currentMode = "study";
var cyclesCompleted = 0;
var isRunning = false;
var globalSessionStartTimestamp = null;
var initialSecondsLeft = 0;
var studyElapsedAtStart = 0;
var lastDisplayedTime = "";

try {
    totalElapsedSeconds = Number(localStorage.getItem("totalStudySeconds") || 0);
    cyclesCompleted = Number(localStorage.getItem("sessions") || 0);
} catch (e) {}

// --- NEXT BUTTON ---
window.proceedToPlans = function () {
    var hours = Number(document.getElementById("targetHours").value || 0);
    var minutes = Number(document.getElementById("targetMinutes").value || 0);
    totalTargetMinutes = (hours * 60) + minutes;

    if (totalTargetMinutes <= 0) {
        sendGlobalNotification("Warning", "Please enter a valid target duration.");
        return;
    }

    setupBlock.style.display = "none";
    planSelectionArea.style.display = "block";

    var longBreakOption = document.getElementById("longBreakOption");
    if (totalTargetMinutes >= 180) {
        longBreakOption.style.display = "block";
        document.getElementById("suggestedLongBreak").value = 15;
    } else {
        longBreakOption.style.display = "none";
    }
};

// --- PLAN SELECTION ---
window.selectPlan = function (study, shortBreak) {
    selectedStudyTime = study;
    selectedBreakTime = shortBreak;

    var longBreakOption = document.getElementById("longBreakOption");
    if (longBreakOption && longBreakOption.style.display !== "none") {
        selectedLongBreakTime = Number(document.getElementById("suggestedLongBreak").value || 15);
    } else {
        selectedLongBreakTime = 0;
    }

    planSelected = true;
    initTimerSession("study");

    planSelectionArea.style.display = "none";
    mainTimerArea.style.display = "block";

    startTimer();
};

// --- CUSTOM PLAN MODAL ---
window.customPlan = function () {
    var modal = document.createElement("div");
    modal.id = "customPlanModal";
    modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);display:flex;justify-content:center;align-items:center;z-index:1000;";

    var card = document.createElement("div");
    card.style.cssText = "background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:20px;padding:30px;width:90%;max-width:450px;border:2px solid rgba(59,130,246,0.5);box-shadow:0 20px 60px rgba(0,0,0,0.5);color:white;";

    card.innerHTML =
        '<h2 style="text-align:center;margin-bottom:20px;font-size:24px;">⚙️ Custom Study Split</h2>' +
        '<div style="margin-bottom:20px;">' +
        '<label style="display:block;margin-bottom:8px;font-weight:bold;">Study Time (minutes)</label>' +
        '<input type="number" id="customStudyInput" min="1" max="480" value="25" style="width:100%;padding:12px;border-radius:10px;border:none;font-size:16px;text-align:center;">' +
        '</div>' +
        '<div style="margin-bottom:20px;">' +
        '<label style="display:block;margin-bottom:8px;font-weight:bold;">Short Break Time (minutes)</label>' +
        '<input type="number" id="customBreakInput" min="1" max="60" value="5" style="width:100%;padding:12px;border-radius:10px;border:none;font-size:16px;text-align:center;">' +
        '</div>' +
        '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button id="cancelCustom" style="padding:12px 24px;border:none;border-radius:10px;background:#64748b;color:white;cursor:pointer;font-weight:bold;font-size:16px;">Cancel</button>' +
        '<button id="confirmCustom" style="padding:12px 24px;border:none;border-radius:10px;background:#22c55e;color:white;cursor:pointer;font-weight:bold;font-size:16px;">Confirm</button>' +
        '</div>';

    modal.appendChild(card);
    document.body.appendChild(modal);

    document.getElementById("cancelCustom").onclick = function () { modal.remove(); };
    document.getElementById("confirmCustom").onclick = function () {
        var s = Number(document.getElementById("customStudyInput").value);
        var b = Number(document.getElementById("customBreakInput").value);
        if (s > 0 && b > 0) {
            modal.remove();
            window.selectPlan(s, b);
        }
    };
};

// --- NOTIFICATION (needed by proceedToPlans) ---
function sendGlobalNotification(title, text) {
    if ("Notification" in window && Notification.permission === "granted") {
        try { new Notification(title, { body: text }); } catch (e) { }
    }
    var container = document.getElementById("toastContainer");
    if (container) {
        var toast = document.createElement("div");
        toast.className = "toast-card";
        toast.innerText = title + ": " + text;
        container.appendChild(toast);
        setTimeout(function () { toast.classList.add("show"); }, 50);
        setTimeout(function () {
            toast.classList.remove("show");
            setTimeout(function () { toast.remove(); }, 400);
        }, 4000);
    }
}

// ==========================================
// WEB WORKER — RELIABLE BACKGROUND TIMING
// Wrapped in try-catch so it never crashes
// the script if the browser blocks Blob Workers
// ==========================================
var timerWorker = null;
var workerFailed = false;

try {
    var workerCode = [
        "var interval=null;",
        "self.onmessage=function(e){",
        "  if(e.data.command==='start'){",
        "    if(interval)clearInterval(interval);",
        "    interval=setInterval(function(){",
        "      self.postMessage({tick:Date.now()});",
        "    },500);",
        "  }else if(e.data.command==='stop'){",
        "    if(interval){clearInterval(interval);interval=null;}",
        "  }",
        "};"
    ].join("\n");

    var workerBlob = new Blob([workerCode], { type: "application/javascript" });
    var workerUrl = URL.createObjectURL(workerBlob);

    function getWorker() {
        if (timerWorker) return timerWorker;
        try {
            timerWorker = new Worker(workerUrl);
            timerWorker.onmessage = function (e) {
                if (!isRunning || !globalSessionStartTimestamp) return;
                var elapsed = Math.floor((e.data.tick - globalSessionStartTimestamp) / 1000);
                remainingSeconds = initialSecondsLeft - elapsed;
                if (currentMode === "study") {
                    totalElapsedSeconds = studyElapsedAtStart + elapsed;
                }
                if (remainingSeconds <= 0) {
                    remainingSeconds = 0;
                    stopTickEngine();
                    isRunning = false;
                    updateDisplay();
                    handleIntervalCompletion();
                } else {
                    updateDisplay();
                }
            };
            timerWorker.onerror = function () { workerFailed = true; };
        } catch (e) { workerFailed = true; }
        return timerWorker;
    }

    function startTickEngine() {
        if (workerFailed) {
            fallbackInterval();
        } else {
            getWorker().postMessage({ command: "start" });
        }
    }

    function stopTickEngine() {
        if (workerFailed) {
            if (timer) { clearInterval(timer); timer = null; }
        } else {
            if (timerWorker) timerWorker.postMessage({ command: "stop" });
        }
    }
} catch (e) {
    workerFailed = true;
    // Fallback definitions if the whole Worker block failed
    startTickEngine = fallbackInterval;
    stopTickEngine = function () { if (timer) { clearInterval(timer); timer = null; } };
}

function fallbackInterval() {
    timer = setInterval(function () {
        if (!isRunning || !globalSessionStartTimestamp) return;
        var elapsed = Math.floor((Date.now() - globalSessionStartTimestamp) / 1000);
        remainingSeconds = initialSecondsLeft - elapsed;
        if (currentMode === "study") {
            totalElapsedSeconds = studyElapsedAtStart + elapsed;
        }
        if (remainingSeconds <= 0) {
            remainingSeconds = 0;
            clearInterval(timer);
            timer = null;
            isRunning = false;
            updateDisplay();
            handleIntervalCompletion();
        } else {
            updateDisplay();
        }
    }, 1000);
}

// ==========================================
// AUDIO BRIDGE — MUTED ON PAUSE, NEVER KILLED
// ==========================================
var audioContext = null;
var silenceOscillator = null;
var gainNode = null;
var audioBridgeStarted = false;

function initAudioBridge() {
    if (audioBridgeStarted) { unmuteAudioBridge(); return; }
    try {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === "suspended") audioContext.resume().catch(function () { });
        if (silenceOscillator) { try { silenceOscillator.stop(); } catch (e) { } }
        silenceOscillator = audioContext.createOscillator();
        gainNode = audioContext.createGain();
        silenceOscillator.type = "sine";
        silenceOscillator.frequency.value = 1;
        gainNode.gain.value = 0.001;
        silenceOscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        silenceOscillator.start();
        audioBridgeStarted = true;
    } catch (e) { }
}

function muteAudioBridge() { if (gainNode) gainNode.gain.value = 0; }
function unmuteAudioBridge() {
    if (gainNode) gainNode.gain.value = 0.001;
    if (audioContext && audioContext.state === "suspended") audioContext.resume().catch(function () { });
}

// ==========================================
// TOAST — SMART REPOSITIONING FOR KEYBOARD
// ==========================================
var toastContainer = document.getElementById("toastContainer");
var toastAtBottom = false;

function moveToastToBottom() {
    if (!toastContainer || toastAtBottom) return;
    toastAtBottom = true;
    toastContainer.style.top = "auto";
    toastContainer.style.bottom = "15px";
    toastContainer.style.right = "12px";
    toastContainer.style.left = "12px";
    toastContainer.style.alignItems = "center";
}

function moveToastToTop() {
    if (!toastContainer || !toastAtBottom) return;
    toastAtBottom = false;
    toastContainer.style.top = "20px";
    toastContainer.style.bottom = "auto";
    toastContainer.style.right = "20px";
    toastContainer.style.left = "auto";
    toastContainer.style.alignItems = "flex-end";
}

document.addEventListener("focusin", function (e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) moveToastToBottom();
});
document.addEventListener("focusout", function (e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) setTimeout(moveToastToTop, 350);
});
if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
        var vv = window.visualViewport;
        if (vv.height < window.innerHeight * 0.78) {
            var kbHeight = window.innerHeight - vv.height - vv.offsetTop;
            toastContainer.style.top = "auto";
            toastContainer.style.bottom = (kbHeight + 12) + "px";
            toastContainer.style.right = "12px";
            toastContainer.style.left = "12px";
            toastContainer.style.alignItems = "center";
            toastAtBottom = true;
        } else if (toastAtBottom) {
            moveToastToTop();
        }
    });
}

// ==========================================
// CYCLE CONTROLLER
// ==========================================
function initTimerSession(mode) {
    currentMode = mode;
    if (mode === "study") {
        remainingSeconds = selectedStudyTime * 60;
        if (modeDisplay) modeDisplay.innerText = "Study";
        showMotivationNotification();
    } else if (mode === "shortBreak") {
        remainingSeconds = selectedBreakTime * 60;
        if (modeDisplay) modeDisplay.innerText = "Short Break";
        messageBox.innerText = "🌿 Stretch, breathe, and rest your eyes.";
    } else if (mode === "longBreak") {
        remainingSeconds = selectedLongBreakTime * 60;
        if (modeDisplay) modeDisplay.innerText = "Long Break";
        messageBox.innerText = "🌞 Refresh completely.";
    }
    totalSeconds = remainingSeconds;
    lastDisplayedTime = "";
    updateDisplay();
}

function formatTime(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    return (h > 0 ? String(h).padStart(2, "0") + ":" : "") + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function updateDisplay() {
    var clamped = Math.max(0, remainingSeconds);
    var timeStr = formatTime(clamped);
    if (timeStr !== lastDisplayedTime) {
        timerDisplay.innerText = timeStr;
        lastDisplayedTime = timeStr;
        updateMediaSession();
    }
    var progressBar = document.getElementById("progressBar");
    if (totalSeconds > 0 && progressBar) {
        progressBar.style.width = ((clamped / totalSeconds) * 100) + "%";
    }
    if (sessionCount) sessionCount.innerText = cyclesCompleted;
    if (nextBreak) {
        nextBreak.innerText = (selectedLongBreakTime > 0 && (cyclesCompleted + 1) % 3 === 0) ? "Long Break" : "Short Break";
    }
    saveProgress();
}

function saveProgress() {
    try {
        localStorage.setItem("sessions", cyclesCompleted);
        localStorage.setItem("totalStudySeconds", totalElapsedSeconds);
        localStorage.setItem("totalStudyMinutes", Math.floor(totalElapsedSeconds / 60));
    } catch (e) { }
}

// ==========================================
// START / PAUSE
// ==========================================
function startTimer() {
    if (isRunning) return;
    initAudioBridge();
    unmuteAudioBridge();
    isRunning = true;
    updateToggleButton();
    updateMediaSession();
    globalSessionStartTimestamp = Date.now();
    initialSecondsLeft = remainingSeconds;
    studyElapsedAtStart = totalElapsedSeconds;
    startTickEngine();
}

function pauseTimer() {
    if (!isRunning) return;
    stopTickEngine();
    isRunning = false;
    muteAudioBridge();
    updateToggleButton();
    updateMediaSession();
    saveProgress();
}

function handleIntervalCompletion() {
    triggerAlertChime();
    if (currentMode === "study") {
        cyclesCompleted++;
        sendGlobalNotification("🎉 Interval Finished", "Time to rest your eyes! Excellent work.");
        if (selectedLongBreakTime > 0 && cyclesCompleted % 3 === 0) {
            initTimerSession("longBreak");
        } else {
            initTimerSession("shortBreak");
        }
    } else {
        sendGlobalNotification("🚀 Break Over", "Time to double down. Let's go!");
        initTimerSession("study");
    }
    saveProgress();
    startTimer();
}

function updateToggleButton() {
    if (isRunning) {
        toggleBtn.innerText = "⏸ Pause";
        toggleBtn.style.background = "#f59e0b";
    } else {
        toggleBtn.innerText = "▶ Start";
        toggleBtn.style.background = "#22c55e";
    }
}

if (toggleBtn) {
    toggleBtn.onclick = function () {
        if (isRunning) pauseTimer(); else startTimer();
    };
}

// ==========================================
// SPA VIEWPORT INTERCHANGES
// ==========================================
if (progressBtn) {
    progressBtn.onclick = function () {
        mainTimerArea.style.display = "none";
        progressViewArea.style.display = "block";
        progressFocusSeconds.innerText = totalElapsedSeconds;
        progressTargetMinutes.innerText = totalTargetMinutes;
        progressCycles.innerText = cyclesCompleted;
    };
}
if (backToTimerBtn) {
    backToTimerBtn.onclick = function () {
        progressViewArea.style.display = "none";
        mainTimerArea.style.display = "block";
    };
}
if (changePlanBtn) {
    changePlanBtn.onclick = function () {
        pauseTimer();
        remainingSeconds = 0;
        totalElapsedSeconds = 0;
        cyclesCompleted = 0;
        mainTimerArea.style.display = "none";
        setupBlock.style.display = "block";
    };
}

// ==========================================
// MOTIVATION & NOTIFICATION PERMISSION
// ==========================================
var motivationMessages = [
    "🎯 Stay focused. One step closer!",
    "💪 You are doing great. Keep going.",
    "🔥 Focus builds your great future.",
    "📚 Small progress is still success.",
    "🚀 Your future self will thank you."
];

function showMotivationNotification() {
    var msg = motivationMessages[Math.floor(Math.random() * motivationMessages.length)];
    messageBox.innerText = msg;
    sendGlobalNotification("🎯 Focus Prompt", msg);
}

if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
}

function triggerAlertChime() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var now = ctx.currentTime;
        function beep(time, freq) {
            var o = ctx.createOscillator();
            var g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = freq;
            g.gain.value = 0.4;
            o.start(time); o.stop(time + 0.4);
        }
        beep(now, 850); beep(now + 0.5, 1100);
    } catch (e) { }
}

// ==========================================
// PIP CANVAS RENDER
// ==========================================
var pipCanvas = document.createElement("canvas");
pipCanvas.width = 400;
pipCanvas.height = 200;
var pipContext = pipCanvas.getContext("2d");
var pipStream = pipCanvas.captureStream(30);
pipVideo.srcObject = pipStream;
pipVideo.muted = true;
pipVideo.playsInline = true;

function drawPip() {
    var w = pipCanvas.width, h = pipCanvas.height;
    if (currentMode === "study") {
        pipContext.fillStyle = "#0a150a";
        pipContext.fillRect(0, 0, w, h);
        var g1 = pipContext.createLinearGradient(0, 0, w, h);
        g1.addColorStop(0, "rgba(34,197,94,0.12)");
        g1.addColorStop(1, "rgba(0,0,0,0)");
        pipContext.fillStyle = g1;
        pipContext.fillRect(0, 0, w, h);
    } else {
        pipContext.fillStyle = "#080e1a";
        pipContext.fillRect(0, 0, w, h);
        var g2 = pipContext.createLinearGradient(0, 0, w, h);
        g2.addColorStop(0, "rgba(59,130,246,0.12)");
        g2.addColorStop(1, "rgba(0,0,0,0)");
        pipContext.fillStyle = g2;
        pipContext.fillRect(0, 0, w, h);
    }
    var modeText = currentMode === "study" ? "📚 STUDY" : currentMode === "shortBreak" ? "☕ SHORT BREAK" : "☀️ LONG BREAK";
    var modeColor = currentMode === "study" ? "#22c55e" : "#3b82f6";
    pipContext.fillStyle = modeColor;
    pipContext.font = "bold 20px Arial, sans-serif";
    pipContext.textAlign = "center";
    pipContext.textBaseline = "top";
    pipContext.fillText(modeText, w / 2, 14);
    pipContext.fillStyle = "#ffffff";
    pipContext.font = "bold 68px Arial, sans-serif";
    pipContext.textAlign = "center";
    pipContext.textBaseline = "middle";
    pipContext.fillText(timerDisplay ? timerDisplay.innerText : "00:00", w / 2, h / 2 + 2);
    var barY = h - 14, barH = 5;
    pipContext.fillStyle = "rgba(255,255,255,0.08)";
    pipContext.fillRect(24, barY, w - 48, barH);
    if (totalSeconds > 0) {
        pipContext.fillStyle = modeColor;
        pipContext.fillRect(24, barY, (w - 48) * Math.max(0, Math.min(1, remainingSeconds / totalSeconds)), barH);
    }
    pipContext.fillStyle = "rgba(255,255,255,0.35)";
    pipContext.font = "14px Arial, sans-serif";
    pipContext.textAlign = "right";
    pipContext.textBaseline = "bottom";
    pipContext.fillText("Cycle " + cyclesCompleted, w - 24, barY - 6);
    requestAnimationFrame(drawPip);
}
drawPip();

// ==========================================
// MEDIA SESSION — ROBUST PiP CONTROLS
// ==========================================
function updateMediaSession() {
    if ("mediaSession" in navigator) {
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: timerDisplay ? timerDisplay.innerText : "00:00",
                artist: currentMode === "study" ? "Focusing Session" : "Break Active",
                album: "FocusFlow"
            });
            navigator.mediaSession.playbackState = isRunning ? "playing" : "paused";
        } catch (e) { }
    }
}

function registerMediaSessionHandlers() {
    if (!("mediaSession" in navigator)) return;
    try {
        navigator.mediaSession.setActionHandler("play", function () {
            unmuteAudioBridge();
            if (audioContext && audioContext.state === "suspended") {
                audioContext.resume().then(function () { startTimer(); }).catch(function () { startTimer(); });
            } else {
                startTimer();
            }
        });
        navigator.mediaSession.setActionHandler("pause", function () { pauseTimer(); });
    } catch (e) { }
}
registerMediaSessionHandlers();

if (pipBtn) {
    pipBtn.onclick = async function () {
        try {
            initAudioBridge();
            if (pipVideo.readyState === 0) pipVideo.load();
            await pipVideo.play();
            await pipVideo.requestPictureInPicture();
            registerMediaSessionHandlers();
            updateMediaSession();
        } catch (e) {
            console.error("PiP Exception: ", e);
            sendGlobalNotification("PiP Error", "Could not open Picture-in-Picture. Try again.");
        }
    };
}