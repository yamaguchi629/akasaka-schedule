const HOUR_START = 8;
const HOUR_END = 22;
const HOUR_HEIGHT = 30; // px per hour
const DAYS = ['日', '月', '火', '水', '木', '金', '土'];

// 人ごとの色（名前ハッシュで決定）
function colorForName(name) {
  const palette = [
    '#e74c3c', '#2980b9', '#27ae60', '#8e44ad',
    '#d35400', '#16a085', '#c0392b', '#2471a3',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return palette[hash % palette.length];
}

function jstDate(utcString) {
  const d = new Date(utcString);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

function weekStart(anchor) {
  const d = new Date(anchor);
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d;
}

let currentAnchor = new Date();

async function fetchReservations(start, end) {
  const url = `/api/reservations?start=${start.toISOString()}&end=${end.toISOString()}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  return res.json();
}

function buildCalendar(weekSunday, reservations) {
  const cal = document.getElementById('calendar');
  cal.innerHTML = '<div id="loading">読み込み中...</div>';

  // 週の7日
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekSunday);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ヘッダー行
  const header = document.createElement('div');
  header.className = 'cal-header-row';
  header.innerHTML = '<div class="cal-header-cell"></div>';
  days.forEach((d) => {
    const cell = document.createElement('div');
    cell.className = 'cal-header-cell';
    if (d.toDateString() === today.toDateString()) cell.classList.add('today');
    cell.textContent = `${d.getMonth() + 1}/${d.getDate()}(${DAYS[d.getDay()]})`;
    header.appendChild(cell);
  });

  // ボディ
  const body = document.createElement('div');
  body.className = 'cal-body';

  const totalHours = HOUR_END - HOUR_START;

  // 時間ラベル + 各日カラム（positionをabsoluteで使うためのコンテナ）
  const timeCol = document.createElement('div');
  timeCol.style.cssText = 'grid-column:1; display:flex; flex-direction:column;';
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    const lbl = document.createElement('div');
    lbl.className = 'time-label';
    lbl.style.height = HOUR_HEIGHT + 'px';
    lbl.textContent = `${h}:00`;
    timeCol.appendChild(lbl);
  }
  body.appendChild(timeCol);

  // 日カラム
  const dayContainers = days.map((d, idx) => {
    const col = document.createElement('div');
    col.style.cssText = `grid-column:${idx + 2}; position:relative; border-right:1px solid #e8e8e8;`;
    const totalPx = totalHours * HOUR_HEIGHT;
    col.style.height = totalPx + HOUR_HEIGHT + 'px';

    // 時間帯の区切り線
    for (let h = 0; h <= totalHours; h++) {
      const line = document.createElement('div');
      line.style.cssText = `position:absolute; top:${h * HOUR_HEIGHT}px; left:0; right:0; border-top:1px solid ${h === 0 ? '#e0e0e0' : '#f0f0f0'};`;
      col.appendChild(line);
    }

    body.appendChild(col);
    return { col, date: d };
  });

  // 予約ブロック配置
  const colorMap = {};
  reservations.forEach((r) => {
    const s = jstDate(r.start_time);
    const e = jstDate(r.end_time);

    const dayIdx = dayContainers.findIndex((dc) => {
      const dc_date = dc.date;
      return (
        dc_date.getFullYear() === s.getUTCFullYear() &&
        dc_date.getMonth() === s.getUTCMonth() &&
        dc_date.getDate() === s.getUTCDate()
      );
    });
    if (dayIdx < 0) return;

    const startH = s.getUTCHours();
    const startM = s.getUTCMinutes();
    const endH = e.getUTCHours();
    const endM = e.getUTCMinutes();

    const topPx = (startH - HOUR_START) * HOUR_HEIGHT + (startM / 60) * HOUR_HEIGHT;
    const heightPx = ((endH - startH) * 60 + (endM - startM)) / 60 * HOUR_HEIGHT;

    if (topPx < 0 || heightPx <= 0) return;

    const color = colorForName(r.user_name);
    colorMap[r.user_name] = color;

    const block = document.createElement('div');
    block.className = 'reservation-block';
    block.style.cssText = `top:${topPx}px; height:${Math.max(heightPx, 20)}px; background:${color};`;
    const label = r.memo ? `${r.user_name}\n${r.memo}` : r.user_name;
    block.title = `${r.user_name}\n${startH}:${String(startM).padStart(2,'0')}〜${endH}:${String(endM).padStart(2,'0')}${r.memo ? '\n' + r.memo : ''}`;
    block.style.whiteSpace = 'pre-line';
    block.textContent = heightPx >= 24 ? label : '';
    block.style.cursor = 'pointer';
    block.addEventListener('click', () => showDeleteModal(r, startH, startM, endH, endM));

    dayContainers[dayIdx].col.appendChild(block);
  });

  // 凡例
  const legend = document.getElementById('legend');
  legend.innerHTML = '';
  Object.entries(colorMap).forEach(([name, color]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-dot" style="background:${color}"></div><span>${name}</span>`;
    legend.appendChild(item);
  });

  const grid = document.createElement('div');
  grid.className = 'cal-grid';
  grid.appendChild(header);
  grid.appendChild(body);

  cal.innerHTML = '';
  cal.appendChild(grid);
}

