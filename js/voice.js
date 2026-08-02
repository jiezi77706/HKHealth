let recognition = null;
let isRecording = false;
let transcript = '';
let timerInterval = null;
let recStartTime = 0;

const micBtn = document.getElementById('micBtn');
const voiceSelect = document.getElementById('voiceSelect');
const inputArea = document.querySelector('.input-area');

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

export function toggleMic(onSend) {
  if (isRecording) {
    stopRec(onSend);
  } else {
    startRec();
  }
}

function showRecordingBar() {
  const textarea = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  textarea.style.display = 'none';
  sendBtn.style.display = 'none';

  const bar = document.createElement('div');
  bar.id = 'recordingBar';
  bar.className = 'recording-bar';
  bar.innerHTML = `
    <div class="rec-dot-pulse"></div>
    <div class="rec-waves"><span></span><span></span><span></span><span></span><span></span></div>
    <span class="rec-timer" id="recTimer">0:00</span>
    <button class="rec-cancel" id="recCancel" title="Cancel">&#x2716;</button>
  `;
  textarea.parentNode.insertBefore(bar, sendBtn);

  document.getElementById('recCancel').onclick = () => cancelRec();

  recStartTime = Date.now();
  timerInterval = setInterval(() => {
    const sec = Math.floor((Date.now() - recStartTime) / 1000);
    const el = document.getElementById('recTimer');
    if (el) el.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }, 500);
}

function hideRecordingBar() {
  const bar = document.getElementById('recordingBar');
  if (bar) bar.remove();
  const textarea = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  textarea.style.display = '';
  sendBtn.style.display = '';
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function startRec() {
  stopSpeaking();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Your browser does not support speech recognition. Please use Chrome.'); return; }

  transcript = '';

  if (recognition) {
    try { recognition.stop(); } catch {}
    recognition = null;
  }

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = true;
  const langEl = document.getElementById('speechLang');
  recognition.lang = langEl ? langEl.value : 'zh-HK';

  let finalText = '';

  recognition.onstart = () => {
    isRecording = true;
    micBtn.classList.add('recording');
    micBtn.innerHTML = '&#x23F9;';
    showRecordingBar();
  };

  recognition.onresult = e => {
    finalText = '';
    let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    transcript = finalText + interim;
  };

  recognition.onerror = (e) => {
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      console.error('Speech error:', e.error);
    }
  };

  recognition.onend = () => {
    transcript = finalText || transcript;
  };

  try { recognition.start(); } catch {}
}

function stopRec(onSend) {
  isRecording = false;
  micBtn.classList.remove('recording');
  micBtn.innerHTML = '&#x1F3A4;';

  if (recognition) {
    try { recognition.stop(); } catch {}
  }

  setTimeout(() => {
    hideRecordingBar();
    const text = transcript.trim();
    transcript = '';
    recognition = null;
    if (text && onSend) onSend(text);
  }, 300);
}

function cancelRec() {
  isRecording = false;
  micBtn.classList.remove('recording');
  micBtn.innerHTML = '&#x1F3A4;';
  if (recognition) { try { recognition.abort(); } catch {} }
  recognition = null;
  transcript = '';
  hideRecordingBar();
}
