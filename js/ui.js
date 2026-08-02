import { timeStr, dateStr } from './db.js';
import { DISCLAIMER } from './config.js';
import { getSaleCatInfo } from './drugdb.js';

const messagesEl = document.getElementById('messages');

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

export function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }

export function appendUserMsg(text) {
  const w = messagesEl.querySelector('.welcome'); if (w) w.remove();
  const div = document.createElement('div'); div.className = 'message user';
  div.innerHTML = `<div class="msg-avatar">&#x1F9D1;</div><div class="bubble">${esc(text)}<span class="time">${timeStr()}</span></div>`;
  messagesEl.appendChild(div); scrollBottom();
}

export function createBotBubble() {
  const w = messagesEl.querySelector('.welcome'); if (w) w.remove();
  const div = document.createElement('div'); div.className = 'message bot';
  const bubble = document.createElement('div'); bubble.className = 'bubble';
  const content = document.createElement('span'); content.className = 'content';
  bubble.appendChild(content);
  div.innerHTML = '<div class="msg-avatar">&#x1F916;</div>';
  div.appendChild(bubble);
  messagesEl.appendChild(div); scrollBottom();
  return { div, bubble, content };
}

export function addTimeStamp(bubble) {
  bubble.appendChild(Object.assign(document.createElement('span'), { className: 'time', textContent: timeStr() }));
}

export function addSpeakButton(bubble, text, speakFn, stopFn) {
  const actions = document.createElement('div'); actions.className = 'bubble-actions';
  const btn = document.createElement('button'); btn.textContent = '🔊';
  btn.onclick = () => {
    if (btn.classList.contains('speaking')) { stopFn(); }
    else { stopFn(); btn.classList.add('speaking'); const u = speakFn(text); u.onend = () => btn.classList.remove('speaking'); }
  };
  actions.appendChild(btn); bubble.appendChild(actions);
  return btn;
}

export function renderHealthCard(bubble, event) {
  const card = document.createElement('div'); card.className = 'card card-health';
  card.innerHTML = `<div class="card-title">&#x1F4CB; 已记下</div>
<div class="card-detail">${esc(event.original_text)}</div>
${event.standard_concept ? `<div class="card-concept">${esc(event.standard_concept)} (仅供参考，非诊断)</div>` : ''}
<div class="card-detail" style="margin-top:3px">${event.status === 'ongoing' ? '🟢 仍在发生' : '⚪ 已缓解'}</div>`;
  bubble.appendChild(card);
}

export function renderPendingCard(bubble) {
  const card = document.createElement('div'); card.className = 'card card-pending';
  card.innerHTML = `<div class="card-title">&#x23F3; 记录中...</div><div class="card-detail">等待补充信息后记录</div>`;
  bubble.appendChild(card);
}

export function renderVisitDraftCard(bubble, topic, events, draftId, onConfirm, onCancel) {
  const card = document.createElement('div'); card.className = 'card card-visit';
  const evList = events.length ? events.map(e =>
    `<div style="padding:3px 0;font-size:11px">• ${dateStr(e.recorded_at)} — ${esc(e.original_text)}</div>`
  ).join('') : '<div style="font-size:11px;opacity:.6">暂无相关记录</div>';

  card.innerHTML = `<div class="card-title">&#x1F4CB; 问诊资料草稿</div>
<div class="card-detail">主题: ${esc(topic)}</div>
<div style="margin-top:6px"><strong style="font-size:11px">相关健康记录:</strong>${evList}</div>
<div class="card-actions">
  <button class="btn-confirm" id="confirm-${draftId}">确认生成摘要</button>
  <button class="btn-cancel" id="cancel-${draftId}">取消</button>
</div>`;
  bubble.appendChild(card);

  card.querySelector(`#confirm-${draftId}`).onclick = onConfirm;
  card.querySelector(`#cancel-${draftId}`).onclick = onCancel;
}

export function renderVisitBriefCard(bubble, brief) {
  const card = document.createElement('div'); card.className = 'card card-visit';
  card.innerHTML = `<div class="card-title">&#x1F4CB; 问诊摘要</div>
<div class="brief-content">${esc(brief.content)}</div>
<div class="brief-disclaimer">&#x26A0;&#xFE0F; ${DISCLAIMER}</div>`;
  bubble.appendChild(card);
}

