import { API_BASE, SYSTEM_PROMPT, DISCLAIMER } from './config.js';
import { db, uuid, now, timeStr, dateStr } from './db.js';
import { appendUserMsg, createBotBubble, addTimeStamp, addSpeakButton, renderHealthCard, renderPendingCard, renderVisitDraftCard, renderVisitBriefCard, renderRecordsList, renderDrugResults, renderPharmacyResults, renderRouteCard, scrollBottom } from './ui.js';
import { initVoices, speak, stopSpeaking, toggleMic } from './voice.js';
import { initDrugDB, searchDrugs } from './drugdb.js';
import { initPharmacyDB, searchPharmacies } from './pharmacydb.js';
import { planRoute, getUserLocation } from './toolhub.js';

// ── State ──
let conversationHistory = [];
let isStreaming = false;
let autoTts = false;
let pendingFollowup = null;
let visitPrepState = null;

const inputEl = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const typingEl = document.getElementById('typing');

// ── Init ──
speechSynthesis.onvoiceschanged = initVoices;
initVoices();
initDrugDB();
initPharmacyDB();

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
});
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ── Expose to HTML onclick handlers ──
window.togglePanel = function(name) {
  document.querySelectorAll('.panel').forEach(p => {
    if (p.id === name + 'Panel') p.classList.toggle('active');
    else p.classList.remove('active');
  });
  if (name === 'records') {
    renderRecordsList(document.getElementById('recordsList'), db.getEvents());
  }
};

window.toggleAutoTts = function() {
  autoTts = !autoTts;
  document.getElementById('autoTtsToggle').classList.toggle('on', autoTts);
};

window.sendMessage = sendMessage;

window.toggleMicBtn = function() {
  toggleMic((text) => {
    inputEl.value = text;
    sendMessage();
  });
};

window.startVisitPrep = function() {
  window.togglePanel('records');
  inputEl.value = '我想准备复诊资料';
  sendMessage();
};

// ── Meta parsing ──
function parseMeta(fullText) {
  const m = fullText.match(/<m>([\s\S]*?)<\/m>/);
  if (!m) return { meta: null, display: fullText };
  let meta = null;
  try { meta = JSON.parse(m[1]); } catch {}
  return { meta, display: fullText.replace(/<m>[\s\S]*?<\/m>/, '').trim() };
}

// ── Intent handler ──
function handleMeta(meta, bubble) {
  if (meta.intent === 'health_report' && meta.he) {
    const he = meta.he;
    if (he.lv === 'L1') {
      const event = {
        id: uuid(), original_text: he.ot || '',
        structured: { what: he.what, onset: he.onset, character: he.char, impact: he.impact, context: he.ctx, progression: he.prog },
        standard_concept: he.concept || null,
        level: 'L1', recorded_at: now(), status: he.status || 'ongoing'
      };
      db.saveEvent(event);
      renderHealthCard(bubble, event);
      pendingFollowup = null;
    } else if (he.lv === 'L2') {
      pendingFollowup = { ...he, followupCount: (pendingFollowup?.followupCount || 0) + 1 };
      if (pendingFollowup.followupCount >= 2) {
        const event = {
          id: uuid(), original_text: he.ot || '',
          structured: { what: he.what, onset: he.onset, character: he.char, impact: he.impact, context: he.ctx, progression: he.prog },
          standard_concept: he.concept || null,
          level: 'L2', recorded_at: now(), status: he.status || 'ongoing'
        };
        db.saveEvent(event);
        renderHealthCard(bubble, event);
        pendingFollowup = null;
      } else {
        renderPendingCard(bubble);
      }
    }
  } else if (meta.intent === 'drug_search' && meta.drug) {
    handleDrugSearch(meta.drug, bubble);
  } else if (meta.intent !== 'health_report' && pendingFollowup) {
    const pf = pendingFollowup;
    db.saveEvent({
      id: uuid(), original_text: pf.ot || '',
      structured: { what: pf.what, onset: pf.onset, character: pf.char, impact: pf.impact, context: pf.ctx, progression: pf.prog },
      standard_concept: pf.concept || null,
      level: 'L2', recorded_at: now(), status: pf.status || 'ongoing'
    });
    pendingFollowup = null;
  }
}

