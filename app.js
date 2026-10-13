/* Mes Nounous — carnet des heures de garde, des paiements et des taxis.
   Sans configuration : données stockées dans le navigateur (localStorage).
   Avec config.js rempli : compte par email + sauvegarde en ligne (Supabase). */

const KEY = 'mes-nounous-v1';
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const DAYS_SHORT = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const DECLS = ['Pajemploi', 'CESU', 'Aucune'];

const CFG = window.MN_CONFIG || {};
const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase);
// « Rester connectée » : la session est gardée sur l'appareil (localStorage) ou seulement le temps de la visite (sessionStorage).
const remember = () => { try { return localStorage.getItem('mn-remember') !== '0'; } catch (e) { return true; } };
const authStorage = {
  getItem: k => { try { return localStorage.getItem(k) ?? sessionStorage.getItem(k); } catch (e) { return null; } },
  setItem: (k, v) => {
    try {
      if (remember()) { localStorage.setItem(k, v); sessionStorage.removeItem(k); }
      else { sessionStorage.setItem(k, v); localStorage.removeItem(k); }
    } catch (e) {}
  },
  removeItem: k => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} },
};
const sb = CLOUD ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;
const lastEmail = () => { try { return localStorage.getItem('mn-email') || ''; } catch (e) { return ''; } };

let user = null;          // utilisateur connecté (mode en ligne)
let ready = !CLOUD;       // données chargées et prêtes à afficher
let recovery = false;     // retour depuis le lien « mot de passe oublié »
let authMode = 'login';   // login | signup | forgot | reset
let authMsg = '';
let admin = null;         // statistiques (null = pas encore demandées, false = pas admin)

let S = CLOUD ? empty() : loadLocal(KEY);
let tab = 'home';
const now = new Date();
let cur = { y: now.getFullYear(), m: now.getMonth() };
let sheet = null;         // { type: 'garde' | 'nounou', id?, decl? }
let draft = null;         // état du formulaire de garde

/* ---------- Données ---------- */
function empty() { return { nounous: [], enfants: [], creneaux: [] }; }
function normalize(d) { return d && Array.isArray(d.nounous) ? { ...empty(), ...d } : empty(); }
function loadLocal(key) {
  try { return normalize(JSON.parse(localStorage.getItem(key))); } catch (e) { return empty(); }
}
const hasData = d => d.nounous.length || d.creneaux.length || d.enfants.length;
const cacheKey = () => user ? `${KEY}-${user.id}` : KEY;

