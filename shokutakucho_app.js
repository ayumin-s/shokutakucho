// ============================================================
// ▼▼▼ ここだけ書き換えてください ▼▼▼
const SUPABASE_URL = 'https://uxtahnqledjyrbttpckp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_9uBKiV3A21y3_3E03m87EQ_BWRQimxe';
// ▲▲▲ ここだけ書き換えてください ▲▲▲
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function fatal(msg) {
  document.querySelector('main').innerHTML =
    `<div class="err" style="padding:30px 0;">${msg}</div>`;
  throw new Error(msg);
}
if (SUPABASE_URL.includes('ここに') || SUPABASE_ANON_KEY.includes('ここに')) {
  fatal('app.js の冒頭にある SUPABASE_URL と SUPABASE_ANON_KEY を、<br>Supabaseの値に書き換えてください。');
}
window.addEventListener('error', e => {
  const m = document.querySelector('main');
  if (m && !m.querySelector('.err')) m.innerHTML = `<div class="err" style="padding:30px 0;">${e.message}</div>`;
});

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SCENES = [
  ['morning', 'MORNING', 'モーニング'],
  ['lunch', 'LUNCH', 'ランチ'],
  ['cafe', 'CAFE', 'カフェ'],
  ['dinner', 'DINNER', 'ディナー'],
  ['drinks', 'DRINKS', 'のみ'],
  ['special', 'SPECIAL', '特別'],
];
const PRIO = [['now', 'now'], ['soon', 'soon'], ['someday', 'someday']];