export function renderDrugResults(bubble, drugs, onFindPharmacy) {
  if (!drugs.length) {
    const card = document.createElement('div');
    card.className = 'card card-pending';
    card.innerHTML = '<div class="card-title">&#x1F50D; 未找到匹配药品</div><div class="card-detail">请尝试用英文药名或成分名搜索</div>';
    bubble.appendChild(card);
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'drug-results';

  drugs.forEach((d, idx) => {
    const cat = getSaleCatInfo(d.s);
    const card = document.createElement('div');
    card.className = 'card card-drug';
    card.innerHTML = `<div class="card-title"><span class="cat-badge ${cat.cls}">${esc(cat.short)}</span> ${esc(d.n)}</div>
<div class="card-detail">${esc(d.p)} · ${esc(d.i.join(', '))}</div>
<div class="card-concept">${esc(cat.tip)}</div>
<div class="card-actions"><button class="btn-confirm find-ph-btn" data-idx="${idx}">&#x1F3E5; 查找药房</button></div>`;
    wrap.appendChild(card);
  });

  bubble.appendChild(wrap);

  wrap.querySelectorAll('.find-ph-btn').forEach(btn => {
    btn.onclick = () => {
      const d = drugs[parseInt(btn.dataset.idx)];
      if (onFindPharmacy) onFindPharmacy(d);
    };
  });
}

export function renderPharmacyResults(bubble, pharmacies, saleCat) {
  if (!pharmacies.length) {
    const card = document.createElement('div');
    card.className = 'card card-pending';
    card.innerHTML = '<div class="card-title">&#x1F3E5; 未找到附近药房</div><div class="card-detail">请尝试其他地区</div>';
    bubble.appendChild(card);
    return;
  }

  const catInfo = getSaleCatInfo(saleCat || 'OTC');
  const wrap = document.createElement('div');
  wrap.className = 'pharmacy-results';

  const header = document.createElement('div');
  header.className = 'card card-visit';
  header.innerHTML = `<div class="card-title">&#x1F3E5; 附近注册药房 (${pharmacies.length}间)</div>
<div class="card-detail">销售类别: <span class="cat-badge ${catInfo.cls}">${esc(catInfo.short)}</span> ${esc(catInfo.label)}</div>`;
  wrap.appendChild(header);

  pharmacies.forEach(p => {
    const card = document.createElement('div');
    card.className = 'card card-pharmacy';
    const mapQ = encodeURIComponent(p.addr);
    card.innerHTML = `<div class="card-title">${esc(p.nameZh || p.name)}</div>
${p.nameZh ? `<div class="card-detail">${esc(p.name)}</div>` : ''}
<div class="card-detail">&#x1F4CD; ${esc(p.addr)}</div>
${p.tel ? `<div class="card-detail">&#x1F4DE; <a href="tel:${esc(p.tel)}" class="ph-link">${esc(p.tel)}</a></div>` : ''}
<div class="card-detail">&#x1F4CD; ${esc(p.district)}</div>
<div class="card-actions"><a class="btn-confirm ph-route-btn" href="https://www.google.com/maps/search/?api=1&query=${mapQ}" target="_blank" rel="noopener">&#x1F697; 路线导航</a></div>`;
    wrap.appendChild(card);
  });

  bubble.appendChild(wrap);
}

export function renderRecordsList(containerEl, events) {
  if (!events.length) {
    containerEl.innerHTML = '<div class="records-empty">暂无健康记录<br>在聊天中描述你的身体状况即可自动记录</div>';
    return;
  }
  containerEl.innerHTML = events.map(e => `
    <div class="record-item ${e.status === 'resolved' ? 'resolved' : ''}">
      <div class="rec-text">${esc(e.original_text)}</div>
      ${e.standard_concept ? `<div class="rec-concept">${esc(e.standard_concept)} (非诊断)</div>` : ''}
      <div class="rec-meta">
        <span>${dateStr(e.recorded_at)}</span>
        <span class="rec-status ${e.status}">${e.status === 'ongoing' ? '仍在发生' : '已缓解'}</span>
      </div>
    </div>
  `).join('');
}