function save() {
  try { if (!user || remember()) localStorage.setItem(cacheKey(), JSON.stringify(S)); }
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
    try { if (remember()) localStorage.setItem(cacheKey(), JSON.stringify(S)); } catch (e) {}
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
    toast('Tes données ont été ajoutées à ton compte');
  }
}
window.addEventListener('online', () => { if (user && dirty) push(); });
document.addEventListener('visibilitychange', async () => {
  if (document.hidden || !user || !ready || dirty || pushing || recovery || sheet) return;
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
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const hm = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`; };
const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const initial = s => (s || '?').trim().charAt(0).toUpperCase() || '?';
const comma = v => (v === '' || v == null) ? '' : String(v).replace('.', ',');
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const slotMinutes = (a, b) => { if (!a || !b) return 0; let m = toMin(b) - toMin(a); if (m <= 0) m += 24 * 60; return m; };
const addMin = (t, n) => { const m = ((toMin(t) + n) % 1440 + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
function holidays(y) { // jours fériés en France métropolitaine
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(y, month - 1, day);
  const plus = n => { const x = new Date(easter); x.setDate(x.getDate() + n); return x; };
  return new Set([new Date(y, 0, 1), plus(1), new Date(y, 4, 1), new Date(y, 4, 8), plus(39), plus(50),
    new Date(y, 6, 14), new Date(y, 7, 15), new Date(y, 10, 1), new Date(y, 10, 11), new Date(y, 11, 25)].map(isoOf));
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- Calculs ---------- */
const nounou = id => S.nounous.find(n => n.id === id);
const enfant = id => S.enfants.find(e => e.id === id);

function who(c) {
  if (c.adhoc) return { key: 'adhoc:' + (c.adhoc.name || '').trim().toLowerCase(), name: c.adhoc.name || 'Ponctuelle', adhoc: true };
  const n = nounou(c.nounouId);
  return { key: c.nounouId, name: n ? n.name : 'Nounou supprimée', decl: n?.decl, adhoc: false };
}
function rate(c) {
  if (c.adhoc) return c.adhoc.mode === 'flat' ? null : num(c.adhoc.amount);
  const n = nounou(c.nounouId);
  if (!n) return 0;
  return (c.enfants?.length >= 2 && n.rate2) ? n.rate2 : n.rate1;
}
function garde(c) {
  if (c.adhoc && c.adhoc.mode === 'flat') return round2(num(c.adhoc.amount));
  return round2((c.minutes || 0) / 60 * (rate(c) || 0));
}
const taxi = c => num(c.taxi);
const total = c => garde(c) + taxi(c);
const inMonth = c => { const [y, m] = c.date.split('-').map(Number); return y === cur.y && m - 1 === cur.m; };
const monthSlots = () => S.creneaux.filter(inMonth).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));

function groupByWho(slots) {
  const map = new Map();
  for (const c of slots) {
    const w = who(c);
    if (!map.has(w.key)) map.set(w.key, { who: w, slots: [] });
    map.get(w.key).slots.push(c);
  }
  return [...map.values()].map(x => {
    const t = sum(x.slots, total), p = sum(x.slots.filter(c => c.paid), total);
    return { ...x, total: t, paid: p, due: round2(t - p), mins: sum(x.slots, c => c.minutes || 0), taxi: sum(x.slots, taxi), count: x.slots.length };
  });
}

/* ---------- Rendu ---------- */
function render() {
  const v = $('#view');
  const needAuth = CLOUD && (!user || recovery);
  document.body.classList.toggle('auth', needAuth || !ready);
  if (needAuth) { closeSheet(true); v.innerHTML = viewAuth(); bindAuth(); return; }
  if (!ready) { v.innerHTML = `<div class="loading">Chargement de ton carnet…</div>`; return; }
  document.querySelectorAll('.nav [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  v.innerHTML = { home: viewHome, journal: viewJournal, famille: viewFamille, compte: viewCompte }[tab]();
  const on = $('.mchip.on');
  if (on) on.parentElement.scrollLeft = on.offsetLeft - on.parentElement.clientWidth / 2 + on.clientWidth / 2;
  bindView();
  if (tab === 'compte') loadAdmin();
}

function monthStrip() {
  const items = [];
  for (let i = -11; i <= 1; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    items.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  if (!items.some(x => x.y === cur.y && x.m === cur.m)) {
    items.push({ ...cur });
    items.sort((a, b) => a.y - b.y || a.m - b.m);
  }
  return `<div class="months" role="tablist" aria-label="Mois">${items.map(x => {
    const on = x.y === cur.y && x.m === cur.m;
    return `<button class="mchip ${on ? 'on' : ''}" role="tab" aria-selected="${on}" data-act="month" data-y="${x.y}" data-m="${x.m}">${MONTHS_SHORT[x.m]}${x.y !== now.getFullYear() ? ` <small>${String(x.y).slice(2)}</small>` : ''}</button>`;
  }).join('')}</div>`;
}

function welcome() {
  return `<section class="welcome">
    <h2>Bienvenue !</h2>
    <p>Trois étapes pour commencer ton carnet.</p>
    <ol class="steps">
      <li class="${S.nounous.length ? 'done' : ''}"><b>Ajoute ta nounou</b><span>Son prénom et son tarif horaire.</span>
        <button class="btn small" data-act="newNounou">Ajouter</button></li>
      <li class="${S.enfants.length ? 'done' : ''}"><b>Ajoute tes enfants</b><span>Pour voir le temps de garde de chacun.</span>
        <button class="btn small ghost" data-tab="famille">Ouvrir</button></li>
      <li><b>Note ta première garde</b><span>Avec le bouton + en bas. Une baby-sitter de dépannage ? Choisis « Ponctuelle ».</span>
        <button class="btn small ghost" data-act="newGarde">Noter</button></li>
    </ol>
  </section>`;
}

/* --- Accueil --- */
function viewHome() {
  if (!S.nounous.length && !S.creneaux.length) return welcome();
  const slots = monthSlots();
  const tot = sum(slots, total), paid = sum(slots.filter(c => c.paid), total), due = round2(tot - paid);
  const mins = sum(slots, c => c.minutes || 0), tx = sum(slots, taxi);
  const pct = tot ? Math.round(paid / tot * 100) : 0;

  let h = monthStrip();
  h += `<section class="hero">
    <div class="hero-label">Total de ${MONTHS[cur.m]}</div>
    <div class="hero-amount">${eur(tot)}</div>
    <div class="hero-line">${slots.length
      ? `${hm(mins)} de garde${tx ? ` · dont ${eur(tx)} de taxi` : ''}`
      : 'Aucune garde notée ce mois-ci.'}</div>
    ${tot ? `<div class="meter" role="img" aria-label="${pct} % réglé"><span style="width:${pct}%"></span></div>
    <div class="hero-split">
      <div class="paid"><small>Réglé</small><b>${eur(paid)}</b></div>
      <div class="${due > 0.004 ? 'due' : 'clear'}"><small>Reste à régler</small><b>${due > 0.004 ? eur(due) : 'Rien ✓'}</b></div>
    </div>` : ''}
  </section>`;

  if (!slots.length) {
    return h + `<div class="empty"><p>Note ta première garde de ${MONTHS[cur.m]}.</p><div class="btn-wrap">
      ${hasWeek() ? `<button class="btn" data-act="fill">Préremplir avec la semaine type</button>` : ''}
      <button class="btn ${hasWeek() ? 'ghost' : ''}" data-act="newGarde">Ajouter une garde</button></div></div>`;
  }
  const groups = groupByWho(slots);
  const dueG = groups.filter(x => x.due > 0.004), okG = groups.filter(x => x.due <= 0.004);
  if (dueG.length) h += `<h3 class="sec">À régler</h3><div class="tickets">${dueG.map(ticket).join('')}</div>`;
  if (okG.length) h += `<h3 class="sec">Réglé</h3><div class="tickets">${okG.map(ticket).join('')}</div>`;
  if (S.enfants.length) {
    h += `<h3 class="sec">Temps de garde par enfant</h3><div class="kids">${S.enfants.map(e => {
      const m = sum(slots.filter(c => c.enfants?.includes(e.id)), c => c.minutes || 0);
      return `<div class="kid"><span class="kid-dot">${esc(initial(e.name))}</span><span>${esc(e.name)}</span><b>${hm(m)}</b></div>`;
    }).join('')}</div>`;
  }
  return h;
}

function whoTag(w) {
  if (w.adhoc) return '<span class="tag sun">Ponctuelle</span>';
  if (w.decl && w.decl !== 'Aucune' && w.decl !== 'Non déclarée') return `<span class="tag">${esc(w.decl)}</span>`;
  return '';
}

function ticket(x) {
  const done = x.due <= 0.004;
  return `<article class="ticket ${done ? 'done' : ''}">
    <div class="ticket-main">
      <span class="who-badge ${x.who.adhoc ? 'adhoc' : ''}">${esc(initial(x.who.name))}</span>
      <div class="ticket-txt">
        <div class="ticket-name">${esc(x.who.name)} ${whoTag(x.who)}</div>
        <div class="ticket-sub">${x.count} garde${x.count > 1 ? 's' : ''} · ${hm(x.mins)}${x.taxi ? ` · taxi ${eur(x.taxi)}` : ''}</div>
      </div>
      <div class="ticket-amt">${eur(done ? x.total : x.due)}</div>
    </div>
    <div class="ticket-foot">${done
      ? `<span class="ok-txt">Tout est réglé</span><button class="link" data-act="unpayall" data-key="${esc(x.who.key)}">Annuler</button>`
      : `<span class="muted-txt">${x.paid > 0.004 ? `Déjà payé : ${eur(x.paid)} sur ${eur(x.total)}` : 'Rien de payé ce mois-ci'}</span>
         <button class="btn small" data-act="payall" data-key="${esc(x.who.key)}">C’est réglé</button>`}
    </div>
    <button class="report-link" data-act="report" data-key="${esc(x.who.key)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>Relevé PDF de ${MONTHS[cur.m]}</button>
  </article>`;
}

/* --- Journal --- */
function viewJournal() {
  if (!S.nounous.length && !S.creneaux.length) return welcome();
  let h = monthStrip();
  const slots = monthSlots().reverse();
  h += `<div class="journal-head"><h2>Journal de ${MONTHS[cur.m]}</h2><span class="muted-txt">${slots.length} garde${slots.length > 1 ? 's' : ''}</span></div>`;
  if (hasWeek()) h += `<button class="btn ghost block fill-btn" data-act="fill">Préremplir avec la semaine type</button>`;
  else if (S.nounous.length && !slots.length) h += `<p class="hint" style="margin:0 2px 14px">Astuce : renseigne la semaine type de ta nounou (onglet Famille) pour préremplir le journal en un geste.</p>`;
  if (!slots.length) return h + `<div class="empty"><p>Rien de noté en ${MONTHS[cur.m]}.</p><button class="btn" data-act="newGarde">Ajouter une garde</button></div>`;
  h += '<div class="entries">';
  for (const c of slots) {
    const d = new Date(c.date + 'T12:00:00');
    const w = who(c);
    const kids = (c.enfants || []).map(id => enfant(id)?.name).filter(Boolean).join(', ');
    const dur = c.minutes ? hm(c.minutes) : 'Forfait';
    h += `<div class="entry ${c.paid ? 'paid' : ''}">
      <button class="entry-open" data-act="editGarde" data-id="${c.id}" aria-label="Modifier la garde du ${d.getDate()} ${MONTHS[d.getMonth()]}">
        <span class="date-block"><b>${d.getDate()}</b><small>${DAYS_SHORT[d.getDay()]}</small></span>
        <span class="entry-txt">
          <span class="entry-who">${esc(w.name)} ${w.adhoc ? '<span class="tag sun">Ponctuelle</span>' : ''}</span>
          <span class="entry-meta">${c.start ? `${c.start}–${c.end} · ` : ''}${dur}${kids ? ' · ' + esc(kids) : ''}${taxi(c) ? ` · taxi ${eur(taxi(c))}` : ''}</span>
          ${c.note ? `<span class="entry-note">${esc(c.note)}</span>` : ''}
        </span>
        <span class="entry-amt">${eur(total(c))}</span>
      </button>
      <button class="pay ${c.paid ? 'on' : ''}" data-act="toggle" data-id="${c.id}" aria-pressed="${!!c.paid}">${c.paid ? 'Réglé ✓' : 'À régler'}</button>
    </div>`;
  }
  return h + '</div>';
}

/* --- Famille --- */
function viewFamille() {
  let h = `<div class="page-head"><h2>Nounous</h2><button class="btn small" data-act="newNounou">Ajouter</button></div>`;
  if (!S.nounous.length) {
    h += `<div class="empty"><p>Aucune nounou pour l’instant.</p></div>`;
  } else {
    h += `<div class="people">${S.nounous.map(n => `<button class="person ${n.active ? '' : 'off'}" data-act="editNounou" data-id="${n.id}">
      <span class="who-badge">${esc(initial(n.name))}</span>
      <span class="person-txt"><b>${esc(n.name)}</b><small>${eur(n.rate1)} / h${n.rate2 ? ` · ${eur(n.rate2)} / h à plusieurs` : ''}</small>
        <small>${n.week?.length ? `Semaine type : ${weekDays(n.week)} · ${hm(weekMinutes(n.week))}` : 'Pas de semaine type'}</small></span>
      <span class="tag">${n.active ? esc(n.decl === 'Non déclarée' ? 'Aucune' : (n.decl || 'Aucune')) : 'Archivée'}</span>
    </button>`).join('')}</div>`;
  }
  h += `<p class="hint">Une baby-sitter occasionnelle ? Pas besoin de l’ajouter ici : choisis « Ponctuelle » au moment de noter la garde.</p>`;
  h += `<div class="page-head"><h2>Enfants</h2></div>
    ${S.enfants.length ? `<div class="kids-edit">${S.enfants.map(e => `<span class="kid-chip">${esc(e.name)}<button data-act="delKid" data-id="${e.id}" data-confirm="Retirer" aria-label="Retirer ${esc(e.name)}">×</button></span>`).join('')}</div>` : ''}
    <form id="kidForm" class="inline-add" autocomplete="off">
      <input type="text" id="k-name" placeholder="Prénom" aria-label="Prénom de l’enfant" required>
      <button class="btn" type="submit">Ajouter</button>
    </form>`;
  return h;
}

/* --- Compte --- */
function privacyText() {
  const c = CFG.contactEmail;
  return `<div class="legal">
    <p>${CLOUD
      ? 'Ton email et ce que tu notes dans l’app (nounous, enfants, gardes, montants) sont enregistrés chez notre hébergeur, Supabase, uniquement pour faire fonctionner l’app et te permettre de les retrouver sur tous tes appareils.'
      : 'Ce que tu notes dans l’app reste dans ce navigateur, sur cet appareil.'}</p>
    <p>Ces informations ne sont ni revendues ni utilisées pour de la publicité.${CLOUD ? ' Seule l’administratrice de l’app voit la liste des emails inscrits.' : ''}</p>
    <p>Tu peux exporter tes données ou ${CLOUD ? 'supprimer ton compte' : 'tout effacer'} à tout moment${c ? `. Pour toute question : <b>${esc(c)}</b>` : ''}.</p>
  </div>`;
}

function viewCompte() {
  let h = '';
  if (user) {
    h += `<section class="panel"><h2>Mon compte</h2>
      <div class="row"><span class="who-badge">${esc(initial(user.email))}</span>
        <div class="grow"><b>${esc(user.email)}</b><small>Ton carnet est sauvegardé en ligne.</small></div></div>
      <button class="btn ghost block" data-act="logout">Se déconnecter</button></section>
      <section class="panel" id="adminPanel" hidden></section>`;
  }
  h += `<section class="panel"><h2>Sauvegarde</h2>
    <p class="legal" style="margin-top:-4px;color:var(--muted);font-size:14px">${user ? 'Ton carnet est déjà sauvegardé sur ton compte. Tu peux aussi en garder une copie dans un fichier.' : 'Ton carnet reste sur cet appareil. Exporte-le de temps en temps pour ne rien perdre.'}</p>
    <div class="btn-row"><button class="btn ghost" data-act="export">Exporter</button><button class="btn ghost" data-act="import">Importer</button></div>
    <button class="btn ghost block" data-act="csv">Tableau de ${MONTHS[cur.m]} (CSV)</button>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
  </section>
  <section class="panel"><h2>Données personnelles</h2>${privacyText()}
    ${user
      ? `<button class="btn danger block" data-act="deleteAccount" data-confirm="Toucher encore pour tout supprimer">Supprimer mon compte et mes données</button>`
      : `<button class="btn danger block" data-act="reset" data-confirm="Toucher encore pour tout effacer">Effacer toutes les données</button>`}
  </section>`;
  return h;
}

/* --- Statistiques (administratrice) --- */
async function loadAdmin(force) {
  if (!user || admin === false) return;
  if (!admin || force) {
    const { data, error } = await sb.rpc('admin_stats');
    if (error || !data) { admin = false; return; }
    admin = data;
  }
  const el = $('#adminPanel');
  if (!el) return;
  el.hidden = false;
  el.innerHTML = adminHTML(admin);
}

function adminHTML(a) {
  const days = a.days || [];
  const max = Math.max(1, ...days.map(d => d.n));
  const W = 300, H = 80, bw = days.length ? W / days.length : W;
  const bars = days.map((d, i) => {
    const bh = d.n ? Math.max(3, d.n / max * (H - 6)) : 0;
    return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5"><title>${new Date(d.d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : ${d.n}</title></rect>`;
  }).join('');
  const fmt = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';
  return `<h2>Inscriptions <span class="tag sun">Admin</span></h2>
    <div class="stats">
      <div class="stat"><b>${a.total ?? 0}</b><small>comptes au total</small></div>
      <div class="stat"><b>${a.last7 ?? 0}</b><small>ces 7 derniers jours</small></div>
      <div class="stat"><b>${a.last30 ?? 0}</b><small>ces 30 derniers jours</small></div>
      <div class="stat"><b>${a.active7 ?? 0}</b><small>connectés cette semaine</small></div>
    </div>
    <div class="chart-title">Nouveaux comptes par jour (30 jours)</div>
    <svg class="bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Nouveaux comptes par jour sur 30 jours, maximum ${max}"><line x1="0" y1="${H - .5}" x2="${W}" y2="${H - .5}"/>${bars}</svg>
    <div class="chart-axis"><span>${fmt(days[0]?.d)}</span><span>max ${max} / jour</span><span>aujourd’hui</span></div>
    ${a.latest?.length ? `<div class="chart-title">Derniers inscrits</div><ul class="latest">${a.latest.map(u => `<li><span>${esc(u.email)}</span><small>${fmt(u.at)}</small></li>`).join('')}</ul>` : ''}
    <button class="link" data-act="refreshAdmin">Actualiser</button>`;
}

