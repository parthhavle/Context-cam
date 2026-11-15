(() => {
  const $ = (id) => document.getElementById(id);
  const video = $("video");
  const canvas = $("canvas");
  const camMsg = $("cam-msg");
  const listeningBadge = $("listening");
  const statusEl = $("status");
  const answerEl = $("answer");
  const micBtn = $("mic");
  const micLabel = $("mic-label");
  const describeBtn = $("describe");
  const repeatBtn = $("repeat");
  const stopBtn = $("stop");
  const flipBtn = $("flip");
  const settingsBtn = $("settings-btn");
  const settingsPanel = $("settings");
  const rateInput = $("rate");
  const langSelect = $("lang");
  const form = $("text-form");
  const questionInput = $("question");

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const VOICE_LANG = {
    English: "en-US", Hindi: "hi-IN", Marathi: "mr-IN",
    Spanish: "es-ES", French: "fr-FR", German: "de-DE",
  };

  let stream = null;
  let facing = "environment";
  let busy = false;
  let recognizer = null;
  let recorder = null;
  let recordedChunks = [];
  let isListening = false;
  let lastAnswer = "";
  const history = [];

  // ---------- helpers ----------
  const setStatus = (text, isError = false) => {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", isError);
  };

  let audioCtx = null;
  const beep = (freq = 880, ms = 120) => {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + ms / 1000);
    } catch (_) { /* ignore */ }
  };
  const buzz = (pattern) => { try { navigator.vibrate && navigator.vibrate(pattern); } catch (_) {} };

  // ---------- speech output ----------
  const speak = (text) => {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = parseFloat(rateInput.value) || 1;
    const lang = VOICE_LANG[langSelect.value];
    if (lang) u.lang = lang;
    window.speechSynthesis.speak(u);
  };
  const stopSpeaking = () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); };

  // ---------- camera ----------
  async function startCamera() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    camMsg.hidden = false;
    camMsg.textContent = "Starting camera…";
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play().catch(() => {});
      camMsg.hidden = true;
    } catch (err) {
      camMsg.hidden = false;
      camMsg.textContent =
        "Camera is blocked. Please allow camera access in your browser settings, then reload the page.";
      setStatus("Camera unavailable.", true);
    }
  }

  function captureFrame() {
    if (!video.videoWidth) return null;
    const MAX = 1024;
    const scale = Math.min(1, MAX / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  }

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(String(r.result).split(",")[1]);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  // ---------- ask Gemini ----------
  async function ask({ question = "", audioBlob = null } = {}) {
    if (busy) return;
    const image = captureFrame();
    if (!image) {
      setStatus("Camera is not ready yet.", true);
      speak("The camera is not ready yet.");
      return;
    }
    busy = true;
    micBtn.disabled = describeBtn.disabled = true;
    setStatus("Looking…");
    answerEl.textContent = "";
    stopSpeaking();
    beep(520, 90);

    try {
      const payload = {
        image,
        imageMime: "image/jpeg",
        question: question.trim(),
        language: langSelect.value || undefined,
        history,
      };
      if (audioBlob) {
        payload.audio = await blobToBase64(audioBlob);
        payload.audioMime = (audioBlob.type || "audio/webm").split(";")[0];
      }

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      lastAnswer = data.answer;
      answerEl.textContent = lastAnswer;
      repeatBtn.disabled = false;
      setStatus(question ? `You asked: ${question}` : "Here is what I see.");
      history.push({ q: question || "Describe the scene.", a: lastAnswer });
      if (history.length > 6) history.shift();
      beep(880, 90);
      buzz(60);
      speak(lastAnswer);
    } catch (err) {
      const msg = "Sorry, I could not get an answer. " + (err.message || "");
      setStatus(msg, true);
      answerEl.textContent = "";
      speak("Sorry, something went wrong. Please try again.");
    } finally {
      busy = false;
      micBtn.disabled = describeBtn.disabled = false;
    }
  }

  // ---------- voice input ----------
  function setListeningUI(on) {
    isListening = on;
    micBtn.classList.toggle("recording", on);
    micBtn.setAttribute("aria-pressed", String(on));
    micLabel.textContent = on ? "Listening… tap to send" : "Tap to ask";
    listeningBadge.hidden = !on;
  }

  function startListening() {
    if (busy) return;
    stopSpeaking();
    beep(660, 100);
    buzz(40);
    if (SpeechRecognition) startRecognition();
    else startRecording();
  }

  function stopListening() {
    if (recognizer) { try { recognizer.stop(); } catch (_) {} }
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  // Preferred path: browser speech recognition (fast, on-device in Chrome/Edge/Safari).
  function startRecognition() {
    recognizer = new SpeechRecognition();
    recognizer.lang = VOICE_LANG[langSelect.value] || navigator.language || "en-US";
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    let transcript = "";
    let gotResult = false;

    recognizer.onstart = () => { setListeningUI(true); setStatus("Listening…"); };
    recognizer.onresult = (e) => {
      transcript = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      gotResult = true;
    };
    recognizer.onerror = (e) => {
      setListeningUI(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setStatus("Microphone is blocked. Please allow microphone access.", true);
        speak("Microphone is blocked. Please allow microphone access.");
      } else if (e.error === "no-speech") {
        setStatus("I did not hear anything. Tap and try again.");
      } else if (e.error !== "aborted") {
        // Network/other failure: fall back to sending raw audio to Gemini.
        setStatus("Voice typing failed. Tap to try again, or type your question.", true);
      }
    };
    recognizer.onend = () => {
      setListeningUI(false);
      if (gotResult && transcript.trim()) {
        const q = transcript.trim();
        const isDescribe = /^(describe|what('?s| is) (this|in front of me|around me)|what do you see)\b/i.test(q);
        ask({ question: isDescribe ? "" : q });
      }
    };
    try { recognizer.start(); } catch (_) { setListeningUI(false); }
  }

  // Fallback path: record audio and let Gemini hear the question directly.
  async function startRecording() {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
        .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
      recorder = new MediaRecorder(micStream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => e.data.size && recordedChunks.push(e.data);
      recorder.onstop = () => {
        micStream.getTracks().forEach((t) => t.stop());
        setListeningUI(false);
        const blob = new Blob(recordedChunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 800) ask({ audioBlob: blob });
        else setStatus("I did not hear anything. Tap and try again.");
      };
      recorder.start();
      setListeningUI(true);
      setStatus("Listening…");
      // Safety cap so it never records forever.
      setTimeout(() => { if (recorder && recorder.state === "recording") recorder.stop(); }, 15000);
    } catch (_) {
      setListeningUI(false);
      setStatus("Microphone is blocked. Please allow microphone access.", true);
      speak("Microphone is blocked. Please allow microphone access.");
    }
  }

  // ---------- events ----------
  micBtn.addEventListener("click", () => (isListening ? stopListening() : startListening()));
  describeBtn.addEventListener("click", () => { stopSpeaking(); ask({ question: "" }); });
  repeatBtn.addEventListener("click", () => speak(lastAnswer));
  stopBtn.addEventListener("click", stopSpeaking);
  flipBtn.addEventListener("click", () => {
    facing = facing === "environment" ? "user" : "environment";
    startCamera();
  });
  settingsBtn.addEventListener("click", () => {
    const open = settingsPanel.hidden;
    settingsPanel.hidden = !open;
    settingsBtn.setAttribute("aria-expanded", String(open));
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = questionInput.value.trim();
    questionInput.value = "";
    questionInput.blur();
    ask({ question: q });
  });

  // Spacebar toggles the mic when not typing; Escape stops speech.
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
    if (e.code === "Space" && !typing) {
      e.preventDefault();
      isListening ? stopListening() : startListening();
    } else if (e.key === "Escape") {
      stopSpeaking();
    }
  });

  // Remember settings
  try {
    const saved = JSON.parse(localStorage.getItem("contextcam") || "{}");
    if (saved.rate) rateInput.value = saved.rate;
    if (saved.lang !== undefined) langSelect.value = saved.lang;
  } catch (_) {}
  const persist = () => {
    try { localStorage.setItem("contextcam", JSON.stringify({ rate: rateInput.value, lang: langSelect.value })); } catch (_) {}
  };
  rateInput.addEventListener("change", persist);
  langSelect.addEventListener("change", persist);

  // Stop camera when tab is hidden, restart when back
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stream && stream.getTracks().forEach((t) => t.stop());
    else startCamera();
  });

  startCamera();
})();