const S = {
  me: null, profile: null,
  tab: 'table',
  owner: null,            // 表示中の持ち主（自分 or 共有相手）
  owners: [],             // 自分＋共有してくれている人
  meals: [], shops: [],
  scene: null, sceneState: 'all', area: '', q: '', sort: 'recent',
  picking: false, picked: new Set(),
  form: null, detailId: null,
};

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const sceneLabel = k => (SCENES.find(s => s[0] === k) || [])[1] || k;
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? iso : `${d.getMonth() + 1}.${d.getDate()}`; };
const monthKey = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getFullYear()}. ${pad(d.getMonth() + 1)}`; };
const isMine = () => S.owner === S.me?.id;
const mapUrl = s => s.url && s.url.trim()
  ? s.url.trim()
  : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([s.name, s.area].filter(Boolean).join(' '));

function compress(file, max = 760, q = 0.62) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error('読み込み失敗'));
    r.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('画像失敗'));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
        else if (h > max) { w = Math.round(w * max / h); h = max; }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        res(cv.toDataURL('image/jpeg', q));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
const photosOf = o => Array.isArray(o?.photos) && o.photos.length ? o.photos
  : (o?.photo ? [{ src: o.photo, pos: '50% 50%' }] : []);
const firstPhoto = o => photosOf(o)[0] || null;

function galleryHtml(o, h) {
  const ps = photosOf(o);
  if (!ps.length) return '';
  if (ps.length === 1)
    return `<img src="${ps[0].src}" alt="" style="height:${h}px;object-position:${ps[0].pos || '50% 50%'};">`;
  return `<div class="gallery" style="height:${h}px;">${ps.map(p =>
    `<img src="${p.src}" alt="" style="object-position:${p.pos || '50% 50%'};">`).join('')}</div>`;
}

function pickPhoto(cb) {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = 'image/*';
  i.onchange = async () => {
    const f = i.files[0];
    if (!f) return;
    try { cb(await compress(f)); } catch (e) { alert('画像を読み込めませんでした'); }
  };
  i.click();
}

// ---- 画面切り替え -------------------------------------------
function show(view) {
  ['authView', 'pendingView', 'tableView', 'shopsView', 'menuView', 'formView', 'detailView']
    .forEach(v => $(v).classList.toggle('hide', v !== view));
  const inApp = ['tableView', 'shopsView', 'menuView'].includes(view);
  $('nav').classList.toggle('hide', !['tableView', 'shopsView', 'menuView', 'formView', 'detailView'].includes(view));
  $('fab').classList.toggle('hide', !(inApp && isMine() && view !== 'menuView'));
  $('fabmenu').classList.add('hide');
  window.scrollTo(0, 0);
}
function setTab(tab) {
  S.tab = tab;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'table') renderTable();
  else if (tab === 'shops') renderShops();
  else renderMenu();
}
document.querySelectorAll('#nav button').forEach(b => b.onclick = () => setTab(b.dataset.tab));

// ---- 認証 ----------------------------------------------------
let authMode = 'signin';
$('toggleAuth').onclick = () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  const up = authMode === 'signup';
  $('authLead').innerHTML = up
    ? 'メールアドレスとパスワードを決めてください。<br>登録後、管理者の承認をお待ちいただきます。'
    : 'メールアドレスとパスワードでログインしてください。';
  $('authBtn').textContent = up ? '登録する' : 'ログイン';
  $('toggleAuth').textContent = up ? 'すでに登録済みの方はこちら' : 'はじめての方はこちら（新規登録）';
  $('authMsg').classList.add('hide');
};
$('authBtn').onclick = async () => {
  const email = $('email').value.trim(), password = $('password').value;
  const msg = $('authMsg');
  if (!email || !password) { msg.textContent = 'メールアドレスとパスワードを入力してください。'; msg.classList.remove('hide'); return; }
  $('authBtn').disabled = true; $('authBtn').textContent = '通信中…';
  const { data, error } = authMode === 'signup'
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });
  $('authBtn').disabled = false;
  $('authBtn').textContent = authMode === 'signup' ? '登録する' : 'ログイン';
  if (error) {
    msg.textContent = error.message.includes('Invalid login') ? 'メールアドレスかパスワードが違います。'
      : error.message.includes('already registered') ? 'このメールアドレスは登録済みです。'
        : error.message;
    msg.classList.remove('hide');
    return;
  }
  if (authMode === 'signup' && !data.session) {
    msg.textContent = '確認メールを送りました。リンクを開いてからログインしてください。';
    msg.classList.remove('hide');
    return;
  }
  $('password').value = '';
  await start();
};
$('pendingSignout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

// ---- 読み込み ------------------------------------------------
async function loadOwners() {
  S.owners = [{ id: S.me.id, label: '自分' }];
  const { data } = await sb.from('shares').select('owner_id, share_table, share_shops')
    .eq('viewer_id', S.me.id).eq('status', 'active');
  if (!data?.length) return;
  const ids = data.map(d => d.owner_id);
  const { data: ps } = await sb.from('profiles').select('id, email, display_name').in('id', ids);
  data.forEach(d => {
    const p = ps?.find(x => x.id === d.owner_id);
    S.owners.push({
      id: d.owner_id,
      label: p?.display_name || p?.email?.split('@')[0] || 'ゲスト',
      table: d.share_table, shops: d.share_shops
    });
  });
}
async function loadData() {
  const [m, s] = await Promise.all([
    sb.from('meals').select('*').eq('user_id', S.owner).order('date', { ascending: false }),
    sb.from('shops').select('*').eq('user_id', S.owner).order('created_at', { ascending: false }),
  ]);
  S.meals = m.data || [];
  S.shops = s.data || [];
}

// ---- 持ち主の切り替え ----------------------------------------
function ownerSwitchHtml() {
  if (S.owners.length < 2) return '';
  return `<div class="owner-switch">${S.owners.map(o =>
    `<button data-owner="${o.id}" class="${o.id === S.owner ? 'on' : ''}">${esc(o.label)}</button>`).join('')}</div>`;
}
function bindOwnerSwitch(root) {
  root.querySelectorAll('[data-owner]').forEach(b => b.onclick = async () => {
    S.owner = b.dataset.owner;
    await loadData();
    setTab(S.tab);
  });
}

// ---- 食卓 ----------------------------------------------------
function bindTableRows(v) {
  v.querySelectorAll('[data-shop]').forEach(b => b.onclick = e => { e.stopPropagation(); openShop(b.dataset.shop); });
  v.querySelectorAll('[data-meal]').forEach(a => a.onclick = () => {
    if (isMine()) openMealForm(S.meals.find(m => m.id === a.dataset.meal));
  });
}
// 日本語入力を壊さない検索欄
function bindSearch(inp, cb) {
  if (!inp) return;
  let composing = false;
  inp.addEventListener('compositionstart', () => composing = true);
  inp.addEventListener('compositionend', () => { composing = false; cb(inp.value); });
  inp.addEventListener('input', () => { if (!composing) cb(inp.value); });
}
function renderTable(keepInput) {
  const q = S.q.trim().toLowerCase();
  const rows = S.meals.filter(m => !q ||
    [m.title, m.memo, m.tags].some(v => (v || '').toLowerCase().includes(q)) ||
    (shopOf(m)?.name || '').toLowerCase().includes(q));

  let listHtml = '';
  if (!rows.length) {
    listHtml += `<div class="empty">${S.meals.length ? '見つかりませんでした' : 'まだ記録がありません。<br>右下の＋から始めましょう。'}</div>`;
  } else {
    let cur = '';
    rows.forEach(m => {
      const mk = monthKey(m.date);
      if (mk !== cur) { cur = mk; listHtml += `<div class="month">${mk}</div>`; }
      const shop = shopOf(m);
      listHtml += `<article class="meal" data-meal="${m.id}">
        ${galleryHtml(m, 210)}
        <div class="kind">${m.kind === 'cooked' ? 'COOKED' : 'TASTED'}</div>
        <h3>${esc(m.title)}</h3>
        ${m.memo ? `<p>${esc(m.memo)}</p>` : ''}
        <div class="foot">
          <span>${fmtDate(m.date)}</span>
          ${shop ? `<span style="color:var(--line)">|</span><button class="shoplink" data-shop="${shop.id}">${m.kind === 'cooked' ? '参考 ・ ' : ''}${esc(shop.name)}</button>` : ''}
          ${m.rating ? `<span style="color:var(--rose);letter-spacing:.1em;">${'★'.repeat(m.rating)}</span>` : ''}
          ${isMine() ? `<span class="en" style="margin-left:auto;font-size:11px;color:var(--rose-l);">EDIT</span>` : ''}
        </div>
      </article>`;
    });
  }
  const html = ownerSwitchHtml()
    + `<div class="bar"><input id="tq" placeholder="料理・お店・タグで探す" value="${esc(S.q)}"></div>`
    + `<div id="tList">${listHtml}</div>`;
  const v = $('tableView');
  if (keepInput && v.querySelector('#tList')) {
    v.querySelector('#tList').innerHTML = listHtml;
  } else {
    v.innerHTML = html;
    bindOwnerSwitch(v);
    bindSearch(v.querySelector('#tq'), val => { S.q = val; renderTable(true); });
  }
  bindTableRows(v);
  show('tableView');
}
const shopOf = m => S.shops.find(s => s.id === m.shop_id);

// ---- お店 ----------------------------------------------------
function renderShops(keepInput) {
  const q = S.q.trim().toLowerCase();
  let rows = S.shops.filter(s => {
    if (S.sceneState === 'archived') { if (s.state !== 'archived') return false; }
    else if (s.state === 'archived') return false;
    if (S.sceneState === 'wish' && s.state !== 'wish') return false;
    if (S.sceneState === 'visited' && s.state !== 'visited') return false;
    if (S.scene && !(s.scenes || []).includes(S.scene)) return false;
    if (S.area && s.area !== S.area) return false;
    if (q && ![s.name, s.memo, s.area, s.tags].some(v => (v || '').toLowerCase().includes(q))) return false;
    return true;
  });
  rows = sortShops(rows);

  const areas = [...new Set(S.shops.map(s => s.area).filter(Boolean))].sort();

  let listHtml = '';
  if (!rows.length) {
    listHtml += `<div class="empty">${S.shops.length ? '見つかりませんでした' : 'まだお店がありません。<br>右下の＋から登録しましょう。'}</div>`;
  } else {
    rows.forEach(s => {
      const st = visitStats(s.id);
      listHtml += `<article class="shop" data-open="${s.id}">
        ${galleryHtml(s, 150)}
        <div class="head">
          ${S.picking ? `<button class="check" data-pick="${s.id}">${S.picked.has(s.id) ? '✓' : ''}</button>` : ''}
          ${s.state === 'wish' ? `<span class="hand" style="font-size:14px;color:var(--rose);">${s.priority || 'someday'}</span>` : ''}
          <span class="name">${esc(s.name)}</span>
          ${st.count ? `<span class="en" style="font-size:10px;color:var(--rose-l);">★${st.avg}</span>` : ''}
          <span class="badge ${s.state === 'wish' ? 'wish' : 'visited'}">${s.state === 'wish' ? 'まだ' : `${st.count}回`}</span>
        </div>
        <div class="meta">${[esc(s.area || ''), (s.scenes || []).map(sceneLabel).join(' ・ ')].filter(Boolean).join('　')}</div>
        ${s.memo ? `<div class="memo">${esc(s.memo)}</div>` : ''}
        <div class="acts">
          <a href="${esc(mapUrl(s))}" target="_blank" rel="noopener" data-stop>MAP</a>
          ${isMine() ? `<button data-edit="${s.id}">EDIT</button>` : ''}
          ${isMine() && s.state === 'wish' ? `<button data-visit="${s.id}">VISITED</button>` : ''}
        </div>
      </article>`;
    });
  }

  const v = $('shopsView');
  if (keepInput && v.querySelector('#sList')) {
    v.querySelector('#sList').innerHTML = listHtml;
    bindShopRows(v);
    return;
  }

  let html = ownerSwitchHtml();
  html += `<div class="scenes">${SCENES.map(([k, en]) =>
    `<button class="scene ${S.scene === k ? 'on' : ''}" data-scene="${k}">${en}</button>`).join('')}</div>`;
  html += `<div class="subfilter">
    ${[['all', 'ALL'], ['wish', 'WISH'], ['visited', 'VISITED'], ['archived', 'ARCHIVE']].map(([k, l]) =>
    `<button data-state="${k}" class="${S.sceneState === k ? 'on' : ''}">${l}</button>`).join('')}
  </div>`;
  html += `<div class="bar">
    <input id="sq" placeholder="店名・メモで探す" value="${esc(S.q)}">
    <select id="areaSel"><option value="">エリア</option>${areas.map(a =>
    `<option value="${esc(a)}" ${S.area === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>
    <select id="sortSel">
      <option value="recent" ${S.sort === 'recent' ? 'selected' : ''}>新着</option>
      <option value="rating" ${S.sort === 'rating' ? 'selected' : ''}>評価</option>
      <option value="stale" ${S.sort === 'stale' ? 'selected' : ''}>ごぶさた</option>
    </select>
  </div>`;

  if (isMine()) {
    html += `<div class="subfilter" style="margin-bottom:20px;">
      <button id="pickBtn" class="${S.picking ? 'on' : ''}">${S.picking ? `SHARE ${S.picked.size}` : 'SELECT TO SHARE'}</button>
      ${S.picking ? `<button id="pickCancel">CANCEL</button>` : ''}
    </div>`;
  }

  html += `<div id="sList">${listHtml}</div>`;

  v.innerHTML = html;
  bindOwnerSwitch(v);
  v.querySelectorAll('[data-scene]').forEach(b => b.onclick = () => {
    S.scene = S.scene === b.dataset.scene ? null : b.dataset.scene; renderShops();
  });
  v.querySelectorAll('[data-state]').forEach(b => b.onclick = () => { S.sceneState = b.dataset.state; renderShops(); });
  bindSearch(v.querySelector('#sq'), val => { S.q = val; renderShops(true); });
  const as = v.querySelector('#areaSel');
  if (as) as.onchange = e => { S.area = e.target.value; renderShops(); };
  const ss = v.querySelector('#sortSel');
  if (ss) ss.onchange = e => { S.sort = e.target.value; renderShops(); };
  const pb = v.querySelector('#pickBtn');
  if (pb) pb.onclick = () => {
    if (S.picking && S.picked.size) return shareSheet();
    S.picking = true; S.picked.clear(); renderShops();
  };
  const pc = v.querySelector('#pickCancel');
  if (pc) pc.onclick = () => { S.picking = false; S.picked.clear(); renderShops(); };
  bindShopRows(v);
  show('shopsView');
}
function bindShopRows(v) {
  v.querySelectorAll('[data-pick]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const id = b.dataset.pick;
    S.picked.has(id) ? S.picked.delete(id) : S.picked.add(id);
    renderShops();
  });
  v.querySelectorAll('[data-edit]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    S.detailId = null;
    openShopForm(S.shops.find(x => x.id === b.dataset.edit));
  });
  v.querySelectorAll('[data-visit]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const s = S.shops.find(x => x.id === b.dataset.visit);
    openMealForm({ kind: 'tasted', shop_id: s.id, date: today(), title: '', memo: '', rating: 0, photo: null, tags: '', url: '' });
  });
  v.querySelectorAll('[data-stop]').forEach(a => a.onclick = e => e.stopPropagation());
  v.querySelectorAll('[data-open]').forEach(a => a.onclick = () => {
    if (!S.picking) openShop(a.dataset.open);
  });
}
function visitStats(shopId) {
  const ms = S.meals.filter(m => m.shop_id === shopId && m.kind === 'tasted');
  const rated = ms.filter(m => m.rating > 0);
  return {
    count: ms.length,
    avg: rated.length ? (rated.reduce((a, b) => a + b.rating, 0) / rated.length).toFixed(1) : '—',
    last: ms.length ? ms.map(m => m.date).sort().reverse()[0] : null
  };
}
function sortShops(rows) {
  if (S.sort === 'rating') return rows.sort((a, b) => (parseFloat(visitStats(b.id).avg) || 0) - (parseFloat(visitStats(a.id).avg) || 0));
  if (S.sort === 'stale') return rows.sort((a, b) => (visitStats(a.id).last || '0') > (visitStats(b.id).last || '0') ? 1 : -1);
  return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// ---- お店の詳細 ----------------------------------------------
function openShop(id) {
  const s = S.shops.find(x => x.id === id);
  if (!s) return;
  S.detailId = id;
  const st = visitStats(id);
  const visits = S.meals.filter(m => m.shop_id === id).sort((a, b) => b.date.localeCompare(a.date));
  let html = `<button class="back" id="dBack">‹</button>`;
  if (photosOf(s).length) html += `<div style="margin-bottom:16px;">${galleryHtml(s, 190)}</div>`;
  html += `<div style="display:flex;align-items:baseline;gap:9px;margin-bottom:7px;">
    ${s.state === 'wish' ? `<span class="hand" style="font-size:16px;color:var(--rose);">${s.priority || 'someday'}</span>` : ''}
    <span style="font-size:20px;">${esc(s.name)}</span></div>
  <div class="meta" style="font-size:11px;color:var(--mute);margin-bottom:14px;">
    ${[esc(s.area || ''), (s.scenes || []).map(sceneLabel).join(' ・ '), st.count ? `${st.count}回 ・ 平均★${st.avg}` : ''].filter(Boolean).join('　')}
  </div>`;
  if (s.memo) html += `<p style="font-size:13px;color:var(--sub);line-height:1.9;margin:0 0 16px;">${esc(s.memo)}</p>`;
  html += `<div class="shop"><div class="acts" style="padding-bottom:4px;">
    <a href="${esc(mapUrl(s))}" target="_blank" rel="noopener">MAP</a>
    ${isMine() ? `<button id="dVisit">RECORD A VISIT</button><button id="dEdit">EDIT</button>` : ''}
  </div></div>`;
  if (visits.length) {
    html += `<div class="month">HISTORY</div>`;
    visits.forEach(m => {
      html += `<div class="row" data-m="${m.id}">
        ${firstPhoto(m) ? `<img src="${firstPhoto(m).src}" style="width:46px;height:46px;object-fit:cover;object-position:${firstPhoto(m).pos || '50% 50%'};flex:0 0 auto;">` : ''}
        <div class="grow"><div class="nm">${esc(m.title)}</div>
        <div class="sm">${fmtDate(m.date)}${m.rating ? ` ・ ${'★'.repeat(m.rating)}` : ''}</div></div>
      </div>`;
    });
  }
  if (isMine()) {
    html += `<button class="ghost" id="dArchive" style="margin-top:24px;">
      ${s.state === 'archived' ? 'アーカイブから戻す' : 'アーカイブする（閉店・見送り）'}</button>`;
  }
  const v = $('detailView');
  v.innerHTML = html;
  $('dBack').onclick = () => setTab(S.tab);
  const dv = v.querySelector('#dVisit');
  if (dv) dv.onclick = () => openMealForm({ kind: 'tasted', shop_id: id, date: today(), title: '', memo: '', rating: 0, photo: null, tags: '', url: '' });
  const de = v.querySelector('#dEdit');
  if (de) de.onclick = () => openShopForm(s);
  const da = v.querySelector('#dArchive');
  if (da) da.onclick = async () => {
    const next = s.state === 'archived' ? (visitStats(id).count ? 'visited' : 'wish') : 'archived';
    await sb.from('shops').update({ state: next }).eq('id', id);
    await loadData(); openShop(id);
  };
  v.querySelectorAll('[data-m]').forEach(r => r.onclick = () => {
    if (isMine()) openMealForm(S.meals.find(m => m.id === r.dataset.m));
  });
  show('detailView');
}

// ---- 記録フォーム --------------------------------------------
function openMealForm(m) {
  S.form = { kind: 'tasted', title: '', date: today(), shop_id: null, memo: '', url: '', tags: '', rating: 0, photo: null, ...(m || {}) };
  renderMealForm();
}
function renderMealForm() {
  const f = S.form;
  const shops = S.shops.filter(s => s.state !== 'archived').sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  const v = $('formView');
  v.innerHTML = `
    <button class="back" id="fBack">‹</button>
    <div class="seg">
      <button data-kind="cooked" class="${f.kind === 'cooked' ? 'on' : ''}">COOKED</button>
      <button data-kind="tasted" class="${f.kind === 'tasted' ? 'on' : ''}">TASTED</button>
    </div>
    <div id="fPhoto"></div>
    <div class="field"><label>${f.kind === 'cooked' ? '作ったもの' : '食べたもの'} ※</label>
      <input id="fTitle" value="${esc(f.title)}" placeholder="${f.kind === 'cooked' ? '例：鶏の照り焼き' : '例：担々麺'}"></div>
    <div class="field"><label>日付 ※</label><input type="date" id="fDate" value="${f.date}"></div>
    <div class="field"><label>${f.kind === 'cooked' ? '参考にしたお店' : 'お店'}</label>
      <select id="fShop">
        <option value="">なし</option>
        ${shops.map(s => `<option value="${s.id}" ${f.shop_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        <option value="__new">＋ 新しく登録する</option>
      </select></div>
    <div class="field"><label>${f.kind === 'cooked' ? '工夫・レシピメモ' : '感想'}</label>
      <textarea id="fMemo" rows="3">${esc(f.memo)}</textarea></div>
    <div class="field"><label>URL</label><input id="fUrl" type="url" inputmode="url" value="${esc(f.url)}" placeholder="https://..."></div>
    <div class="field"><label>タグ（カンマ区切り）</label><input id="fTags" value="${esc(f.tags)}" placeholder="和食, 週末"></div>
    <div class="block"><label>満足度</label><div class="stars" id="fStars"></div></div>
    <button class="primary" id="fSave">${f.id ? '更新する' : '記録する'}</button>
    ${f.id ? `<button class="ghost" id="fDel">この記録を削除</button>` : ''}
    <p class="err hide" id="fErr"></p>`;

  $('fBack').onclick = () => S.detailId ? openShop(S.detailId) : setTab(S.tab);
  v.querySelectorAll('[data-kind]').forEach(b => b.onclick = () => { collectMeal(); S.form.kind = b.dataset.kind; renderMealForm(); });
  renderPhotoBox($('fPhoto'), photosOf(f), ps => { collectMeal(); S.form.photos = ps; S.form.photo = ps[0]?.src || null; renderMealForm(); });
  renderStars($('fStars'), f.rating, r => { collectMeal(); S.form.rating = r; renderMealForm(); });
  $('fShop').onchange = e => {
    if (e.target.value === '__new') {
      collectMeal();
      S.mealCache = { ...S.form };
      openShopForm(null, true);
      return;
    }
    S.form.shop_id = e.target.value || null;
  };
  $('fSave').onclick = saveMeal;
  const d = v.querySelector('#fDel');
  if (d) d.onclick = async () => {
    if (!confirm('この記録を削除しますか？')) return;
    await sb.from('meals').delete().eq('id', f.id);
    await loadData(); S.detailId ? openShop(S.detailId) : setTab('table');
  };
  show('formView');
}
function collectMeal() {
  const g = id => $(id)?.value ?? '';
  S.form = {
    ...S.form, title: g('fTitle'), date: g('fDate'), memo: g('fMemo'), url: g('fUrl'), tags: g('fTags'),
    shop_id: $('fShop') && $('fShop').value && $('fShop').value !== '__new' ? $('fShop').value : S.form.shop_id
  };
}
async function saveMeal() {
  collectMeal();
  const f = S.form;
  const err = $('fErr');
  if (!f.title.trim()) { err.textContent = '料理名を入力してください。'; err.classList.remove('hide'); return; }
  const row = {
    user_id: S.me.id, kind: f.kind, title: f.title.trim(), date: f.date || today(),
    shop_id: f.shop_id || null, memo: f.memo.trim(), url: f.url.trim(), tags: f.tags,
    rating: f.rating || 0, photo: f.photo, photos: photosOf(f)
  };
  if (f.id) row.id = f.id;
  $('fSave').disabled = true;
  const { error } = await sb.from('meals').upsert(row);
  $('fSave').disabled = false;
  if (error) { err.textContent = '保存できませんでした（' + error.message + '）'; err.classList.remove('hide'); return; }
  // 訪問したので店の状態を更新
  if (f.kind === 'tasted' && f.shop_id) {
    const s = S.shops.find(x => x.id === f.shop_id);
    if (s && s.state === 'wish') await sb.from('shops').update({ state: 'visited' }).eq('id', f.shop_id);
  }
  await loadData();
  if (S.detailId) openShop(S.detailId); else setTab('table');
}

// ---- お店フォーム --------------------------------------------
function openShopForm(s, backToMeal = false) {
  S.form = {
    name: '', scenes: [], area: '', memo: '', url: '', tags: '', priority: 'someday',
    state: 'wish', photo: null, __backToMeal: backToMeal, ...(s || {})
  };
  renderShopForm();
}
function renderShopForm() {
  const f = S.form;
  const areas = [...new Set(S.shops.map(x => x.area).filter(Boolean))].sort();
  const v = $('formView');
  v.innerHTML = `
    <button class="back" id="sBack">‹</button>
    <div class="en" style="font-size:10px;letter-spacing:.24em;color:var(--rose);margin-bottom:20px;">${f.id ? 'EDIT SHOP' : 'NEW SHOP'}</div>
    <div id="sPhoto"></div>
    <div class="field"><label>店名 ※</label><input id="sName" value="${esc(f.name)}" placeholder="例：蕎麦 かねこ"></div>
    <div class="block"><label>シーン ※ 複数選べます</label>
      <div class="pick" id="sScenes">${SCENES.map(([k, en]) =>
    `<button data-s="${k}" class="${(f.scenes || []).includes(k) ? 'on' : ''}">${en}</button>`).join('')}</div></div>
    <div class="block"><label>行きたい度</label>
      <div class="prio" id="sPrio">${PRIO.map(([k, l]) =>
      `<button data-p="${k}" class="${f.priority === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="field"><label>エリア</label>
      <input id="sArea" value="${esc(f.area)}" list="areaList" placeholder="例：神保町">
      <datalist id="areaList">${areas.map(a => `<option value="${esc(a)}">`).join('')}</datalist></div>
    <div class="field"><label>メモ（誰のおすすめ、名物など）</label>
      <textarea id="sMemo" rows="3">${esc(f.memo)}</textarea></div>
    <div class="field"><label>地図・サイトのURL（空なら店名で検索します）</label>
      <input id="sUrl" type="url" inputmode="url" value="${esc(f.url)}" placeholder="https://maps.app.goo.gl/..."></div>
    <div class="field"><label>タグ（カンマ区切り）</label><input id="sTags" value="${esc(f.tags)}" placeholder="蕎麦, 和食"></div>
    <button class="primary" id="sSave">${f.id ? '更新する' : '保存する'}</button>
    ${f.id ? `<button class="ghost" id="sDel">このお店を削除</button>` : ''}
    <p class="err hide" id="sErr"></p>`;

  $('sBack').onclick = () => f.__backToMeal ? renderMealForm() : (S.detailId ? openShop(S.detailId) : setTab('shops'));
  renderPhotoBox($('sPhoto'), photosOf(f), ps => { collectShop(); S.form.photos = ps; S.form.photo = ps[0]?.src || null; renderShopForm(); });
  v.querySelectorAll('#sScenes button').forEach(b => b.onclick = () => {
    collectShop();
    const k = b.dataset.s, arr = S.form.scenes || [];
    S.form.scenes = arr.includes(k) ? arr.filter(x => x !== k) : [...arr, k];
    renderShopForm();
  });
  v.querySelectorAll('#sPrio button').forEach(b => b.onclick = () => {
    collectShop(); S.form.priority = b.dataset.p; renderShopForm();
  });
  $('sSave').onclick = saveShop;
  const d = v.querySelector('#sDel');
  if (d) d.onclick = async () => {
    if (!confirm('このお店を削除しますか？紐づいた記録は残ります。')) return;
    await sb.from('shops').delete().eq('id', f.id);
    S.detailId = null; await loadData(); setTab('shops');
  };
  show('formView');
}
function collectShop() {
  const g = id => $(id)?.value ?? '';
  S.form = { ...S.form, name: g('sName'), area: g('sArea'), memo: g('sMemo'), url: g('sUrl'), tags: g('sTags') };
}
async function saveShop() {
  collectShop();
  const f = S.form, err = $('sErr');
  if (!f.name.trim()) { err.textContent = '店名を入力してください。'; err.classList.remove('hide'); return; }
  if (!(f.scenes || []).length) { err.textContent = 'シーンを1つ以上選んでください。'; err.classList.remove('hide'); return; }
  const row = {
    user_id: S.me.id, name: f.name.trim(), scenes: f.scenes, area: f.area.trim(),
    memo: f.memo.trim(), url: f.url.trim(), tags: f.tags, priority: f.priority, state: f.state || 'wish',
    photo: f.photo, photos: photosOf(f)
  };
  if (f.id) row.id = f.id;
  $('sSave').disabled = true;
  const { data, error } = await sb.from('shops').upsert(row).select().single();
  $('sSave').disabled = false;
  if (error) { err.textContent = '保存できませんでした（' + error.message + '）'; err.classList.remove('hide'); return; }
  await loadData();
  if (f.__backToMeal && S.mealCache) {
    const cached = { ...S.mealCache, shop_id: data.id };
    S.mealCache = null;
    openMealForm(cached);
    return;
  }
  if (S.detailId) openShop(data.id); else setTab('shops');
}

// ---- 写真・星の共通部品 --------------------------------------
function renderPhotoBox(host, photos, cb) {
  const list = Array.isArray(photos) ? [...photos] : [];
  host.className = 'photoedit';
  host.innerHTML = list.map((p, i) => `
    <div class="pe" data-i="${i}">
      <img src="${p.src}" style="object-position:${p.pos || '50% 50%'};">
      <button class="perm" data-rm="${i}">✕</button>
      <div class="pectrl">
        <span>位置</span>
        <input type="range" min="0" max="100" step="5" value="${parseInt((p.pos || '50% 50%').split(' ')[1]) || 50}" data-pos="${i}">
        ${i > 0 ? `<button data-left="${i}">◀</button>` : ''}
        ${i < list.length - 1 ? `<button data-right="${i}">▶</button>` : ''}
      </div>
    </div>`).join('') +
    `<button class="photobox">＋ 写真を追加${list.length ? `（${list.length}枚）` : ''}</button>`;

  host.querySelector('.photobox').onclick = () =>
    pickPhoto(src => cb([...list, { src, pos: '50% 50%' }]));
  host.querySelectorAll('[data-rm]').forEach(b => b.onclick = () =>
    cb(list.filter((_, i) => i !== +b.dataset.rm)));
  host.querySelectorAll('[data-pos]').forEach(r => {
    const i = +r.dataset.pos;
    const img = host.querySelector(`.pe[data-i="${i}"] img`);
    r.oninput = () => { img.style.objectPosition = `50% ${r.value}%`; };
    r.onchange = () => {
      const next = list.map((p, j) => j === i ? { ...p, pos: `50% ${r.value}%` } : p);
      cb(next);
    };
  });
  host.querySelectorAll('[data-left]').forEach(b => b.onclick = () => {
    const i = +b.dataset.left, n = [...list];
    [n[i - 1], n[i]] = [n[i], n[i - 1]]; cb(n);
  });
  host.querySelectorAll('[data-right]').forEach(b => b.onclick = () => {
    const i = +b.dataset.right, n = [...list];
    [n[i + 1], n[i]] = [n[i], n[i + 1]]; cb(n);
  });
}
function renderStars(host, val, cb) {
  host.innerHTML = [1, 2, 3, 4, 5].map(n => `<button data-n="${n}">${n <= val ? '★' : '☆'}</button>`).join('');
  host.querySelectorAll('button').forEach(b => b.onclick = () => cb(+b.dataset.n === val ? 0 : +b.dataset.n));
}

// ---- 共有テキスト --------------------------------------------
function shareSheet() {
  const picked = S.shops.filter(s => S.picked.has(s.id));
  let withMemo = true;
  const build = () => '気になっているお店\n\n' + picked.map(s =>
    `▪︎ ${s.name}${s.area ? `（${s.area}）` : ''}` +
    (withMemo && s.memo ? `\n${s.memo}` : '') +
    `\n${mapUrl(s)}`).join('\n\n');

  const host = $('sheetHost');
  const draw = () => {
    host.innerHTML = `<div class="sheet"><div class="inner">
      <h2 class="sec">${picked.length}件を共有</h2>
      <p class="note" style="margin:0 0 16px;">LINEなどに貼り付けられます。</p>
      <label class="note" style="display:flex;align-items:center;gap:9px;margin-bottom:14px;">
        <input type="checkbox" id="wm" ${withMemo ? 'checked' : ''} style="width:auto;">メモも含める</label>
      <textarea id="shareText" rows="9" style="width:100%;border:0.5px solid var(--line);padding:12px;font-size:13px;line-height:1.8;">${esc(build())}</textarea>
      <button class="primary" id="doShare">共有する</button>
      <button class="ghost" id="closeSheet">閉じる</button>
    </div></div>`;
    $('wm').onchange = e => { withMemo = e.target.checked; draw(); };
    $('closeSheet').onclick = () => { host.innerHTML = ''; };
    $('doShare').onclick = async () => {
      const text = $('shareText').value;
      if (navigator.share) { try { await navigator.share({ text }); } catch (e) { } }
      else { await navigator.clipboard.writeText(text); alert('コピーしました'); }
    };
  };
  draw();
}

// ---- メニュー ------------------------------------------------
async function renderMenu() {
  const v = $('menuView');
  v.innerHTML = `<div class="empty">読み込み中…</div>`;
  show('menuView');

  const [{ data: outgoing }, { data: incoming }] = await Promise.all([
    sb.from('shares').select('*').eq('owner_id', S.me.id),
    sb.from('shares').select('*').eq('viewer_id', S.me.id),
  ]);
  const ids = [...new Set([...(outgoing || []).map(s => s.viewer_id), ...(incoming || []).map(s => s.owner_id)])];
  const { data: ps } = ids.length ? await sb.from('profiles').select('id,email,display_name').in('id', ids) : { data: [] };
  const nameOf = id => { const p = ps?.find(x => x.id === id); return p?.display_name || p?.email || '（不明）'; };

  let html = '';

  if (S.profile?.is_admin) {
    const { data: pend } = await sb.from('profiles').select('*').neq('id', S.me.id).order('created_at');
    html += `<div class="secwrap"><h2 class="sec">メンバー</h2>
      <p class="note" style="margin:0 0 12px;">承認するとアプリを使えるようになります。</p>`;
    html += (pend || []).length ? (pend || []).map(p => `<div class="row">
        <div class="grow"><div class="nm">${esc(p.email)}</div>
        <div class="sm">${p.status === 'approved' ? '承認済み' : p.status === 'blocked' ? '停止中' : '承認待ち'}</div></div>
        ${p.status !== 'approved' ? `<button data-approve="${p.id}">承認</button>` : `<button data-block="${p.id}">停止</button>`}
      </div>`).join('') : `<p class="note">他のメンバーはいません。</p>`;
    html += `</div>`;
  }

  html += `<div class="secwrap"><h2 class="sec">自分の記録を見せる</h2>
    <p class="note" style="margin:0 0 12px;">相手のメールアドレスを入力して招待します。</p>
    <div class="field" style="margin-bottom:10px;"><input id="inviteMail" type="email" inputmode="email" placeholder="相手のメールアドレス"></div>
    <div class="note" style="display:flex;gap:16px;margin-bottom:12px;">
      <label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" id="shT" checked style="width:auto;">食卓</label>
      <label style="display:flex;gap:6px;align-items:center;"><input type="checkbox" id="shS" checked style="width:auto;">お店</label>
    </div>
    <button class="primary" id="inviteBtn" style="margin-bottom:16px;">招待する</button>
    <p class="err hide" id="inviteErr"></p>`;
  html += (outgoing || []).length ? (outgoing || []).map(s => `<div class="row">
      <div class="grow"><div class="nm">${esc(nameOf(s.viewer_id))}</div>
      <div class="sm">${s.status === 'pending' ? '相手からの申請・承認待ち' : `${[s.share_table ? '食卓' : '', s.share_shops ? 'お店' : ''].filter(Boolean).join(' ・ ')}を公開中`}</div></div>
      ${s.status === 'pending' ? `<button data-accept="${s.id}">許可</button>` : ''}
      <button data-revoke="${s.id}">解除</button>
    </div>`).join('') : `<p class="note">まだ誰にも公開していません。</p>`;
  html += `</div>`;

  html += `<div class="secwrap"><h2 class="sec">見せてもらう</h2>
    <p class="note" style="margin:0 0 12px;">相手のメールアドレスに申請を送ります。</p>
    <div class="field" style="margin-bottom:10px;"><input id="reqMail" type="email" inputmode="email" placeholder="相手のメールアドレス"></div>
    <button class="primary" id="reqBtn" style="margin-bottom:16px;">申請する</button>
    <p class="err hide" id="reqErr"></p>`;
  html += (incoming || []).length ? (incoming || []).map(s => `<div class="row">
      <div class="grow"><div class="nm">${esc(nameOf(s.owner_id))}</div>
      <div class="sm">${s.status === 'pending' ? '申請中' : '閲覧できます'}</div></div>
      <button data-revoke="${s.id}">解除</button>
    </div>`).join('') : `<p class="note">まだ誰の記録も見ていません。</p>`;
  html += `</div>`;

  html += `<div class="secwrap"><h2 class="sec">その他</h2>
    <button class="ghost" id="exportBtn" style="text-align:left;padding-left:0;">記録をバックアップ（JSON）</button>
    <button class="ghost" id="signout" style="text-align:left;padding-left:0;">ログアウト</button>
    <p class="note" style="margin-top:10px;">${esc(S.profile?.email || '')}</p></div>`;

  v.innerHTML = html;

  v.querySelectorAll('[data-approve]').forEach(b => b.onclick = async () => {
    await sb.from('profiles').update({ status: 'approved' }).eq('id', b.dataset.approve); renderMenu();
  });
  v.querySelectorAll('[data-block]').forEach(b => b.onclick = async () => {
    if (!confirm('このメンバーを停止しますか？')) return;
    await sb.from('profiles').update({ status: 'blocked' }).eq('id', b.dataset.block); renderMenu();
  });
  v.querySelectorAll('[data-accept]').forEach(b => b.onclick = async () => {
    await sb.from('shares').update({ status: 'active' }).eq('id', b.dataset.accept); renderMenu();
  });
  v.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => {
    if (!confirm('この共有を解除しますか？')) return;
    await sb.from('shares').delete().eq('id', b.dataset.revoke);
    await loadOwners(); renderMenu();
  });

  $('inviteBtn').onclick = async () => {
    const err = $('inviteErr'); err.classList.add('hide');
    const mail = $('inviteMail').value.trim().toLowerCase();
    const { data: p } = await sb.from('profiles').select('id').eq('email', mail).maybeSingle();
    if (!p) { err.textContent = 'そのメールアドレスの利用者が見つかりません。相手が登録・承認済みか確認してください。'; err.classList.remove('hide'); return; }
    const { error } = await sb.from('shares').insert({
      owner_id: S.me.id, viewer_id: p.id, share_table: $('shT').checked, share_shops: $('shS').checked,
      status: 'active', requested_by: 'owner'
    });
    if (error) { err.textContent = error.message.includes('duplicate') ? 'すでに共有しています。' : error.message; err.classList.remove('hide'); return; }
    renderMenu();
  };
  $('reqBtn').onclick = async () => {
    const err = $('reqErr'); err.classList.add('hide');
    const mail = $('reqMail').value.trim().toLowerCase();
    const { data: p } = await sb.from('profiles').select('id').eq('email', mail).maybeSingle();
    if (!p) { err.textContent = 'そのメールアドレスの利用者が見つかりません。'; err.classList.remove('hide'); return; }
    const { error } = await sb.from('shares').insert({
      owner_id: p.id, viewer_id: S.me.id, share_table: true, share_shops: true,
      status: 'pending', requested_by: 'viewer'
    });
    if (error) { err.textContent = error.message.includes('duplicate') ? 'すでに申請済みです。' : error.message; err.classList.remove('hide'); return; }
    renderMenu();
  };
  $('exportBtn').onclick = () => {
    const blob = new Blob([JSON.stringify({ shops: S.shops, meals: S.meals }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `食卓帖-${today()}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  $('signout').onclick = async () => {
    if (!confirm('ログアウトしますか？')) return;
    await sb.auth.signOut(); location.reload();
  };
}

// ---- 追加ボタン ----------------------------------------------
$('fab').onclick = () => {
  const m = $('fabmenu');
  if (!m.classList.contains('hide')) { m.classList.add('hide'); return; }
  m.innerHTML = `<button data-new="shop">お店を登録</button>
    <button data-new="tasted">食べた記録</button>
    <button data-new="cooked">作った記録</button>`;
  m.classList.remove('hide');
  m.querySelectorAll('[data-new]').forEach(b => b.onclick = () => {
    m.classList.add('hide');
    S.detailId = null;
    if (b.dataset.new === 'shop') openShopForm(null);
    else openMealForm({ kind: b.dataset.new });
  });
};

// ---- 起動 ----------------------------------------------------
async function start() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { show('authView'); return; }
  S.me = session.user;
  const { data: p } = await sb.from('profiles').select('*').eq('id', S.me.id).maybeSingle();
  S.profile = p;
  if (!p || p.status !== 'approved') { show('pendingView'); return; }
  S.owner = S.me.id;
  await loadOwners();
  await loadData();
  setTab('table');
}
start().catch(e => {
  document.querySelector('main').innerHTML =
    `<div class="err" style="padding:30px 0;">起動できませんでした。<br>${e.message}</div>`;
});