/* ---------- Feuilles (formulaires) ---------- */
function openSheet(s) {
  sheet = s;
  if (s.type === 'garde') draft = makeDraft(s.id);
  if (s.type === 'nounou') {
    const n = s.id ? nounou(s.id) : null;
    const d = n?.decl === 'Non déclarée' ? 'Aucune' : (n?.decl || 'Pajemploi');
    sheet.decl = DECLS.includes(d) ? d : 'Aucune';
    sheet.draft = nounouDraft(n);
  }
  if (s.type === 'fill') {
    const isCur = cur.y === now.getFullYear() && cur.m === now.getMonth();
    sheet.period = isCur ? (weeksOfMonth().find(w => w.has)?.key || 'month') : 'month';
    sheet.skipHol = true;
  }
  renderSheet();
  setTimeout(() => $('.sheet-panel')?.focus(), 30);
}
function closeSheet(silent) {
  if (!sheet && silent) return;
  sheet = null; draft = null;
  renderSheet();
}
function renderSheet(still) {
  const root = $('#sheet');
  if (!sheet) { root.hidden = true; root.innerHTML = ''; document.body.classList.remove('sheet-open'); return; }
  root.hidden = false;
  root.classList.toggle('still', !!still);
  document.body.classList.add('sheet-open');
  const body = { garde: sheetGarde, nounou: sheetNounou, fill: sheetFill }[sheet.type]();
  root.innerHTML = `<div class="sheet-backdrop" data-act="closeSheet"></div>
    <div class="sheet-panel" role="dialog" aria-modal="true" tabindex="-1">${body}</div>`;
  ({ garde: bindGarde, nounou: bindNounou, fill: bindFill })[sheet.type]();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheet) closeSheet(); });

/* --- Garde --- */
function makeDraft(id) {
  const c = id ? S.creneaux.find(x => x.id === id) : null;
  if (c) {
    return {
      id: c.id, who: c.adhoc ? 'adhoc' : c.nounouId,
      adhoc: { name: c.adhoc?.name || '', mode: c.adhoc?.mode || 'hour', amount: c.adhoc ? comma(c.adhoc.amount) : '' },
      date: c.date, mode: c.start ? 'range' : 'dur', start: c.start || '', end: c.end || '',
      minutes: c.minutes || 0, enfants: [...(c.enfants || [])], taxi: c.taxi ? comma(c.taxi) : '', note: c.note || '', paid: !!c.paid,
    };
  }
  const actives = S.nounous.filter(n => n.active);
  const isCur = cur.y === now.getFullYear() && cur.m === now.getMonth();
  return {
    id: null, who: actives.length === 1 ? actives[0].id : (actives.length ? '' : 'adhoc'),
    adhoc: { name: '', mode: 'hour', amount: '' },
    date: isCur ? todayISO() : `${cur.y}-${pad(cur.m + 1)}-01`,
    mode: 'range', start: '', end: '', minutes: 120,
    enfants: S.enfants.length === 1 ? [S.enfants[0].id] : [],
    taxi: '', note: '', paid: false,
  };
}

