/* Mes Nounous — suivi des heures de garde, des paiements et des taxis.
   Sans configuration : données stockées dans le navigateur (localStorage).
   Avec config.js rempli : compte par email + sauvegarde en ligne (Supabase). */

const KEY = 'mes-nounous-v1';
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const CFG = window.MN_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
const sb = CLOUD ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
let user = null;          // utilisateur connecté (mode en ligne)
let ready = !CLOUD;       // données chargées et prêtes à afficher
let recovery = false;     // retour depuis le lien « mot de passe oublié »
let authMode = 'login';   // login | signup | forgot | reset
let authMsg = '';

let S = CLOUD ? empty() : loadLocal(KEY);
let tab = 'mois';
const now = new Date();
let cur = { y: now.getFullYear(), m: now.getMonth() };
let editSlot = null;     // id du créneau en cours de modification
let editNounou = null;   // id de la nounou en cours de modification
let durMode = 'range';   // 'range' (début/fin) ou 'hours' (nombre d'heures)

/* ---------- Données ---------- */
function empty() { return { nounous: [], enfants: [], creneaux: [] }; }
function normalize(d) {
  if (d && Array.isArray(d.nounous)) return { ...empty(), ...d };
  return empty();
}
function loadLocal(key) {
  try { return normalize(JSON.parse(localStorage.getItem(key))); } catch (e) { return empty(); }
}
const hasData = d => d.nounous.length || d.creneaux.length || d.enfants.length;
const cacheKey = () => user ? `${KEY}-${user.id}` : KEY;

function save() {
  try { localStorage.setItem(cacheKey(), JSON.stringify(S)); }
  catch (e) { if (!CLOUD) toast('Impossible d’enregistrer sur cet appareil'); }
  if (user) queuePush();
}

/* ---------- Sauvegarde en ligne ---------- */
let pushTimer = null, pushing = false, dirty = false;

function setSync(state) {
  const el = document.getElementById('sync');
  if (!el) return;
  el.hidden = !CLOUD || !user;
  el.className = 'sync ' + state;
  el.textContent = { ok: 'Sauvegardé', saving: 'Enregistrement…', error: 'Hors ligne' }[state] || '';
}

function queuePush() {
  dirty = true; setSync('saving');
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 600);
}

async function push() {
  if (!user || pushing) return !dirty;
  pushing = true; dirty = false;
  const { error } = await sb.from('user_data').upsert({ user_id: user.id, data: S, updated_at: new Date().toISOString() });
  pushing = false;
  if (error) { dirty = true; setSync('error'); return false; }
  if (dirty) return push();
  setSync('ok');
  return true;
}

async function pull() {
  setSync('saving');
  const { data, error } = await sb.from('user_data').select('data').eq('user_id', user.id).maybeSingle();
  if (error) { S = loadLocal(cacheKey()); setSync('error'); return; }
  if (data && data.data && Array.isArray(data.data.nounous)) {
    S = normalize(data.data);
    try { localStorage.setItem(cacheKey(), JSON.stringify(S)); } catch (e) {}
    setSync('ok');
    return;
  }
  // Premier passage sur ce compte : on reprend les données déjà saisies sur cet appareil.
  const cached = loadLocal(cacheKey());
  const legacy = loadLocal(KEY);
  const fromLegacy = !hasData(cached) && hasData(legacy);
  S = fromLegacy ? legacy : cached;
  const ok = await push();
  if (ok && fromLegacy) {
    try { localStorage.removeItem(KEY); } catch (e) {}
    toast('Tes données ont été ajoutées à ton compte ✓');
  }
}

window.addEventListener('online', () => { if (user && dirty) push(); });
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !user || !ready || dirty || pushing || recovery) return;
  const before = JSON.stringify(S);
  await pull();
  if (JSON.stringify(S) !== before) render();
});

/* ---------- Utilitaires ---------- */
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur = n => eurFmt.format(n || 0);
const round2 = n => Math.round(n * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };
const hm = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; };
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const initial = s => (s || '?').trim().charAt(0).toUpperCase();