// ── Visit brief confirm ──
async function confirmVisitBrief(topic, events) {
  const recordsSummary = events.map(e => {
    const s = e.structured || {};
    return `- ${dateStr(e.recorded_at)}: ${e.original_text} [${e.standard_concept || 'N/A'}] 状态:${e.status} what:${s.what || ''} onset:${s.onset || ''}`;
  }).join('\n');

  const prompt = `请根据以下信息生成一份简洁的问诊摘要。
主题: ${topic}
相关健康记录:
${recordsSummary || '(无记录)'}

要求: 1.用清晰条目整理症状时间线 2.列出主要症状及变化 3.注明记录时间 4.不要诊断不给医疗建议 5.用中文撰写`;

  try {
    const resp = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'system', content: '你是一个医疗记录整理助手。只整理信息，不诊断。' }, { role: 'user', content: prompt }],
        temperature: 0.3, stream: false
      })
    });
    const data = await resp.json();
    const briefContent = data.choices?.[0]?.message?.content || '生成失败';
    const brief = {
      id: uuid(), topic, related_health_event_ids: events.map(e => e.id),
      related_medication_ids: [], generated_at: now(), confirmed: true,
      content: briefContent, disclaimer: DISCLAIMER
    };
    db.saveBrief(brief);

    const { bubble, content } = createBotBubble();
    content.textContent = '问诊摘要已生成:';
    addTimeStamp(bubble);
    renderVisitBriefCard(bubble, brief);
    addSpeakButton(bubble, briefContent, speak, stopSpeaking);
    scrollBottom();
    conversationHistory.push({ role: 'assistant', content: '问诊摘要已生成。' });
  } catch (err) {
    const { bubble, content } = createBotBubble();
    content.textContent = `Error: ${err.message}`;
    addTimeStamp(bubble);
  }
  visitPrepState = null;
}

// ── Drug search ──
async function handleDrugSearch(drugMeta, bubble) {
  await initDrugDB();
  await initPharmacyDB();

  const query = drugMeta.q || '';
  const queries = query.split(/\s+OR\s+/i).map(q => q.trim()).filter(Boolean);

  let allResults = [];
  const seen = new Set();
  for (const q of queries) {
    for (const d of searchDrugs(q, 6)) {
      if (!seen.has(d.p)) { seen.add(d.p); allResults.push(d); }
    }
  }
  allResults = allResults.slice(0, 8);

  renderDrugResults(bubble, allResults, (drug) => {
    showPharmaciesForDrug(drug, drugMeta.district);
  });
  scrollBottom();
}

async function showPharmaciesForDrug(drug, district) {
  await initPharmacyDB();
  const { bubble, content } = createBotBubble();
  content.textContent = `正在查找可购买 ${drug.n} 的药房...`;

  const opts = { limit: 8 };
  if (district) opts.district = district;
  const results = searchPharmacies(opts);

  content.textContent = '';
  renderPharmacyResults(bubble, results, drug.s, (pharmacy) => {
    showTransitRoute(pharmacy);
  });
  addTimeStamp(bubble);
  scrollBottom();
}

const DISTRICT_ZH = {
  'MONG KOK':'旺角','TSUEN WAN':'荃灣','SHAM SHUI PO':'深水埗','SHATIN':'沙田',
  'TUEN MUN':'屯門','YUEN LONG':'元朗','TAI PO':'大埔','KWAI CHUNG':'葵涌',
  'KWUN TONG':'觀塘','TSEUNG KWAN O':'將軍澳','ABERDEEN':'香港仔','NORTH POINT':'北角',
  'CAUSEWAY BAY':'銅鑼灣','CENTRAL':'中環','WAN CHAI':'灣仔','SAI YING PUN':'西營盤',
  'KOWLOON CITY':'九龍城','WONG TAI SIN':'黃大仙','NGAU TAU KOK':'牛頭角',
  'SHEUNG SHUI':'上水','FANLING':'粉嶺','TSIM SHA TSUI':'尖沙咀','JORDAN':'佐敦',
  'TO KWA WAN':'土瓜灣','CHAI WAN':'柴灣','SHEK TONG TSUI':'石塘咀',
  'LAM TIN':'藍田','SAU MAU PING':'秀茂坪','TAI WAI':'大圍','MA ON SHAN':'馬鞍山',
  'TUNG CHUNG':'東涌','TIN SHUI WAI':'天水圍','HUNG HOM':'紅磡','CHEUNG SHA WAN':'長沙灣',
};

function cleanAddr(addr) {
  return addr.replace(/^(SHOP\s+\S+,?\s*|FLAT\s+\S+,?\s*|UNIT\s+\S+,?\s*|PORTION\s+OF\s+\S+,?\s*)*\s*(G\/F|GROUND\s+FLOOR|\d+\/F|\d+ST\s+FLOOR|\d+ND\s+FLOOR|\d+RD\s+FLOOR|\d+TH\s+FLOOR)\s*,?\s*/i, '')
    .replace(/,\s*(HK|KLN|NT)\s*$/i, '')
    .trim();
}