function sheetGarde() {
  const d = draft;
  const people = S.nounous.filter(n => n.active || n.id === d.who);
  return `<form id="gardeForm" autocomplete="off" novalidate>
    <div class="sheet-head"><h2>${d.id ? 'Modifier la garde' : 'Nouvelle garde'}</h2>
      <button type="button" class="x" data-act="closeSheet" aria-label="Fermer">×</button></div>

    <div class="q"><span class="q-label">Avec qui ?</span>
      <div class="chips">
        ${people.map(n => `<button type="button" class="chip ${d.who === n.id ? 'on' : ''}" data-who="${n.id}" aria-pressed="${d.who === n.id}">${esc(n.name)}</button>`).join('')}
        <button type="button" class="chip dashed ${d.who === 'adhoc' ? 'on' : ''}" data-who="adhoc" aria-pressed="${d.who === 'adhoc'}">Ponctuelle</button>
      </div>
      <div class="adhoc" id="g-adhoc" ${d.who === 'adhoc' ? '' : 'hidden'}>
        <div class="field"><label for="g-aname">Prénom</label>
          <input type="text" id="g-aname" value="${esc(d.adhoc.name)}" placeholder="Ex : Lina, la voisine…"></div>
        <div class="seg">
          <button type="button" data-amode="hour" class="${d.adhoc.mode === 'hour' ? 'on' : ''}">À l’heure</button>
          <button type="button" data-amode="flat" class="${d.adhoc.mode === 'flat' ? 'on' : ''}">Forfait</button>
        </div>
        <div class="field"><label for="g-aamt" id="g-aamt-l">${d.adhoc.mode === 'flat' ? 'Montant total' : 'Tarif horaire'}</label>
          <div class="money"><input type="text" inputmode="decimal" id="g-aamt" value="${esc(d.adhoc.amount)}" placeholder="0,00"><span>€</span></div></div>
      </div>
    </div>

    <div class="q"><label class="q-label" for="g-date">Quel jour ?</label>
      <input type="date" id="g-date" value="${d.date}"></div>

    <div class="q"><span class="q-label">Combien de temps ?</span>
      <div class="seg">
        <button type="button" data-mode="range" class="${d.mode === 'range' ? 'on' : ''}">Horaires</button>
        <button type="button" data-mode="dur" class="${d.mode === 'dur' ? 'on' : ''}">Durée</button>
      </div>
      <div class="grid2" id="g-range" ${d.mode === 'range' ? '' : 'hidden'}>
        <div class="field"><label for="g-start">Arrivée</label><input type="time" id="g-start" value="${d.start}"></div>
        <div class="field"><label for="g-end">Départ</label><input type="time" id="g-end" value="${d.end}"></div>
        <div class="chips ext"><span class="muted-txt">Heures sup :</span>
          ${[15, 30, 60].map(m => `<button type="button" class="chip small" data-ext="${m}">+${m < 60 ? m + ' min' : '1 h'}</button>`).join('')}</div>
      </div>
      <div id="g-dur" ${d.mode === 'dur' ? '' : 'hidden'}>
        <div class="stepper">
          <button type="button" data-step="-15" aria-label="Moins 15 minutes">−</button>
          <output id="g-durv" aria-live="polite">${hm(d.minutes)}</output>
          <button type="button" data-step="15" aria-label="Plus 15 minutes">+</button>
        </div>
        <div class="chips quick">${[60, 120, 180, 240, 300, 480].map(m => `<button type="button" class="chip small" data-min="${m}">${m / 60} h</button>`).join('')}</div>
      </div>
    </div>

    ${S.enfants.length ? `<div class="q"><span class="q-label">Qui était gardé ?</span><div class="chips">
      ${S.enfants.map(e => `<button type="button" class="chip ${d.enfants.includes(e.id) ? 'on' : ''}" data-kid="${e.id}" aria-pressed="${d.enfants.includes(e.id)}">${esc(e.name)}</button>`).join('')}
    </div></div>` : ''}

    <div class="grid2">
      <div class="field"><label for="g-taxi">Taxi</label>
        <div class="money"><input type="text" inputmode="decimal" id="g-taxi" value="${esc(d.taxi)}" placeholder="0,00"><span>€</span></div></div>
      <div class="field"><label for="g-note">Note</label><input type="text" id="g-note" value="${esc(d.note)}" placeholder="Facultatif"></div>
    </div>

    <label class="toggle"><input type="checkbox" id="g-paid" ${d.paid ? 'checked' : ''}><span class="toggle-ui"></span><span>Déjà réglé</span></label>

    <div class="sum" id="g-sum" aria-live="polite"></div>
    <button class="btn block big" type="submit">${d.id ? 'Enregistrer' : 'Ajouter la garde'}</button>
    ${d.id ? `<button type="button" class="btn danger-ghost block" data-act="delGarde" data-id="${d.id}" data-confirm="Toucher encore pour supprimer">Supprimer cette garde</button>` : ''}
  </form>`;
}

function draftToSlot(d) {
  let minutes = 0;
  if (d.mode === 'range') {
    if (d.start && d.end) { minutes = toMin(d.end) - toMin(d.start); if (minutes <= 0) minutes += 24 * 60; }
  } else minutes = d.minutes;
  const s = {
    date: d.date, nounouId: d.who === 'adhoc' ? null : d.who,
    minutes, start: d.mode === 'range' ? d.start : '', end: d.mode === 'range' ? d.end : '',
    enfants: [...d.enfants], taxi: round2(num(d.taxi)), note: d.note.trim(), paid: d.paid,
  };
  if (d.who === 'adhoc') s.adhoc = { name: d.adhoc.name.trim(), mode: d.adhoc.mode, amount: round2(num(d.adhoc.amount)) };
  return s;
}

function updateSum() {
  const el = $('#g-sum'); if (!el || !draft) return;
  const d = draft, s = draftToSlot(d);
  const flat = s.adhoc && s.adhoc.mode === 'flat';
  let msg = '';
  if (!d.who) msg = 'Choisis avec qui.';
  else if (s.adhoc && !(s.adhoc.amount > 0)) msg = flat ? 'Indique le montant du forfait.' : 'Indique le tarif horaire.';
  else if (!s.minutes && !flat) msg = d.mode === 'range' ? 'Indique l’arrivée et le départ.' : 'Indique la durée.';
  if (msg) { el.innerHTML = `<span>${msg}</span>`; return; }
  const g = garde(s), t = taxi(s);
  el.innerHTML = `<span>${flat ? 'Forfait' : `${hm(s.minutes)} × ${eur(rate(s))}`}${t ? ` + taxi ${eur(t)}` : ''}</span><b>${eur(g + t)}</b>`;
}