const nounou = id => S.nounous.find(n => n.id === id);
const enfant = id => S.enfants.find(e => e.id === id);
const rate = c => { const n = nounou(c.nounouId); if (!n) return 0; return (c.enfants?.length >= 2 && n.rate2) ? n.rate2 : n.rate1; };
const garde = c => round2(c.minutes / 60 * rate(c));
const taxi = c => num(c.taxi);
const total = c => garde(c) + taxi(c);
const inMonth = c => { const [y, m] = c.date.split('-').map(Number); return y === cur.y && m - 1 === cur.m; };
const monthSlots = () => S.creneaux.filter(inMonth).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

/* ---------- Rendu ---------- */
function render() {
  const v = $('#view');
  const needAuth = CLOUD && (!user || recovery);
  document.body.classList.toggle('auth', needAuth || !ready);
  if (needAuth) { v.innerHTML = viewAuth(); bindAuth(); return; }
  if (!ready) { v.innerHTML = `<div class="empty"><p>Chargement de tes données…</p></div>`; return; }
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  v.innerHTML = { mois: viewMois, creneaux: viewCreneaux, nounous: viewNounous, plus: viewPlus }[tab]();
  bind();
}

/* --- Connexion --- */
function viewAuth() {
  const t = {
    login: ['Connexion', 'Retrouve tes nounous et tes heures sur tous tes appareils.', 'Se connecter'],
    signup: ['Créer un compte', 'Un email et un mot de passe suffisent. Tes données seront sauvegardées en ligne.', 'Créer mon compte'],
    forgot: ['Mot de passe oublié', 'On t’envoie un lien par email pour en choisir un nouveau.', 'Envoyer le lien'],
    reset: ['Nouveau mot de passe', 'Choisis ton nouveau mot de passe.', 'Enregistrer'],
  }[authMode];
  const email = authMode !== 'reset';
  const pwd = authMode !== 'forgot';
  return `<form class="card auth-card" id="authForm" autocomplete="on">
    <h2>${t[0]}</h2>
    <p class="hint" style="margin:-6px 0 16px">${t[1]}</p>
    ${email ? `<div class="field"><label for="a-email">Email</label>
      <input type="email" id="a-email" name="email" autocomplete="email" inputmode="email" placeholder="toi@exemple.fr" required></div>` : ''}
    ${pwd ? `<div class="field"><label for="a-pwd">Mot de passe</label>
      <input type="password" id="a-pwd" name="password" minlength="6" required
        autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" placeholder="6 caractères minimum"></div>` : ''}
    ${authMsg ? `<div class="preview">${esc(authMsg)}</div>` : ''}
    <button class="btn block" type="submit" id="a-submit">${t[2]}</button>
    <div class="auth-links">
      ${authMode === 'login' ? `<button type="button" class="link" data-auth="signup">Créer un compte</button>
        <button type="button" class="link" data-auth="forgot">Mot de passe oublié ?</button>` : ''}
      ${authMode === 'signup' || authMode === 'forgot' ? `<button type="button" class="link" data-auth="login">J’ai déjà un compte</button>` : ''}
    </div>
  </form>`;
}

const AUTH_ERRORS = [
  [/invalid login/i, 'Email ou mot de passe incorrect.'],
  [/email not confirmed/i, 'Confirme d’abord ton email avec le lien reçu.'],
  [/already registered|already exists/i, 'Un compte existe déjà avec cet email. Connecte-toi.'],
  [/password should be|at least 6/i, 'Le mot de passe doit faire au moins 6 caractères.'],
  [/rate limit|too many/i, 'Trop d’essais. Réessaie dans quelques minutes.'],
  [/fetch|network/i, 'Pas de connexion internet.'],
];
const authError = e => (AUTH_ERRORS.find(([r]) => r.test(e?.message || '')) || [, 'Une erreur est survenue. Réessaie.'])[1];

function bindAuth() {
  document.querySelectorAll('[data-auth]').forEach(b => b.addEventListener('click', () => {
    authMode = b.dataset.auth; authMsg = ''; render();
  }));
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#a-submit'); btn.disabled = true; btn.style.opacity = .6;
    const email = $('#a-email')?.value.trim();
    const password = $('#a-pwd')?.value;
    const back = location.origin + location.pathname;
    let res;
    try {
      if (authMode === 'login') res = await sb.auth.signInWithPassword({ email, password });
      else if (authMode === 'signup') res = await sb.auth.signUp({ email, password, options: { emailRedirectTo: back } });
      else if (authMode === 'forgot') res = await sb.auth.resetPasswordForEmail(email, { redirectTo: back });
      else res = await sb.auth.updateUser({ password });
    } catch (err) { res = { error: err }; }
    btn.disabled = false; btn.style.opacity = '';
    if (res.error) { authMsg = authError(res.error); render(); return; }
    if (authMode === 'signup' && !res.data?.session) {
      authMode = 'login'; authMsg = 'Compte créé ! Clique sur le lien reçu par email pour l’activer, puis connecte-toi.'; render();
    } else if (authMode === 'forgot') {
      authMode = 'login'; authMsg = 'Si un compte existe avec cet email, tu vas recevoir un lien.'; render();
    } else if (authMode === 'reset') {
      recovery = false; authMode = 'login'; authMsg = '';
      toast('Mot de passe modifié ✓');
      const { data } = await sb.auth.getSession();
      if (data.session) signedIn(data.session.user);
    }
    // Connexion réussie : onAuthStateChange prend le relais.
  });
}

async function signedIn(u) {
  user = u; ready = false; authMsg = '';
  render();
  await pull();
  ready = true; tab = 'mois';
  render();
}

async function signOut() {
  if (dirty) await push();
  try { localStorage.removeItem(cacheKey()); } catch (e) {}
  await sb.auth.signOut();
}

function monthNav() {
  return `<div class="month">
    <button class="icon-btn" data-act="prev" aria-label="Mois précédent">${ICON.left}</button>
    <h2>${MONTHS[cur.m]} <span>${cur.y}</span></h2>
    <button class="icon-btn" data-act="next" aria-label="Mois suivant">${ICON.right}</button>
  </div>`;
}

function emptyStart() {
  return `<div class="card empty">
    <div class="em">🧸</div>
    <p><strong>Bienvenue !</strong><br>Commence par ajouter ta ou tes nounous, puis tes enfants.</p>
    <button class="btn" data-goto="nounous">Ajouter une nounou</button>
  </div>`;
}

/* --- Onglet Mois --- */
function viewMois() {
  if (!S.nounous.length) return monthNav() + emptyStart();
  const slots = monthSlots();
  const tot = slots.reduce((s, c) => s + total(c), 0);
  const tGarde = slots.reduce((s, c) => s + garde(c), 0);
  const tTaxi = slots.reduce((s, c) => s + taxi(c), 0);
  const mins = slots.reduce((s, c) => s + c.minutes, 0);
  const paid = slots.filter(c => c.paid).reduce((s, c) => s + total(c), 0);
  const todo = tot - paid;
  const pct = tot ? Math.round(paid / tot * 100) : 0;

  let h = monthNav();
  h += `<div class="card hero">
    <div class="label">Total du mois</div>
    <div class="big">${eur(tot)}</div>
    <div class="sub">Garde ${eur(tGarde)}${tTaxi ? ` · Taxis ${eur(tTaxi)}` : ''}</div>
    ${tot ? `<div class="progress"><div style="width:${pct}%"></div></div>
    <div class="progress-legend"><span class="ok">Payé ${eur(paid)}</span><span class="todo">${todo > 0.004 ? 'Reste ' + eur(todo) : 'Tout est réglé ✓'}</span></div>` : ''}
  </div>
  <div class="stats">
    <div class="stat hours"><div class="k">Heures</div><div class="v">${hm(mins)}</div></div>
    <div class="stat taxi"><div class="k">Taxis</div><div class="v">${eur(tTaxi)}</div></div>
    <div class="stat todo"><div class="k">À régler</div><div class="v">${eur(todo)}</div></div>
  </div>`;

  if (!slots.length) {
    h += `<div class="card empty"><div class="em">🗓️</div><p>Aucun créneau ce mois-ci.</p>
      <button class="btn" data-goto="creneaux">Ajouter un créneau</button></div>`;
    return h;
  }

  // Par nounou
  const ids = [...new Set(slots.map(c => c.nounouId))];
  h += `<div class="section-title">Par nounou</div><div class="card">`;
  for (const id of ids) {
    const n = nounou(id); const ss = slots.filter(c => c.nounouId === id);
    const t = ss.reduce((s, c) => s + total(c), 0);
    const g = ss.reduce((s, c) => s + garde(c), 0);
    const tx = ss.reduce((s, c) => s + taxi(c), 0);
    const m = ss.reduce((s, c) => s + c.minutes, 0);
    const p = ss.filter(c => c.paid).reduce((s, c) => s + total(c), 0);
    const rest = t - p;
    h += `<div class="nrow">
      <div class="nrow-head">
        <div class="nrow-name"><span class="avatar">${esc(initial(n?.name))}</span>${esc(n?.name || 'Nounou supprimée')}
          ${n?.decl ? `<span class="chip">${esc(n.decl)}</span>` : ''}</div>
        <div class="nrow-total">${eur(t)}</div>
      </div>
      <div class="nrow-detail"><span>⏱ ${hm(m)}</span><span>Garde ${eur(g)}</span>${tx ? `<span>🚕 ${eur(tx)}</span>` : ''}</div>
      <div class="nrow-foot">
        ${rest > 0.004
          ? `<span class="chip todo">À régler · ${eur(rest)}</span><button class="btn small soft" data-act="payall" data-id="${id}">Tout marquer payé</button>`
          : `<span class="chip ok">✓ Réglé</span><button class="link" data-act="unpayall" data-id="${id}">Annuler</button>`}
      </div>
    </div>`;
  }
  h += `</div>`;

  // Par enfant
  if (S.enfants.length) {
    h += `<div class="section-title">Heures par enfant</div><div class="card">`;
    for (const e of S.enfants) {
      const m = slots.filter(c => c.enfants?.includes(e.id)).reduce((s, c) => s + c.minutes, 0);
      h += `<div class="kid-row"><span>${esc(e.name)}</span><span>${hm(m)}</span></div>`;
    }
    h += `</div>`;
  }
  return h;
}

/* --- Onglet Créneaux --- */
function viewCreneaux() {
  if (!S.nounous.length) return emptyStart();
  const c = editSlot ? S.creneaux.find(x => x.id === editSlot) : null;
  const actives = S.nounous.filter(n => n.active || n.id === c?.nounouId);
  const defNounou = c?.nounouId || (actives.length === 1 ? actives[0].id : '');
  const defDate = c?.date || (cur.y === now.getFullYear() && cur.m === now.getMonth() ? todayISO() : `${cur.y}-${pad(cur.m + 1)}-01`);
  if (c) durMode = c.start ? 'range' : 'hours';
  const kids = c ? c.enfants : (S.enfants.length === 1 ? [S.enfants[0].id] : []);

  let h = `<form class="card" id="slotForm" autocomplete="off">
    <h2>${c ? 'Modifier le créneau' : 'Nouveau créneau'}</h2>
    <div class="grid2">
      <div class="field"><label for="f-date">Date</label><input type="date" id="f-date" value="${defDate}" required></div>
      <div class="field"><label for="f-nounou">Nounou</label>
        <select id="f-nounou" required>
          <option value="">Choisir…</option>
          ${actives.map(n => `<option value="${n.id}" ${n.id === defNounou ? 'selected' : ''}>${esc(n.name)}</option>`).join('')}
        </select></div>
    </div>
    <div class="field"><span class="lbl">Durée</span>
      <div class="seg">
        <button type="button" data-mode="range" class="${durMode === 'range' ? 'on' : ''}">Début / fin</button>
        <button type="button" data-mode="hours" class="${durMode === 'hours' ? 'on' : ''}">Nombre d'heures</button>
      </div>
    </div>
    <div class="grid2" id="m-range" ${durMode === 'range' ? '' : 'hidden'}>
      <div class="field"><label for="f-start">Début</label><input type="time" id="f-start" value="${c?.start || ''}"></div>
      <div class="field"><label for="f-end">Fin</label><input type="time" id="f-end" value="${c?.end || ''}"></div>
    </div>
    <div class="grid2" id="m-hours" ${durMode === 'hours' ? '' : 'hidden'}>
      <div class="field"><label for="f-h">Heures</label><input type="number" id="f-h" min="0" step="1" inputmode="numeric" placeholder="0" value="${c && !c.start ? Math.floor(c.minutes / 60) : ''}"></div>
      <div class="field"><label for="f-m">Minutes</label>
        <select id="f-m">${[0, 15, 30, 45].map(m => `<option value="${m}" ${c && !c.start && c.minutes % 60 === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></div>
    </div>
    ${S.enfants.length ? `<div class="field"><span class="lbl">Enfant(s) gardé(s)</span><div class="pick">
      ${S.enfants.map(e => `<label><input type="checkbox" name="kid" value="${e.id}" ${kids.includes(e.id) ? 'checked' : ''}>${esc(e.name)}</label>`).join('')}
    </div></div>` : `<p class="hint" style="margin-top:-4px">Astuce : ajoute tes enfants dans l’onglet « Plus ».</p>`}
    <div class="field"><label for="f-taxi">Taxi (facultatif)</label>
      <div class="input-icon"><span class="ico">🚕</span><input type="text" inputmode="decimal" id="f-taxi" placeholder="0,00 €" value="${c?.taxi ? String(c.taxi).replace('.', ',') : ''}"></div>
    </div>
    <div class="field"><label for="f-note">Note (facultatif)</label><input type="text" id="f-note" placeholder="Ex : sortie d’école, garde du soir…" value="${esc(c?.note || '')}"></div>
    <div class="field"><label class="switch"><span>Déjà payé</span><input type="checkbox" id="f-paid" ${c?.paid ? 'checked' : ''}><span class="track"></span></label></div>
    <div class="preview" id="preview">—</div>
    <div class="btn-row">
      ${c ? `<button type="button" class="btn ghost" data-act="cancelSlot">Annuler</button>` : ''}
      <button class="btn block" type="submit">${c ? 'Enregistrer' : 'Ajouter le créneau'}</button>
    </div>
  </form>`;

  h += monthNav();
  const slots = monthSlots().reverse();
  if (!slots.length) {
    h += `<div class="empty"><p>Aucun créneau en ${MONTHS[cur.m].toLowerCase()}.</p></div>`;
    return h;
  }
  let lastDay = '';
  for (const s of slots) {
    if (s.date !== lastDay) {
      lastDay = s.date;
      const d = new Date(s.date + 'T12:00:00');
      h += `<div class="day">${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div>`;
    }
    const n = nounou(s.nounouId);
    const kidsTxt = (s.enfants || []).map(id => enfant(id)?.name).filter(Boolean).join(', ');
    h += `<div class="slot ${s.paid ? 'paid' : ''}">
      <button class="check ${s.paid ? 'on' : ''}" data-act="toggle" data-id="${s.id}" aria-label="${s.paid ? 'Marquer non payé' : 'Marquer payé'}">${ICON.check}</button>
      <div class="slot-body">
        <div class="slot-top"><span>${esc(n?.name || '—')}</span><span class="amount">${eur(total(s))}</span></div>
        <div class="slot-meta">${s.start ? `${s.start} → ${s.end} · ` : ''}${hm(s.minutes)}${kidsTxt ? ' · ' + esc(kidsTxt) : ''}</div>
        <div class="slot-tags">
          ${s.paid ? '<span class="chip ok">Payé</span>' : '<span class="chip todo">À régler</span>'}
          ${taxi(s) ? `<span class="chip taxi">🚕 ${eur(taxi(s))}</span>` : ''}
          ${s.note ? `<span class="chip muted">${esc(s.note)}</span>` : ''}
        </div>
        <div class="slot-actions">
          <button class="link" data-act="editSlot" data-id="${s.id}">Modifier</button>
          <button class="link del" data-act="delSlot" data-id="${s.id}">Supprimer</button>
        </div>
      </div>
    </div>`;
  }
  return h;
}

/* --- Onglet Nounous --- */
function viewNounous() {
  const n = editNounou ? nounou(editNounou) : null;
  let h = `<form class="card" id="nounouForm" autocomplete="off">
    <h2>${n ? 'Modifier la nounou' : 'Ajouter une nounou'}</h2>
    <div class="field"><label for="n-name">Prénom</label><input type="text" id="n-name" placeholder="Ex : Sophie" value="${esc(n?.name || '')}" required></div>
    <div class="grid2">
      <div class="field"><label for="n-r1">Tarif / h · 1 enfant</label><input type="text" inputmode="decimal" id="n-r1" placeholder="12,50" value="${n ? String(n.rate1).replace('.', ',') : ''}" required></div>
      <div class="field"><label for="n-r2">Tarif / h · 2 enfants +</label><input type="text" inputmode="decimal" id="n-r2" placeholder="Même tarif" value="${n?.rate2 ? String(n.rate2).replace('.', ',') : ''}"></div>
    </div>
    <div class="field"><label for="n-decl">Déclaration</label>
      <select id="n-decl">${['Pajemploi', 'CESU', 'Non déclarée', 'Autre'].map(d => `<option ${n?.decl === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
    <div class="field"><label class="switch"><span>Nounou active</span><input type="checkbox" id="n-active" ${!n || n.active ? 'checked' : ''}><span class="track"></span></label>
      <div class="hint">Une nounou inactive n’apparaît plus dans les nouveaux créneaux.</div></div>
    <div class="btn-row">
      ${n ? `<button type="button" class="btn ghost" data-act="cancelNounou">Annuler</button>` : ''}
      <button class="btn block" type="submit">${n ? 'Enregistrer' : 'Ajouter'}</button>
    </div>
  </form>`;

  if (S.nounous.length) {
    h += `<div class="section-title">Mes nounous</div><div class="card">`;
    for (const x of S.nounous) {
      h += `<div class="list-item ${x.active ? '' : 'inactive'}">
        <span class="avatar">${esc(initial(x.name))}</span>
        <div class="grow">
          <div class="t">${esc(x.name)}</div>
          <div class="s">${eur(x.rate1)}/h${x.rate2 ? ` · ${eur(x.rate2)}/h à 2+` : ''} · ${esc(x.decl)}${x.active ? '' : ' · inactive'}</div>
        </div>
        <button class="link" data-act="editNounou" data-id="${x.id}">Modifier</button>
        <button class="link del" data-act="delNounou" data-id="${x.id}">Suppr.</button>
      </div>`;
    }
    h += `</div>`;
  }
  return h;
}

/* --- Onglet Plus --- */
function viewPlus() {
  return `${user ? `<div class="card">
    <h2>Mon compte</h2>
    <div class="list-item">
      <span class="avatar">${esc(initial(user.email))}</span>
      <div class="grow"><div class="t">${esc(user.email)}</div><div class="s">Données sauvegardées en ligne</div></div>
    </div>
    <button class="btn ghost block" style="margin-top:10px" data-act="logout">Se déconnecter</button>
  </div>` : ''}
  <div class="card">
    <h2>Enfants</h2>
    ${S.enfants.length ? S.enfants.map(e => `<div class="list-item">
      <span class="avatar" style="background:var(--blue-soft);color:var(--blue)">${esc(initial(e.name))}</span>
      <div class="grow"><div class="t">${esc(e.name)}</div></div>
      <button class="link del" data-act="delKid" data-id="${e.id}">Suppr.</button>
    </div>`).join('') : '<p class="hint" style="margin-top:0">Aucun enfant pour l’instant.</p>'}
    <form id="kidForm" class="inline-add" style="margin-top:12px" autocomplete="off">
      <input type="text" id="k-name" placeholder="Prénom de l’enfant" required>
      <button class="btn" type="submit">Ajouter</button>
    </form>
  </div>

  <div class="card">
    <h2>Sauvegarde</h2>
    <p class="hint" style="margin:-4px 0 14px">${user ? 'Tes données sont déjà sauvegardées sur ton compte. Tu peux aussi en garder une copie dans un fichier.' : 'Tes données restent sur cet appareil. Exporte-les de temps en temps, ou pour les transférer sur un autre téléphone.'}</p>
    <div class="btn-row">
      <button class="btn soft" data-act="export">Exporter</button>
      <button class="btn soft" data-act="import">Importer</button>
    </div>
    <button class="btn soft block" style="margin-top:10px" data-act="csv">Exporter le mois en CSV</button>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
  </div>

  <div class="card">
    <h2>Zone sensible</h2>
    <button class="btn danger block" data-act="reset">Effacer toutes les données</button>
  </div>`;
}

/* ---------- Événements ---------- */
function bind() {
  const sf = $('#slotForm');
  if (sf) {
    sf.addEventListener('submit', submitSlot);
    sf.addEventListener('input', updatePreview);
    sf.addEventListener('change', updatePreview);
    sf.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      durMode = b.dataset.mode;
      sf.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
      $('#m-range').hidden = durMode !== 'range';
      $('#m-hours').hidden = durMode !== 'hours';
      updatePreview();
    }));
    updatePreview();
  }
  $('#nounouForm')?.addEventListener('submit', submitNounou);
  $('#kidForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#k-name').value.trim();
    if (!name) return;
    S.enfants.push({ id: uid(), name }); save(); render(); toast(`${name} ajouté·e`);
  });
  $('#importFile')?.addEventListener('change', importData);
}

function readSlotForm() {
  let minutes = 0, start = '', end = '';
  if (durMode === 'range') {
    start = $('#f-start').value; end = $('#f-end').value;
    if (start && end) { minutes = toMin(end) - toMin(start); if (minutes <= 0) minutes += 24 * 60; }
  } else {
    minutes = Math.round(num($('#f-h').value) * 60) + Number($('#f-m').value);
  }
  return {
    date: $('#f-date').value,
    nounouId: $('#f-nounou').value,
    minutes, start: durMode === 'range' ? start : '', end: durMode === 'range' ? end : '',
    enfants: [...document.querySelectorAll('input[name=kid]:checked')].map(i => i.value),
    taxi: round2(num($('#f-taxi').value)),
    note: $('#f-note').value.trim(),
    paid: $('#f-paid').checked,
  };
}

function updatePreview() {
  const p = $('#preview'); if (!p) return;
  const d = readSlotForm();
  if (!d.nounouId || !d.minutes) { p.textContent = 'Choisis une nounou et une durée pour voir le montant.'; return; }
  const g = garde(d), t = taxi(d);
  p.textContent = `${hm(d.minutes)} × ${eur(rate(d))}/h = ${eur(g)}${t ? ` + taxi ${eur(t)} = ${eur(g + t)}` : ''}`;
}

function submitSlot(e) {
  e.preventDefault();
  const d = readSlotForm();
  if (!d.date) return toast('Indique une date');
  if (!d.nounouId) return toast('Choisis une nounou');
  if (!d.minutes) return toast('Indique une durée');
  if (editSlot) {
    Object.assign(S.creneaux.find(x => x.id === editSlot), d);
    editSlot = null; toast('Créneau modifié');
  } else {
    S.creneaux.push({ id: uid(), ...d }); toast('Créneau ajouté ✓');
  }
  const [y, m] = d.date.split('-').map(Number); cur = { y, m: m - 1 };
  save(); render();
}

function submitNounou(e) {
  e.preventDefault();
  const d = {
    name: $('#n-name').value.trim(),
    rate1: round2(num($('#n-r1').value)),
    rate2: round2(num($('#n-r2').value)) || null,
    decl: $('#n-decl').value,
    active: $('#n-active').checked,
  };
  if (!d.name) return toast('Indique un prénom');
  if (!d.rate1) return toast('Indique un tarif horaire');
  if (editNounou) { Object.assign(nounou(editNounou), d); editNounou = null; toast('Nounou modifiée'); }
  else { S.nounous.push({ id: uid(), ...d }); toast(`${d.name} ajoutée ✓`); }
  save(); render();
}

document.addEventListener('click', e => {
  const tabBtn = e.target.closest('.tabs button');
  if (tabBtn) { tab = tabBtn.dataset.tab; editSlot = editNounou = null; render(); window.scrollTo(0, 0); return; }
  const go = e.target.closest('[data-goto]');
  if (go) { tab = go.dataset.goto; render(); window.scrollTo(0, 0); return; }
  const a = e.target.closest('[data-act]'); if (!a) return;
  const id = a.dataset.id;
  switch (a.dataset.act) {
    case 'prev': cur.m--; if (cur.m < 0) { cur.m = 11; cur.y--; } render(); break;
    case 'next': cur.m++; if (cur.m > 11) { cur.m = 0; cur.y++; } render(); break;
    case 'toggle': { const s = S.creneaux.find(x => x.id === id); s.paid = !s.paid; save(); render(); break; }
    case 'payall': monthSlots().filter(c => c.nounouId === id).forEach(c => c.paid = true); save(); render(); toast('Marqué comme payé ✓'); break;
    case 'unpayall': monthSlots().filter(c => c.nounouId === id).forEach(c => c.paid = false); save(); render(); break;
    case 'editSlot': editSlot = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'cancelSlot': editSlot = null; render(); break;
    case 'delSlot': if (confirm('Supprimer ce créneau ?')) { S.creneaux = S.creneaux.filter(x => x.id !== id); if (editSlot === id) editSlot = null; save(); render(); } break;
    case 'editNounou': editNounou = id; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'cancelNounou': editNounou = null; render(); break;
    case 'delNounou': {
      const used = S.creneaux.some(c => c.nounouId === id);
      if (used) { if (confirm('Cette nounou a des créneaux. La passer en « inactive » plutôt que la supprimer ?')) { nounou(id).active = false; save(); render(); } }
      else if (confirm('Supprimer cette nounou ?')) { S.nounous = S.nounous.filter(n => n.id !== id); save(); render(); }
      break;
    }
    case 'delKid': if (confirm('Supprimer cet enfant ?')) { S.enfants = S.enfants.filter(k => k.id !== id); S.creneaux.forEach(c => c.enfants = (c.enfants || []).filter(k => k !== id)); save(); render(); } break;
    case 'export': download(`mes-nounous-${todayISO()}.json`, JSON.stringify(S, null, 2), 'application/json'); break;
    case 'import': $('#importFile').click(); break;
    case 'csv': exportCSV(); break;
    case 'logout': signOut(); break;
    case 'reset': if (confirm('Effacer définitivement toutes les données ?') && confirm('Vraiment ? Pense à exporter avant.')) { S = { nounous: [], enfants: [], creneaux: [] }; save(); tab = 'mois'; render(); } break;
  }
});

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCSV() {
  const rows = [['Date', 'Nounou', 'Début', 'Fin', 'Heures', 'Enfants', 'Tarif/h', 'Garde', 'Taxi', 'Total', 'Payé', 'Note']];
  for (const c of monthSlots()) {
    rows.push([c.date, nounou(c.nounouId)?.name || '', c.start, c.end, (c.minutes / 60).toFixed(2).replace('.', ','),
      (c.enfants || []).map(id => enfant(id)?.name).join(' + '), String(rate(c)).replace('.', ','),
      garde(c).toFixed(2).replace('.', ','), taxi(c).toFixed(2).replace('.', ','), total(c).toFixed(2).replace('.', ','),
      c.paid ? 'oui' : 'non', c.note || '']);
  }
  const csv = '\ufeff' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  download(`nounous-${cur.y}-${pad(cur.m + 1)}.csv`, csv, 'text/csv');
}

function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.nounous) || !Array.isArray(d.creneaux)) throw 0;
      if (!confirm('Remplacer les données actuelles par celles du fichier ?')) return;
      S = { nounous: d.nounous, enfants: d.enfants || [], creneaux: d.creneaux };
      save(); render(); toast('Données importées ✓');
    } catch (err) { toast('Fichier invalide'); }
  };
  r.readAsText(f);
}

/* ---------- Démarrage ---------- */
(function greet() {
  const h = new Date().getHours();
  $('#hello').textContent = h < 5 ? 'Bonne nuit 🌙' : h < 18 ? 'Bonjour ☀️' : 'Bonsoir 🌙';
})();

if (!CLOUD) {
  render();
} else {
  ready = false;
  $('#view').innerHTML = `<div class="empty"><p>Chargement…</p></div>`;
  document.body.classList.add('auth');
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { recovery = true; authMode = 'reset'; authMsg = ''; render(); return; }
    const u = session?.user || null;
    if (u && !recovery && (!user || u.id !== user.id)) {
      setTimeout(() => signedIn(u), 0);     // hors du callback, comme le recommande Supabase
    } else if (!u) {
      user = null; ready = false; recovery = false; S = empty(); tab = 'mois';
      if (event === 'SIGNED_OUT') { authMode = 'login'; authMsg = ''; }
      setSync('ok'); render();
    }
  });
}