async function showTransitRoute(pharmacy) {
  const { bubble, content } = createBotBubble();
  content.textContent = '正在获取位置并规划公交路线...';
  scrollBottom();

  try {
    let origin;
    try {
      origin = await getUserLocation();
    } catch {
      origin = DISTRICT_ZH[pharmacy.district] || pharmacy.district.replace(/\s+/g, ' ');
    }
    const dest = cleanAddr(pharmacy.addr);
    const routeData = await planRoute(origin, dest);
    content.textContent = '';
    renderRouteCard(bubble, routeData, pharmacy);
  } catch (err) {
    content.textContent = `路线查询失败: ${err.message}`;
  }
  addTimeStamp(bubble);
  scrollBottom();
}

// ── Main send ──
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;
  appendUserMsg(text);
  inputEl.value = ''; inputEl.style.height = 'auto';
  conversationHistory.push({ role: 'user', content: text });

  isStreaming = true;
  sendBtn.disabled = true;
  typingEl.classList.add('active');

  let sysPrompt = SYSTEM_PROMPT;
  const extraEl = document.getElementById('sysPromptExtra');
  if (extraEl?.value.trim()) sysPrompt += '\n\n【附加指令】\n' + extraEl.value.trim();

  if (pendingFollowup) {
    const pf = pendingFollowup;
    sysPrompt += `\n\n【待跟进记录】
用户之前说: "${pf.ot}"
已知: what=${pf.what || '?'}, onset=${pf.onset || '?'}, char=${pf.char || '?'}, impact=${pf.impact || '?'}, ctx=${pf.ctx || '?'}, prog=${pf.prog || '?'}
缺失字段: ${pf.miss}
用户现在的消息可能是在回答追问。如果是，合并信息后 lv 改为 L1 记录；如果用户在说别的事，按新消息处理。`;
  }

  const temperature = parseFloat(document.getElementById('tempInput')?.value) || 0.7;
  const apiMessages = [{ role: 'system', content: sysPrompt }, ...conversationHistory];

  try {
    const resp = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages, temperature, stream: true })
    });
    if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);
    typingEl.classList.remove('active');

    const { bubble, content } = createBotBubble();
    let fullText = '', metaParsed = false, displayText = '';

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t || !t.startsWith('data: ')) continue;
        const d = t.slice(6);
        if (d === '[DONE]') continue;
        try {
          const delta = JSON.parse(d).choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            if (!metaParsed && fullText.includes('</m>')) {
              metaParsed = true;
            }
            if (metaParsed) {
              displayText = fullText.replace(/<m>[\s\S]*?<\/m>/, '').trim();
              content.textContent = displayText;
            }
            scrollBottom();
          }
        } catch {}
      }
    }

    if (!metaParsed) { displayText = fullText; content.textContent = displayText; }
    addTimeStamp(bubble);

    const { meta } = parseMeta(fullText);
    if (meta) handleMeta(meta, bubble);

    // Visit prep flow
    if (meta?.intent === 'visit_prep' && !visitPrepState) {
      visitPrepState = { topic: null };
    } else if (visitPrepState && !visitPrepState.topic) {
      visitPrepState.topic = text;
      const events = db.getEvents();
      const topicLower = text.toLowerCase();
      const related = events.filter(e =>
        (e.original_text?.toLowerCase().includes(topicLower)) ||
        (e.standard_concept?.toLowerCase().includes(topicLower)) ||
        (e.structured?.what?.toLowerCase().includes(topicLower))
      );
      const selected = related.length ? related : events.slice(0, 5);
      const draftId = uuid();
      renderVisitDraftCard(bubble, text, selected, draftId,
        () => confirmVisitBrief(text, selected),
        () => { visitPrepState = null; const { content: c } = createBotBubble(); c.textContent = '好的，已取消。'; }
      );
      visitPrepState = { draftId, topic: text, events: selected };
    }

    const speakBtn = addSpeakButton(bubble, displayText, speak, stopSpeaking);
    conversationHistory.push({ role: 'assistant', content: displayText });

    if (autoTts && displayText) {
      speakBtn.classList.add('speaking');
      const u = speak(displayText); u.onend = () => speakBtn.classList.remove('speaking');
    }
  } catch (err) {
    typingEl.classList.remove('active');
    const { bubble, content } = createBotBubble();
    content.textContent = `Error: ${err.message}`;
    addTimeStamp(bubble);
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    inputEl.focus();
  }
}