function bindGarde() {
  const f = $('#gardeForm'), d = draft;
  const read = () => {
    d.adhoc.name = $('#g-aname').value;
    d.adhoc.amount = $('#g-aamt').value;
    d.date = $('#g-date').value;
    d.start = $('#g-start').value;
    d.end = $('#g-end').value;
    d.taxi = $('#g-taxi').value;
    d.note = $('#g-note').value;
    d.paid = $('#g-paid').checked;
    updateSum();
  };
  const pick = (attr, el) => f.querySelectorAll(`[${attr}]`).forEach(b => { b.classList.toggle('on', b === el); if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', b === el); });
  f.addEventListener('click', e => {
    const w = e.target.closest('[data-who]');
    if (w) {
      d.who = w.dataset.who; pick('data-who', w);
      $('#g-adhoc').hidden = d.who !== 'adhoc';
      if (d.who === 'adhoc' && !d.adhoc.name) $('#g-aname').focus();
      return updateSum();
    }
    const am = e.target.closest('[data-amode]');
    if (am) {
      d.adhoc.mode = am.dataset.amode; pick('data-amode', am);
      $('#g-aamt-l').textContent = d.adhoc.mode === 'flat' ? 'Montant total' : 'Tarif horaire';
      return updateSum();
    }
    const md = e.target.closest('[data-mode]');
    if (md) {
      d.mode = md.dataset.mode; pick('data-mode', md);
      $('#g-range').hidden = d.mode !== 'range';
      $('#g-dur').hidden = d.mode !== 'dur';
      return updateSum();
    }
    const st = e.target.closest('[data-step]');
    const qm = e.target.closest('[data-min]');
    if (st || qm) {
      d.minutes = qm ? Number(qm.dataset.min) : Math.max(0, d.minutes + Number(st.dataset.step));
      $('#g-durv').textContent = hm(d.minutes);
      return updateSum();
    }
    const ex = e.target.closest('[data-ext]');
    if (ex) {
      if (!d.end) { toast('Indique d’abord l’heure de départ'); return; }
      d.end = addMin(d.end, Number(ex.dataset.ext));
      $('#g-end').value = d.end;
      toast(`Départ décalé à ${d.end}`);
      return updateSum();
    }
    const k = e.target.closest('[data-kid]');
    if (k) {
      const id = k.dataset.kid, on = !d.enfants.includes(id);
      d.enfants = on ? [...d.enfants, id] : d.enfants.filter(x => x !== id);
      k.classList.toggle('on', on); k.setAttribute('aria-pressed', on);
      return updateSum();
    }
  });
  f.addEventListener('input', read);
  f.addEventListener('change', read);
  f.addEventListener('submit', e => { e.preventDefault(); read(); submitGarde(); });
  updateSum();
}

function submitGarde() {
  const d = draft, s = draftToSlot(d);
  const flat = s.adhoc && s.adhoc.mode === 'flat';
  if (!d.who) return toast('Choisis avec qui');
  if (s.adhoc && !s.adhoc.name) return toast('Indique le prénom de la personne');
  if (s.adhoc && !(s.adhoc.amount > 0)) return toast(flat ? 'Indique le montant du forfait' : 'Indique le tarif horaire');
  if (!s.date) return toast('Indique le jour');
  if (!s.minutes && !flat) return toast(d.mode === 'range' ? 'Indique l’arrivée et le départ' : 'Indique la durée');
  if (d.id) {
    const c = S.creneaux.find(x => x.id === d.id);
    delete c.adhoc;
    Object.assign(c, s);
    toast('Garde modifiée');
  } else {
    S.creneaux.push({ id: uid(), ...s });
    toast('Garde ajoutée');
  }
  const [y, m] = s.date.split('-').map(Number);
  cur = { y, m: m - 1 };
  save(); closeSheet(); render();
}

/* --- Nounou (fiche + semaine type) --- */
const DOW = [1, 2, 3, 4, 5, 6, 0];
const DOW_LABEL = { 1: 'Lun.', 2: 'Mar.', 3: 'Mer.', 4: 'Jeu.', 5: 'Ven.', 6: 'Sam.', 0: 'Dim.' };
const weekMinutes = week => sum(week || [], s => slotMinutes(s.start, s.end));
const weekDays = week => [...new Set((week || []).map(s => s.dow))].sort((a, b) => DOW.indexOf(a) - DOW.indexOf(b)).map(x => DOW_LABEL[x].replace('.', '')).join(', ');

function nounouDraft(n) {
  return {
    name: n?.name || '', rate1: n ? comma(n.rate1) : '', rate2: n?.rate2 ? comma(n.rate2) : '',
    active: n ? n.active : true,
    week: (n?.week || []).map(x => ({ ...x })),
    weekKids: n?.weekKids ? [...n.weekKids] : S.enfants.map(e => e.id),
  };
}

function sheetNounou() {
  const n = sheet.id ? nounou(sheet.id) : null, d = sheet.draft;
  const used = n && S.creneaux.some(c => c.nounouId === n.id);
  return `<form id="nounouForm" autocomplete="off" novalidate>
    <div class="sheet-head"><h2>${n ? esc(n.name) : 'Nouvelle nounou'}</h2>
      <button type="button" class="x" data-act="closeSheet" aria-label="Fermer">×</button></div>
    <div class="q"><div class="field"><label for="n-name">Prénom</label>
      <input type="text" id="n-name" value="${esc(d.name)}" placeholder="Ex : Inès" required></div></div>
    <div class="grid2">
      <div class="field"><label for="n-r1">Tarif horaire</label>
        <div class="money"><input type="text" inputmode="decimal" id="n-r1" value="${esc(d.rate1)}" placeholder="0,00"><span>€</span></div></div>
      <div class="field"><label for="n-r2">Avec plusieurs enfants</label>
        <div class="money"><input type="text" inputmode="decimal" id="n-r2" value="${esc(d.rate2)}" placeholder="Pareil"><span>€</span></div></div>
    </div>
    <div class="q"><span class="q-label">Déclarée via</span><div class="chips">
      ${DECLS.map(x => `<button type="button" class="chip ${sheet.decl === x ? 'on' : ''}" data-decl="${x}" aria-pressed="${sheet.decl === x}">${x}</button>`).join('')}
    </div></div>

    <div class="q week-box">
      <span class="q-label">Semaine type <small class="muted-txt">facultatif</small></span>
      <p class="hint" style="margin:0 0 12px">Ses horaires habituels. Le journal pourra ensuite se préremplir en un geste ; tu n’auras plus qu’à ajuster les heures sup.</p>
      <div class="week">${d.week.map((s, i) => `<div class="wrow">
        <select data-wi="${i}" data-wf="dow" aria-label="Jour">${DOW.map(x => `<option value="${x}" ${s.dow === x ? 'selected' : ''}>${DOW_LABEL[x]}</option>`).join('')}</select>
        <input type="time" data-wi="${i}" data-wf="start" value="${s.start}" aria-label="Arrivée">
        <input type="time" data-wi="${i}" data-wf="end" value="${s.end}" aria-label="Départ">
        <button type="button" class="wdel" data-wdel="${i}" aria-label="Retirer ce créneau">×</button>
      </div>`).join('')}</div>
      <div class="chips quick">
        <button type="button" class="chip small" data-wadd>+ Ajouter un jour</button>
        ${d.week.length ? '<button type="button" class="chip small" data-wrep>Même horaire du lundi au vendredi</button>' : ''}
      </div>
      ${d.week.length ? `<div class="hint" id="n-wtot" style="margin:10px 0 0">${hm(weekMinutes(d.week))} par semaine</div>` : ''}
      ${S.enfants.length > 1 && d.week.length ? `<div class="q-sub">Enfants gardés habituellement</div><div class="chips">
        ${S.enfants.map(e => `<button type="button" class="chip small ${d.weekKids.includes(e.id) ? 'on' : ''}" data-wkid="${e.id}" aria-pressed="${d.weekKids.includes(e.id)}">${esc(e.name)}</button>`).join('')}
      </div>` : ''}
    </div>

    ${n ? `<label class="toggle"><input type="checkbox" id="n-active" ${d.active ? 'checked' : ''}><span class="toggle-ui"></span><span>Toujours en poste</span></label>` : ''}
    <button class="btn block big" type="submit">${n ? 'Enregistrer' : 'Ajouter'}</button>
    ${n ? `<button type="button" class="btn danger-ghost block" data-act="delNounou" data-id="${n.id}" data-confirm="${used ? 'Toucher encore pour archiver' : 'Toucher encore pour supprimer'}">${used ? 'Archiver (ses gardes restent dans le journal)' : 'Supprimer'}</button>` : ''}
  </form>`;
}

function captureNounou() {
  const d = sheet.draft;
  d.name = $('#n-name').value; d.rate1 = $('#n-r1').value; d.rate2 = $('#n-r2').value;
  if ($('#n-active')) d.active = $('#n-active').checked;
  document.querySelectorAll('[data-wi]').forEach(el => {
    const s = d.week[Number(el.dataset.wi)]; if (!s) return;
    s[el.dataset.wf] = el.dataset.wf === 'dow' ? Number(el.value) : el.value;
  });
}

function bindNounou() {
  const f = $('#nounouForm'), d = sheet.draft;
  const again = () => { const p = $('.sheet-panel'), top = p ? p.scrollTop : 0; renderSheet(true); $('.sheet-panel').scrollTop = top; };
  f.addEventListener('click', e => {
    const b = e.target.closest('[data-decl]');
    if (b) {
      sheet.decl = b.dataset.decl;
      f.querySelectorAll('[data-decl]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
      return;
    }
    if (e.target.closest('[data-wadd]')) {
      captureNounou();
      const last = d.week[d.week.length - 1];
      const taken = new Set(d.week.map(s => s.dow));
      const next = last ? (DOW.find(x => !taken.has(x) && DOW.indexOf(x) > DOW.indexOf(last.dow)) ?? last.dow) : 1;
      d.week.push({ dow: next, start: last?.start || '16:30', end: last?.end || '19:00' });
      return again();
    }
    const del = e.target.closest('[data-wdel]');
    if (del) { captureNounou(); d.week.splice(Number(del.dataset.wdel), 1); return again(); }
    if (e.target.closest('[data-wrep]')) {
      captureNounou();
      const ref = d.week[0];
      d.week = [1, 2, 3, 4, 5].map(x => ({ dow: x, start: ref.start, end: ref.end })).concat(d.week.filter(s => s.dow === 0 || s.dow === 6));
      return again();
    }
    const k = e.target.closest('[data-wkid]');
    if (k) {
      const id = k.dataset.wkid, on = !d.weekKids.includes(id);
      d.weekKids = on ? [...d.weekKids, id] : d.weekKids.filter(x => x !== id);
      k.classList.toggle('on', on); k.setAttribute('aria-pressed', on);
    }
  });
  const upd = e => {
    if (!e.target.closest('.wrow')) return;
    captureNounou();
    const t = $('#n-wtot'); if (t) t.textContent = `${hm(weekMinutes(d.week))} par semaine`;
  };
  f.addEventListener('input', upd);
  f.addEventListener('change', upd);
  f.addEventListener('submit', e => {
    e.preventDefault();
    captureNounou();
    const week = d.week.filter(s => s.start && s.end)
      .sort((a, b) => DOW.indexOf(a.dow) - DOW.indexOf(b.dow) || a.start.localeCompare(b.start));
    const o = {
      name: d.name.trim(), rate1: round2(num(d.rate1)), rate2: round2(num(d.rate2)) || null,
      decl: sheet.decl, active: d.active, week, weekKids: d.weekKids.filter(id => enfant(id)),
    };
    if (!o.name) return toast('Indique un prénom');
    if (!o.rate1) return toast('Indique un tarif horaire');
    if (sheet.id) { Object.assign(nounou(sheet.id), o); toast('Modifications enregistrées'); }
    else { S.nounous.push({ id: uid(), ...o }); toast(`${o.name} est ajoutée`); }
    save(); closeSheet(); render();
  });
}

/* --- Préremplir avec la semaine type --- */
const hasWeek = () => S.nounous.some(n => n.active && n.week?.length);

function weeksOfMonth() {
  const first = new Date(cur.y, cur.m, 1), last = new Date(cur.y, cur.m + 1, 0);
  const d = new Date(first); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const out = [];
  while (d <= last) {
    const end = new Date(d); end.setDate(end.getDate() + 6);
    const s = d < first ? first : d, e = end > last ? last : end;
    out.push({ key: isoOf(d), from: isoOf(s), to: isoOf(e), label: `${s.getDate()}–${e.getDate()} ${MONTHS_SHORT[cur.m]}`, has: isoOf(s) <= todayISO() && todayISO() <= isoOf(e) });
    d.setDate(d.getDate() + 7);
  }
  return out;
}

function fillPlan() {
  const weeks = weeksOfMonth();
  let from, to;
  if (sheet.period === 'month') { from = isoOf(new Date(cur.y, cur.m, 1)); to = isoOf(new Date(cur.y, cur.m + 1, 0)); }
  else { const w = weeks.find(x => x.key === sheet.period) || weeks[0]; from = w.from; to = w.to; }
  const hol = holidays(cur.y);
  const people = S.nounous.filter(n => n.active && n.week?.length);
  const add = []; let skipped = 0, holSkipped = 0;
  for (let d = new Date(from + 'T12:00:00'); isoOf(d) <= to; d.setDate(d.getDate() + 1)) {
    const iso = isoOf(d), dow = d.getDay();
    for (const n of people) for (const s of n.week) {
      if (s.dow !== dow) continue;
      if (sheet.skipHol && hol.has(iso)) { holSkipped++; continue; }
      if (S.creneaux.some(c => c.nounouId === n.id && c.date === iso && (!c.start || c.start === s.start))) { skipped++; continue; }
      add.push({ id: uid(), date: iso, nounouId: n.id, start: s.start, end: s.end, minutes: slotMinutes(s.start, s.end),
        enfants: (n.weekKids || []).filter(id => enfant(id)), taxi: 0, note: '', paid: false });
    }
  }
  return { add, skipped, holSkipped };
}

function sheetFill() {
  const weeks = weeksOfMonth(), plan = fillPlan();
  const people = S.nounous.filter(n => n.active && n.week?.length).map(n => esc(n.name));
  const k = plan.add.length, s = k > 1 ? 's' : '';
  return `<div class="sheet-head"><h2>Préremplir ${MONTHS[cur.m]}</h2>
      <button type="button" class="x" data-act="closeSheet" aria-label="Fermer">×</button></div>
    <p class="hint" style="margin:4px 0 0">D’après la semaine type de ${people.join(' et ')}. Ensuite, touche une garde dans le journal pour ajouter des heures sup ou la supprimer en cas d’absence.</p>
    <div class="q"><span class="q-label">Quelle période ?</span><div class="chips">
      <button type="button" class="chip ${sheet.period === 'month' ? 'on' : ''}" data-period="month">Tout ${MONTHS[cur.m]}</button>
      ${weeks.map(w => `<button type="button" class="chip small ${sheet.period === w.key ? 'on' : ''}" data-period="${w.key}">${w.label}</button>`).join('')}
    </div></div>
    <label class="toggle"><input type="checkbox" id="f-hol" ${sheet.skipHol ? 'checked' : ''}><span class="toggle-ui"></span><span>Sauter les jours fériés</span></label>
    <div class="sum"><span>${k ? `${k} garde${s} · ${hm(sum(plan.add, c => c.minutes))}` : 'Rien à ajouter sur cette période'}
      ${plan.skipped ? `<br><small>${plan.skipped} déjà dans le journal, laissée${plan.skipped > 1 ? 's' : ''} telle${plan.skipped > 1 ? 's' : ''} quelle${plan.skipped > 1 ? 's' : ''}</small>` : ''}
      ${plan.holSkipped && sheet.skipHol ? `<br><small>${plan.holSkipped} férié${plan.holSkipped > 1 ? 's' : ''} sauté${plan.holSkipped > 1 ? 's' : ''}</small>` : ''}</span>
      <b>${eur(sum(plan.add, total))}</b></div>
    <button type="button" class="btn block big" data-act="doFill" ${k ? '' : 'disabled'}>${k ? `Ajouter ${k} garde${s}` : 'Rien à ajouter'}</button>`;
}

function bindFill() {
  const p = $('.sheet-panel');
  p.addEventListener('click', e => {
    const b = e.target.closest('[data-period]');
    if (b) { sheet.period = b.dataset.period; renderSheet(true); }
  });
  $('#f-hol').addEventListener('change', e => { sheet.skipHol = e.target.checked; renderSheet(true); });
}

function doFill() {
  const plan = fillPlan();
  S.creneaux.push(...plan.add);
  save(); closeSheet(); tab = 'journal'; render(); window.scrollTo(0, 0);
  toast(`${plan.add.length} garde${plan.add.length > 1 ? 's' : ''} ajoutée${plan.add.length > 1 ? 's' : ''}`);
}

/* --- Relevé PDF mensuel --- */
const pdfTxt = s => String(s).replace(/[  ]/g, ' ');

function buildReport(key) {
  const slots = monthSlots().filter(c => who(c).key === key);
  if (!slots.length) return null;
  const w = who(slots[0]);
  const n = w.adhoc ? null : nounou(key);
  const P = new MiniPDF(), L = 40, R = P.W - 40;
  const INK = [23, 32, 54], MUTED = [103, 112, 137], ACC = [29, 107, 120], LINE = [223, 227, 236], SOFT = [238, 241, 246], DUE = [200, 64, 92];
  const E = v => pdfTxt(eur(v));
  const monthLabel = `${MONTHS[cur.m].charAt(0).toUpperCase() + MONTHS[cur.m].slice(1)} ${cur.y}`;

  // En-tête
  P.rect(0, 0, P.W, 8, ACC);
  P.text(L, 52, 'Relevé de garde', { bold: true, size: 22, color: INK });
  P.text(R, 52, monthLabel, { bold: true, size: 14, color: ACC, align: 'right' });
  P.text(L, 76, w.adhoc ? `${w.name} · garde ponctuelle` : `${w.name}${n?.decl && n.decl !== 'Aucune' && n.decl !== 'Non déclarée' ? ` · déclarée via ${n.decl}` : ''}`, { size: 11, color: MUTED });
  if (n) P.text(L, 92, pdfTxt(`Tarif : ${eur(n.rate1)} / h${n.rate2 ? ` (${eur(n.rate2)} / h avec plusieurs enfants)` : ''}`), { size: 9.5, color: MUTED });

  // Synthèse
  const tot = sum(slots, total), gardeTot = sum(slots, garde), tx = sum(slots, taxi);
  const paid = sum(slots.filter(c => c.paid), total), due = round2(tot - paid);
  const mins = sum(slots, c => c.minutes || 0), days = new Set(slots.map(c => c.date)).size;
  const boxes = [['Heures', hm(mins)], ['Jours', String(days)], ['Garde', E(gardeTot)], ['Taxis', E(tx)], ['Total', E(tot)]];
  const bw = (R - L - 4 * 8) / 5, by = 112;
  boxes.forEach(([k, v], i) => {
    const x = L + i * (bw + 8);
    P.rect(x, by, bw, 50, i === 4 ? INK : SOFT);
    P.text(x + 10, by + 18, k, { size: 8.5, color: i === 4 ? [174, 182, 204] : MUTED });
    P.text(x + 10, by + 38, v, { size: 14, bold: true, color: i === 4 ? [255, 203, 69] : INK });
  });
  P.text(L, by + 70, `Déjà payé : ${E(paid)}`, { size: 10, color: INK });
  P.text(R, by + 70, due > 0.004 ? `Reste à payer : ${E(due)}` : 'Tout est payé', { size: 10, bold: true, color: due > 0.004 ? DUE : ACC, align: 'right' });

  // Tableau
  const cols = [
    { t: 'Date', w: 62 }, { t: 'Horaires', w: 76 }, { t: 'Durée', w: 50 }, { t: 'Enfants', w: 105 },
    { t: 'Garde', w: 60, r: 1 }, { t: 'Taxi', w: 52, r: 1 }, { t: 'Total', w: 60, r: 1 }, { t: 'Payé', w: 50, r: 1 },
  ];
  let y = by + 96;
  const header = () => {
    P.rect(L, y, R - L, 22, SOFT);
    let x = L;
    cols.forEach(c => { P.text(c.r ? x + c.w - 6 : x + 6, y + 14.5, c.t, { size: 8.5, bold: true, color: MUTED, align: c.r ? 'right' : 'left' }); x += c.w; });
    y += 22;
  };
  header();
  for (const c of slots) {
    const h = c.note ? 32 : 22;
    if (y + h > P.H - 70) { P.addPage(); y = 40; header(); }
    const d = new Date(c.date + 'T12:00:00');
    const kids = (c.enfants || []).map(id => enfant(id)?.name).filter(Boolean).join(', ');
    const cells = [
      `${DAYS_SHORT[d.getDay()]} ${d.getDate()}`, c.start ? `${c.start} – ${c.end}` : (c.adhoc?.mode === 'flat' ? 'Forfait' : '—'),
      c.minutes ? hm(c.minutes) : '—', kids || '—', E(garde(c)), taxi(c) ? E(taxi(c)) : '—', E(total(c)), c.paid ? 'Oui' : 'Non',
    ];
    let x = L;
    cells.forEach((v, i) => {
      const col = cols[i];
      const txt = MiniPDF.fit(pdfTxt(v), i === 6, 9, col.w - 12);
      P.text(col.r ? x + col.w - 6 : x + 6, y + 14.5, txt, { size: 9, bold: i === 6, color: i === 7 && !c.paid ? DUE : INK, align: col.r ? 'right' : 'left' });
      x += col.w;
    });
    if (c.note) P.text(L + cols[0].w + 6, y + 26, MiniPDF.fit(pdfTxt(c.note), false, 8, 220), { size: 8, color: MUTED });
    y += h;
    P.line(L, y, R, y, LINE);
  }
  // Ligne de total
  if (y + 26 > P.H - 70) { P.addPage(); y = 40; }
  P.rect(L, y, R - L, 24, SOFT);
  P.text(L + 6, y + 16, 'Total du mois', { size: 9.5, bold: true, color: INK });
  P.text(L + cols[0].w + cols[1].w + 6, y + 16, hm(mins), { size: 9.5, bold: true, color: INK });
  const xr = i => L + cols.slice(0, i + 1).reduce((s, c) => s + c.w, 0) - 6;
  P.text(xr(4), y + 16, E(gardeTot), { size: 9.5, bold: true, color: INK, align: 'right' });
  P.text(xr(5), y + 16, E(tx), { size: 9.5, bold: true, color: INK, align: 'right' });
  P.text(xr(6), y + 16, E(tot), { size: 9.5, bold: true, color: INK, align: 'right' });
  y += 44;

  if (n && n.decl === 'Pajemploi') {
    if (y + 40 > P.H - 50) { P.addPage(); y = 40; }
    P.text(L, y, 'Repères pour la déclaration Pajemploi', { size: 9.5, bold: true, color: ACC });
    P.text(L, y + 15, pdfTxt(`${hm(mins)} de garde sur ${days} jour${days > 1 ? 's' : ''} · rémunération ${eur(gardeTot)} (hors taxis, calculée avec le tarif saisi)`), { size: 9, color: INK });
    y += 34;
  }
  // Pied de page
  const stamp = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  P.pages.forEach((_, i) => {
    P.ops = P.pages[i];
    P.line(L, P.H - 40, R, P.H - 40, LINE);
    P.text(L, P.H - 26, `Établi le ${stamp} avec Mes Nounous, d’après les gardes saisies.`, { size: 8, color: MUTED });
    if (P.pages.length > 1) P.text(R, P.H - 26, `${i + 1} / ${P.pages.length}`, { size: 8, color: MUTED, align: 'right' });
  });
  const slug = w.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  return { bytes: P.output(), name: `releve-${slug}-${cur.y}-${pad(cur.m + 1)}.pdf`, title: `Relevé ${w.name} – ${monthLabel}` };
}

async function shareReport(key) {
  let r;
  try { r = buildReport(key); } catch (e) { console.error(e); return toast('Impossible de créer le relevé'); }
  if (!r) return toast('Aucune garde ce mois-ci');
  const file = new File([r.bytes], r.name, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: r.title }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  download(r.name, r.bytes, 'application/pdf');
}

/* ---------- Connexion ---------- */
function viewAuth() {
  const t = {
    login: ['Content de te revoir', 'Connecte-toi pour retrouver ton carnet.', 'Se connecter'],
    signup: ['Crée ton carnet', 'Un email et un mot de passe suffisent. Ton carnet sera sauvegardé en ligne.', 'Créer mon compte'],
    forgot: ['Mot de passe oublié', 'On t’envoie un lien par email pour en choisir un nouveau.', 'Envoyer le lien'],
    reset: ['Nouveau mot de passe', 'Choisis ton nouveau mot de passe.', 'Enregistrer'],
  }[authMode];
  const email = authMode !== 'reset', pwd = authMode !== 'forgot';
  return `<div class="auth-wrap">
    <div class="auth-intro"><h2>${t[0]}</h2><p>${t[1]}</p></div>
    <form class="panel" id="authForm" autocomplete="on">
      ${authMsg ? `<div class="auth-msg">${esc(authMsg)}</div>` : ''}
      ${email ? `<div class="field"><label for="a-email">Email</label>
        <input type="email" id="a-email" name="username" autocomplete="username" inputmode="email" placeholder="toi@exemple.fr" value="${esc(lastEmail())}" required></div>` : ''}
      ${pwd ? `<div class="field"><label for="a-pwd">Mot de passe</label>
        <input type="password" id="a-pwd" name="password" minlength="6" required
          autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" placeholder="6 caractères minimum"></div>` : ''}
      ${authMode === 'login' || authMode === 'signup' ? `<label class="toggle"><input type="checkbox" id="a-remember" ${remember() ? 'checked' : ''}><span class="toggle-ui"></span><span>Rester connectée sur ce téléphone</span></label>` : ''}
      <button class="btn block big" type="submit" id="a-submit">${t[2]}</button>
      <div class="auth-links">
        ${authMode === 'login' ? `<button type="button" class="link" data-auth="signup">Créer un compte</button>
          <button type="button" class="link" data-auth="forgot">Mot de passe oublié ?</button>` : ''}
        ${authMode === 'signup' || authMode === 'forgot' ? `<button type="button" class="link" data-auth="login">J’ai déjà un compte</button>` : ''}
      </div>
      ${authMode === 'signup' ? `<details class="legal-details"><summary>Ce que l’app fait de tes données</summary>${privacyText()}</details>` : ''}
    </form>
  </div>`;
}

const AUTH_ERRORS = [
  [/invalid login/i, 'Email ou mot de passe incorrect.'],
  [/email not confirmed/i, 'Confirme d’abord ton email avec le lien reçu.'],
  [/already registered|already exists/i, 'Un compte existe déjà avec cet email. Connecte-toi.'],
  [/password should be|at least 6/i, 'Le mot de passe doit faire au moins 6 caractères.'],
  [/rate limit|too many/i, 'Trop d’essais. Réessaie dans quelques minutes.'],
  [/signups not allowed|signup is disabled/i, 'Les inscriptions sont fermées pour le moment.'],
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
    try {
      if ($('#a-remember')) localStorage.setItem('mn-remember', $('#a-remember').checked ? '1' : '0');
      if (email) localStorage.setItem('mn-email', email);
    } catch (err) {}
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
      toast('Mot de passe modifié');
      const { data } = await sb.auth.getSession();
      if (data.session) signedIn(data.session.user);
    }
    // Connexion réussie : onAuthStateChange prend le relais.
  });
}

async function signedIn(u) {
  user = u; ready = false; authMsg = ''; admin = null;
  render();
  await pull();
  ready = true; tab = 'home';
  render();
}
async function signOut() {
  if (dirty) await push();
  try { localStorage.removeItem(cacheKey()); } catch (e) {}
  await sb.auth.signOut();
}
async function deleteAccount() {
  const { error } = await sb.rpc('delete_my_account');
  if (error) { toast('Suppression impossible pour le moment. Réessaie plus tard.'); return; }
  clearTimeout(pushTimer); dirty = false;
  try { localStorage.removeItem(cacheKey()); } catch (e) {}
  await sb.auth.signOut({ scope: 'local' });
  authMsg = 'Ton compte et toutes tes données ont été supprimés.';
}

/* ---------- Événements ---------- */
function bindView() {
  $('#kidForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#k-name').value.trim();
    if (!name) return;
    S.enfants.push({ id: uid(), name }); save(); render(); toast(`${name} est ajouté·e`);
  });
  $('#importFile')?.addEventListener('change', importData);
}

let armed = null;
function disarm() {
  if (!armed) return;
  clearTimeout(armed._t);
  if (armed.isConnected) { armed.textContent = armed.dataset.label; armed.classList.remove('armed'); }
  armed = null;
}

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-tab]');
  if (nav) { tab = nav.dataset.tab; closeSheet(true); render(); window.scrollTo(0, 0); return; }
  const a = e.target.closest('[data-act]');
  if (!a) return;
  if (a.dataset.confirm && armed !== a) {
    disarm();
    armed = a; a.dataset.label = a.textContent; a.textContent = a.dataset.confirm; a.classList.add('armed');
    a._t = setTimeout(disarm, 4000);
    return;
  }
  disarm();
  const id = a.dataset.id, key = a.dataset.key;
  switch (a.dataset.act) {
    case 'month': cur = { y: Number(a.dataset.y), m: Number(a.dataset.m) }; render(); break;
    case 'newGarde': openSheet({ type: 'garde' }); break;
    case 'editGarde': openSheet({ type: 'garde', id }); break;
    case 'newNounou': openSheet({ type: 'nounou' }); break;
    case 'fill': openSheet({ type: 'fill' }); break;
    case 'doFill': doFill(); break;
    case 'report': shareReport(key); break;
    case 'editNounou': openSheet({ type: 'nounou', id }); break;
    case 'closeSheet': closeSheet(); break;
    case 'toggle': { const s = S.creneaux.find(x => x.id === id); s.paid = !s.paid; save(); render(); break; }
    case 'payall': monthSlots().filter(c => who(c).key === key).forEach(c => c.paid = true); save(); render(); toast('Noté comme réglé'); break;
    case 'unpayall': monthSlots().filter(c => who(c).key === key).forEach(c => c.paid = false); save(); render(); break;
    case 'delGarde': S.creneaux = S.creneaux.filter(x => x.id !== id); save(); closeSheet(); render(); toast('Garde supprimée'); break;
    case 'delNounou': {
      if (S.creneaux.some(c => c.nounouId === id)) { nounou(id).active = false; toast('Nounou archivée'); }
      else { S.nounous = S.nounous.filter(n => n.id !== id); toast('Nounou supprimée'); }
      save(); closeSheet(); render(); break;
    }
    case 'delKid': S.enfants = S.enfants.filter(k => k.id !== id); S.creneaux.forEach(c => c.enfants = (c.enfants || []).filter(k => k !== id)); save(); render(); break;
    case 'export': download(`mes-nounous-${todayISO()}.json`, JSON.stringify(S, null, 2), 'application/json'); break;
    case 'import': $('#importFile').click(); break;
    case 'csv': exportCSV(); break;
    case 'logout': signOut(); break;
    case 'deleteAccount': deleteAccount(); break;
    case 'refreshAdmin': loadAdmin(true); break;
    case 'reset': S = empty(); save(); tab = 'home'; render(); toast('Toutes les données ont été effacées'); break;
  }
});

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCSV() {
  const f2 = n => (n ?? 0).toFixed(2).replace('.', ',');
  const rows = [['Date', 'Avec', 'Type', 'Arrivée', 'Départ', 'Heures', 'Enfants', 'Tarif/h', 'Garde', 'Taxi', 'Total', 'Réglé', 'Note']];
  for (const c of monthSlots()) {
    const w = who(c), r = rate(c);
    rows.push([c.date, w.name, w.adhoc ? (c.adhoc.mode === 'flat' ? 'Ponctuelle (forfait)' : 'Ponctuelle') : 'Nounou',
      c.start, c.end, ((c.minutes || 0) / 60).toFixed(2).replace('.', ','),
      (c.enfants || []).map(id => enfant(id)?.name).filter(Boolean).join(' + '),
      r == null ? '' : f2(r), f2(garde(c)), f2(taxi(c)), f2(total(c)), c.paid ? 'oui' : 'non', c.note || '']);
  }
  const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  download(`nounous-${cur.y}-${pad(cur.m + 1)}.csv`, csv, 'text/csv');
}

function importData(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.nounous) || !Array.isArray(d.creneaux)) throw 0;
      if (!confirm('Remplacer ton carnet actuel par celui du fichier ?')) return;
      S = normalize(d);
      save(); render(); toast('Carnet importé');
    } catch (err) { toast('Ce fichier n’est pas une sauvegarde Mes Nounous'); }
  };
  r.readAsText(f);
}

/* ---------- Démarrage ---------- */
(function greet() {
  const h = new Date().getHours();
  $('#hello').textContent = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bel après-midi' : 'Bonsoir';
})();

if (!CLOUD) {
  render();
} else {
  ready = false;
  $('#view').innerHTML = `<div class="loading">Chargement…</div>`;
  document.body.classList.add('auth');
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { recovery = true; authMode = 'reset'; authMsg = ''; render(); return; }
    const u = session?.user || null;
    if (u && !recovery && (!user || u.id !== user.id)) {
      setTimeout(() => signedIn(u), 0);     // hors du callback, comme le recommande Supabase
    } else if (!u) {
      const keepMsg = authMsg;
      user = null; ready = false; recovery = false; S = empty(); tab = 'home'; admin = null;
      if (event === 'SIGNED_OUT') { authMode = 'login'; authMsg = keepMsg.startsWith('Ton compte') ? keepMsg : ''; }
      setSync('ok'); render();
    }
  });
}
