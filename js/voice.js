let recognition = null;
let isRecording = false;

const micBtn = document.getElementById('micBtn');
const recordingStatus = document.getElementById('recordingStatus');
const voiceSelect = document.getElementById('voiceSelect');

export function initVoices() {
  const voices = speechSynthesis.getVoices();
  if (!voiceSelect) return;
  voiceSelect.innerHTML = '';
  const pref = ['zh-HK', 'zh-TW', 'zh-CN', 'yue', 'zh'];
  [...voices].sort((a, b) => {
    const ai = pref.findIndex(p => a.lang.startsWith(p));
    const bi = pref.findIndex(p => b.lang.startsWith(p));
    return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99);
  }).forEach((voice, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(o);
  });
}

export function speak(text) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const idx = parseInt(voiceSelect?.value);
  if (!isNaN(idx) && voices[idx]) u.voice = voices[idx];
  speechSynthesis.speak(u);
  return u;
}

export function stopSpeaking() {
  speechSynthesis.cancel();
  document.querySelectorAll('.speaking').forEach(b => b.classList.remove('speaking'));
}

export function toggleMic(inputEl, onDone) {
  if (isRecording) {
    stopRec();
    if (inputEl.value.trim()) onDone();
  } else {
    startRec(inputEl);
  }
}

function startRec(inputEl) {
  stopSpeaking();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Browser does not support speech recognition.'); return; }
  if (!recognition) {
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    let final = '';
    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add('recording');
      recordingStatus.classList.add('active');
      final = inputEl.value;
    };
    recognition.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      inputEl.value = final + interim;
    };
    recognition.onerror = () => stopRec();
    recognition.onend = () => { if (isRecording) stopRec(); };
  }
  const langEl = document.getElementById('speechLang');
  recognition.lang = langEl ? langEl.value : 'zh-HK';
  try { recognition.start(); } catch { recognition.stop(); setTimeout(() => recognition.start(), 100); }
}

function stopRec() {
  isRecording = false;
  micBtn.classList.remove('recording');
  recordingStatus.classList.remove('active');
  if (recognition) try { recognition.stop(); } catch {}
}
