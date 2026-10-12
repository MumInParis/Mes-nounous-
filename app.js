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
const sb = CLOUD ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;

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
    <div class="hero-label">Reste à régler en ${MONTHS[cur.m]}</div>
    <div class="hero-amount">${eur(due)}</div>
    <div class="hero-line">${slots.length
      ? `${hm(mins)} de garde · ${eur(tot)} au total${tx ? `, dont ${eur(tx)} de taxi` : ''}`
      : 'Aucune garde notée ce mois-ci.'}</div>
    ${tot ? `<div class="meter" role="img" aria-label="${pct} % réglé"><span style="width:${pct}%"></span></div>
    <div class="meter-legend"><span>${eur(paid)} réglé</span><span>${pct} %</span></div>` : ''}
  </section>`;

  if (!slots.length) {
    return h + `<div class="empty"><p>Note ta première garde de ${MONTHS[cur.m]}.</p><button class="btn" data-act="newGarde">Ajouter une garde</button></div>`;
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
      : `<span class="muted-txt">${x.paid > 0.004 ? `${eur(x.paid)} déjà réglé sur ${eur(x.total)}` : `Sur ${eur(x.total)} ce mois-ci`}</span>
         <button class="btn small" data-act="payall" data-key="${esc(x.who.key)}">C’est réglé</button>`}
    </div>
  </article>`;
}

/* --- Journal --- */
function viewJournal() {
  if (!S.nounous.length && !S.creneaux.length) return welcome();
  let h = monthStrip();
  const slots = monthSlots().reverse();
  h += `<div class="journal-head"><h2>Journal de ${MONTHS[cur.m]}</h2><span class="muted-txt">${slots.length} garde${slots.length > 1 ? 's' : ''}</span></div>`;
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
      <span class="person-txt"><b>${esc(n.name)}</b><small>${eur(n.rate1)} / h${n.rate2 ? ` · ${eur(n.rate2)} / h à plusieurs` : ''}</small></span>
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
  }
  renderSheet();
  setTimeout(() => $('.sheet-panel')?.focus(), 30);
}
function closeSheet(silent) {
  if (!sheet && silent) return;
  sheet = null; draft = null;
  renderSheet();
}
function renderSheet() {
  const root = $('#sheet');
  if (!sheet) { root.hidden = true; root.innerHTML = ''; document.body.classList.remove('sheet-open'); return; }
  root.hidden = false;
  document.body.classList.add('sheet-open');
  root.innerHTML = `<div class="sheet-backdrop" data-act="closeSheet"></div>
    <div class="sheet-panel" role="dialog" aria-modal="true" tabindex="-1">${sheet.type === 'garde' ? sheetGarde() : sheetNounou()}</div>`;
  if (sheet.type === 'garde') bindGarde(); else bindNounou();
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

/* --- Nounou --- */
function sheetNounou() {
  const n = sheet.id ? nounou(sheet.id) : null;
  const used = n && S.creneaux.some(c => c.nounouId === n.id);
  return `<form id="nounouForm" autocomplete="off" novalidate>
    <div class="sheet-head"><h2>${n ? esc(n.name) : 'Nouvelle nounou'}</h2>
      <button type="button" class="x" data-act="closeSheet" aria-label="Fermer">×</button></div>
    <div class="q"><div class="field"><label for="n-name">Prénom</label>
      <input type="text" id="n-name" value="${esc(n?.name || '')}" placeholder="Ex : Inès" required></div></div>
    <div class="grid2">
      <div class="field"><label for="n-r1">Tarif horaire</label>
        <div class="money"><input type="text" inputmode="decimal" id="n-r1" value="${n ? comma(n.rate1) : ''}" placeholder="0,00"><span>€</span></div></div>
      <div class="field"><label for="n-r2">Avec plusieurs enfants</label>
        <div class="money"><input type="text" inputmode="decimal" id="n-r2" value="${n?.rate2 ? comma(n.rate2) : ''}" placeholder="Pareil"><span>€</span></div></div>
    </div>
    <div class="q"><span class="q-label">Déclarée via</span><div class="chips">
      ${DECLS.map(x => `<button type="button" class="chip ${sheet.decl === x ? 'on' : ''}" data-decl="${x}" aria-pressed="${sheet.decl === x}">${x}</button>`).join('')}
    </div></div>
    ${n ? `<label class="toggle"><input type="checkbox" id="n-active" ${n.active ? 'checked' : ''}><span class="toggle-ui"></span><span>Toujours en poste</span></label>` : ''}
    <button class="btn block big" type="submit">${n ? 'Enregistrer' : 'Ajouter'}</button>
    ${n ? `<button type="button" class="btn danger-ghost block" data-act="delNounou" data-id="${n.id}" data-confirm="${used ? 'Toucher encore pour archiver' : 'Toucher encore pour supprimer'}">${used ? 'Archiver (ses gardes restent dans le journal)' : 'Supprimer'}</button>` : ''}
  </form>`;
}

function bindNounou() {
  const f = $('#nounouForm');
  f.addEventListener('click', e => {
    const b = e.target.closest('[data-decl]');
    if (!b) return;
    sheet.decl = b.dataset.decl;
    f.querySelectorAll('[data-decl]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
  });
  f.addEventListener('submit', e => {
    e.preventDefault();
    const d = {
      name: $('#n-name').value.trim(),
      rate1: round2(num($('#n-r1').value)),
      rate2: round2(num($('#n-r2').value)) || null,
      decl: sheet.decl,
      active: $('#n-active') ? $('#n-active').checked : true,
    };
    if (!d.name) return toast('Indique un prénom');
    if (!d.rate1) return toast('Indique un tarif horaire');
    if (sheet.id) { Object.assign(nounou(sheet.id), d); toast('Modifications enregistrées'); }
    else { S.nounous.push({ id: uid(), ...d }); toast(`${d.name} est ajoutée`); }
    save(); closeSheet(); render();
  });
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
        <input type="email" id="a-email" name="email" autocomplete="email" inputmode="email" placeholder="toi@exemple.fr" required></div>` : ''}
      ${pwd ? `<div class="field"><label for="a-pwd">Mot de passe</label>
        <input type="password" id="a-pwd" name="password" minlength="6" required
          autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" placeholder="6 caractères minimum"></div>` : ''}
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