function updateWeekLabel(sunday) {
  const sat = new Date(sunday);
  sat.setDate(sat.getDate() + 6);
  document.getElementById('weekLabel').textContent =
    `${sunday.getMonth() + 1}/${sunday.getDate()} 〜 ${sat.getMonth() + 1}/${sat.getDate()}`;
}

async function renderWeek(anchor) {
  const sunday = weekStart(anchor);
  updateWeekLabel(sunday);

  const end = new Date(sunday);
  end.setDate(end.getDate() + 7);

  const reservations = await fetchReservations(sunday, end);
  buildCalendar(sunday, reservations);
}

document.getElementById('prevWeek').addEventListener('click', () => {
  currentAnchor.setDate(currentAnchor.getDate() - 7);
  renderWeek(currentAnchor);
});

document.getElementById('nextWeek').addEventListener('click', () => {
  currentAnchor.setDate(currentAnchor.getDate() + 7);
  renderWeek(currentAnchor);
});

function toLocalDatetimeValue(utcString) {
  const d = jstDate(utcString);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth()+1).padStart(2,'0');
  const dy = String(d.getUTCDate()).padStart(2,'0');
  const h = String(d.getUTCHours()).padStart(2,'0');
  const m = String(d.getUTCMinutes()).padStart(2,'0');
  return `${y}-${mo}-${dy}T${h}:${m}`;
}

function localDatetimeToUTC(val) {
  const [datePart, timePart] = val.split('T');
  const [y, mo, dy] = datePart.split('-').map(Number);
  const [h, m] = timePart.split(':').map(Number);
  return new Date(Date.UTC(y, mo-1, dy, h-9, m)).toISOString();
}

function showDeleteModal(r, startH, startM, endH, endM) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const s = jstDate(r.start_time);
  const dateStr = `${s.getUTCMonth()+1}/${s.getUTCDate()} ${startH}:${String(startM).padStart(2,'0')}〜${endH}:${String(endM).padStart(2,'0')}`;
  const memoStr = r.memo ? `<br>メモ: ${r.memo}` : '';

  overlay.innerHTML = `
    <div class="modal">
      <h3>${r.user_name} の予約</h3>
      <p>${dateStr}${memoStr}</p>
      <div class="modal-buttons">
        <button class="btn-cancel">閉じる</button>
        <button class="btn-edit">変更</button>
        <button class="btn-delete">削除</button>
      </div>
    </div>`;

  overlay.querySelector('.btn-cancel').addEventListener('click', () => overlay.remove());

  overlay.querySelector('.btn-delete').addEventListener('click', async () => {
    if (!confirm('この予約を削除しますか？')) return;
    const res = await fetch(`/api/delete-reservation?id=${r.id}`, { method: 'DELETE' });
    if (res.ok) { overlay.remove(); renderWeek(currentAnchor); }
    else { alert('削除に失敗しました。'); overlay.remove(); }
  });

  overlay.querySelector('.btn-edit').addEventListener('click', () => {
    overlay.remove();
    showEditModal(r);
  });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function showEditModal(r) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal">
      <h3>予約を変更</h3>
      <label>開始日時</label>
      <input type="datetime-local" id="edit-start" value="${toLocalDatetimeValue(r.start_time)}" step="900">
      <label>終了日時</label>
      <input type="datetime-local" id="edit-end" value="${toLocalDatetimeValue(r.end_time)}" step="900">
      <label>メモ（任意）</label>
      <input type="text" id="edit-memo" value="${r.memo || ''}" placeholder="会議・打ち合わせ など">
      <div class="modal-buttons">
        <button class="btn-cancel">キャンセル</button>
        <button class="btn-edit">保存する</button>
      </div>
    </div>`;

  overlay.querySelector('.btn-cancel').addEventListener('click', () => overlay.remove());

  overlay.querySelector('.btn-edit').addEventListener('click', async () => {
    const startVal = overlay.querySelector('#edit-start').value;
    const endVal = overlay.querySelector('#edit-end').value;
    const memo = overlay.querySelector('#edit-memo').value;

    if (!startVal || !endVal) { alert('日時を入力してください'); return; }

    const btn = overlay.querySelector('.btn-edit');
    btn.textContent = '保存中...';
    btn.disabled = true;

    const res = await fetch('/api/update-reservation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: r.id,
        start_time: localDatetimeToUTC(startVal),
        end_time: localDatetimeToUTC(endVal),
        memo,
      }),
    });

    if (res.ok) {
      overlay.remove();
      renderWeek(currentAnchor);
    } else {
      const data = await res.json();
      alert(data.error || '保存に失敗しました。');
      btn.textContent = '保存する';
      btn.disabled = false;
    }
  });

  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// 初期表示
renderWeek(currentAnchor);

// 5分ごとに自動更新
setInterval(() => renderWeek(currentAnchor), 5 * 60 * 1000);
