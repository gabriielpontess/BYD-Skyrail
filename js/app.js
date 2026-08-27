import {
  currentMember,
  signIn,
  signOut,
  listAdmin,
  saveDocument,
  listMembers,
  updateMember,
  listDocumentHistory,
  listRecentDocumentHistory,
  updateOwnProfile,
  changeOwnPassword
} from './api.js';
import { listLocal, getFile } from './db.js';
import { syncAll, lastSync } from './sync.js';
import { sortDocuments, disciplines } from './model.js';

const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const RECENT_KEY = 'byd-skyrail:recent-documents';
let toastTimer;

const state = {
  member: null,
  docs: [],
  view: 'home',
  query: '',
  discipline: 'ALL',
  sort: 'code',
  adminTab: 'overview',
  adminDocs: [],
  members: [],
  audit: [],
  userMenu: false
};

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const safeJson = (value, fallback) => {
  try { return JSON.parse(value); } catch { return fallback; }
};

function toast(message, error = false) {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.toggle('error', error);
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3600);
}

function icon(name, label = '') {
  const paths = {
    rail: '<path d="M5 20 10 4m9 16L14 4M7 15h10M8.5 10h7M6 20h12"/>',
    home: '<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    file: '<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>',
    shield: '<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-5"/>',
    sync: '<path d="M20 7h-5V2M4 17h5v5"/><path d="M6.1 8A7 7 0 0 1 18 5l2 2M17.9 16A7 7 0 0 1 6 19l-2-2"/>',
    star: '<path d="m12 2 3.1 6.4 7 .9-5.1 4.9 1.3 6.9L12 17.8 5.7 21 7 14.2 2 9.3l7-.9z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
    folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 21h16"/>',
    upload: '<path d="M12 21V9m-5 5 5-5 5 5M4 3h16"/>',
    edit: '<path d="m4 20 4-.8L19 8.2 15.8 5 4.8 16zM14 6l3 3"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-3 3 3 3m-6 0 3 3"/>',
    logout: '<path d="M10 17l5-5-5-5M15 12H3M21 3v18h-7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    alert: '<path d="M12 3 2 21h20zM12 9v5M12 18h.01"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${label ? ` aria-label="${esc(label)}" role="img"` : ' aria-hidden="true"'}>${paths[name] || paths.file}</svg>`;
}

function brandHtml() {
  return `<div class="brand-lockup">
    <span class="brand-emblem">${icon('rail')}</span>
    <span class="brand-copy"><strong>BYD Skyrail</strong><small>Documentação de campo</small></span>
  </div>`;
}

function isAdmin() {
  return state.member?.role === 'ADMIN';
}

function metadata() {
  return state.member?.user?.user_metadata || {};
}

function accessLabel() {
  if (isAdmin()) return 'Administrador';
  const cargo = String(metadata().cargo || '').trim();
  return cargo || 'Supervisor / Encarregado';
}

function initials(name = '') {
  return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'BS';
}

function avatarKey() {
  return `byd-skyrail:avatar:${state.member?.user_id || 'anon'}`;
}

function avatarValue() {
  return localStorage.getItem(avatarKey()) || '';
}

function avatarHtml(sizeClass = '') {
  const photo = avatarValue();
  return `<span class="avatar ${sizeClass}">${photo ? `<img src="${photo}" alt="Foto do perfil">` : esc(initials(state.member?.display_name))}</span>`;
}

function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', options);
}

function formatSync() {
  const value = lastSync();
  return value ? formatDate(value, { dateStyle: 'short', timeStyle: 'short' }) : 'Ainda não realizada';
}

function routeFromHash() {
  const route = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  if (!['home', 'documents', 'profile', 'audit'].includes(route)) return 'home';
  if (route === 'audit' && !isAdmin()) return 'home';
  return route;
}

function navItems() {
  const items = [
    ['home', 'home', 'Home'],
    ['documents', 'file', 'Documentos'],
    ['profile', 'user', 'Perfil']
  ];
  if (isAdmin()) items.push(['audit', 'shield', 'Conferência / Auditoria']);
  return items;
}

function login(message = '') {
  app.innerHTML = `<main class="login-shell">
    <section class="login-visual" aria-hidden="true">
      <div class="login-visual-copy">
        <div class="login-gold-line"></div>
        <h2>Documentação certa.<br>Em qualquer lugar.</h2>
        <p>Acesse, sincronize e consulte os documentos oficiais do BYD Skyrail em campo, inclusive sem conexão.</p>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <div style="color:var(--blue-800)">${brandHtml()}</div>
        <h1>Acessar o sistema</h1>
        <p>Entre com sua conta autorizada.</p>
        ${message ? `<div class="login-error" role="alert">${esc(message)}</div>` : ''}
        <form id="login-form" class="login-form">
          <label class="field"><span>E-mail</span><input type="email" name="email" autocomplete="username" required></label>
          <label class="field"><span>Senha</span><input type="password" name="password" autocomplete="current-password" required></label>
          <button class="btn btn-primary" type="submit">Entrar ${icon('arrow')}</button>
        </form>
      </div>
    </section>
  </main>`;
  document.querySelector('#login-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      state.member = await signIn(form.get('email'), form.get('password'));
      if (!state.member) throw new Error('Usuário sem acesso ativo.');
      cacheMember();
      await bootAuthenticated();
    } catch (error) {
      login(error.message);
    }
  };
}

function cacheMember() {
  localStorage.setItem('byd-skyrail-member-cache', JSON.stringify({
    display_name: state.member.display_name,
    role: state.member.role,
    user_id: state.member.user_id,
    user: state.member.user ? {
      email: state.member.user.email,
      user_metadata: state.member.user.user_metadata || {}
    } : undefined
  }));
}

function shell() {
  const items = navItems();
  const mobile = isAdmin()
    ? [['home', 'home', 'Home'], ['documents', 'file', 'Documentos'], ['audit', 'shield', 'Auditoria'], ['profile', 'user', 'Perfil']]
    : items;
  app.innerHTML = `<div class="app-shell">
    <header class="topbar">
      <div class="topbar-inner">
        ${brandHtml()}
        <nav class="desktop-nav" aria-label="Navegação principal">
          ${items.map(([view, ico, label]) => `<button class="nav-btn" data-nav="${view}" type="button">${icon(ico)}<span>${esc(label)}</span></button>`).join('')}
        </nav>
        <div class="header-tools">
          <span id="net-status" class="net-pill"></span>
          <button class="icon-btn" type="button" aria-label="Notificações">${icon('bell')}<span class="notification-dot">3</span></button>
          <button id="user-menu-button" class="user-chip" type="button" aria-haspopup="menu" aria-expanded="false">
            ${avatarHtml()}
            <span class="user-chip-copy"><strong id="header-user-name">${esc(state.member.display_name)}</strong><small id="header-user-role">${esc(accessLabel())}</small></span>
          </button>
          <div id="user-menu" class="user-menu hidden" role="menu">
            <button type="button" data-nav="profile" role="menuitem">Meu perfil</button>
            <button type="button" data-logout role="menuitem">Sair</button>
          </div>
        </div>
      </div>
    </header>
    <main id="page" class="page-shell"></main>
    <nav class="mobile-bottom-nav ${mobile.length === 3 ? 'three' : ''}" aria-label="Navegação móvel">
      ${mobile.map(([view, ico, label]) => `<button class="mobile-nav-btn" data-nav="${view}" type="button">${icon(ico)}<span>${esc(label)}</span></button>`).join('')}
    </nav>
  </div>`;
  bindShell();
  updateConnectivity();
}

function bindShell() {
  document.querySelectorAll('[data-nav]').forEach(button => {
    button.addEventListener('click', () => navigate(button.dataset.nav));
  });
  document.querySelector('#user-menu-button')?.addEventListener('click', () => {
    state.userMenu = !state.userMenu;
    document.querySelector('#user-menu')?.classList.toggle('hidden', !state.userMenu);
    document.querySelector('#user-menu-button')?.setAttribute('aria-expanded', String(state.userMenu));
  });
  document.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await signOut();
    localStorage.removeItem('byd-skyrail-member-cache');
    state.member = null;
    login();
  });
}

function updateConnectivity() {
  const badge = document.querySelector('#net-status');
  if (!badge) return;
  badge.textContent = navigator.onLine ? 'Online' : 'Offline';
  badge.classList.toggle('offline', !navigator.onLine);
}

function updateNav() {
  document.querySelectorAll('[data-nav]').forEach(button => {
    const active = button.dataset.nav === state.view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

async function loadLocal() {
  state.docs = sortDocuments(await listLocal());
}

async function documentFiles(docs = state.docs) {
  return Promise.all(docs.map(async doc => [doc.id, await getFile(doc.id)]));
}

async function offlineCount() {
  const rows = await documentFiles();
  return rows.filter(([, file]) => file?.blob).length;
}

function recentIds() {
  return safeJson(localStorage.getItem(RECENT_KEY) || '[]', []);
}

function rememberDocument(id) {
  const next = [id, ...recentIds().filter(value => value !== id)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function recentDocuments() {
  const map = new Map(state.docs.map(doc => [doc.id, doc]));
  const recent = recentIds().map(id => map.get(id)).filter(Boolean);
  return recent.length ? recent : state.docs.slice(0, 4);
}

async function navigate(view) {
  const target = view === 'audit' && !isAdmin() ? 'home' : view;
  const hash = `#/${target}`;
  if (location.hash !== hash) {
    location.hash = hash;
    return;
  }
  state.view = target;
  updateNav();
  await renderCurrentView();
}

async function renderCurrentView() {
  const page = document.querySelector('#page');
  if (!page) return;
  if (state.view === 'home') return renderHome(page);
  if (state.view === 'documents') {
    page.innerHTML = '<div class="empty-state" data-local-documents-host><h3>Carregando documentos…</h3><p>Preparando o catálogo local deste dispositivo.</p></div>';
    document.dispatchEvent(new CustomEvent('byd:render-local-documents'));
    return;
  }
  if (state.view === 'profile') return renderProfile(page);
  if (state.view === 'audit' && isAdmin()) return renderAudit(page);
  return renderHome(page);
}

async function renderHome(page) {
  const offline = await offlineCount();
  const recent = recentDocuments();
  const quick = isAdmin()
    ? [
        ['documents', 'file', 'Documentos', 'Consulte e gerencie documentos técnicos.', 'Acessar'],
        ['audit', 'shield', 'Conferência / Auditoria', 'Confira revisões e conformidade documental.', 'Acessar'],
        ['audit-users', 'users', 'Usuários', 'Gerencie perfis e permissões de acesso.', 'Gerenciar'],
        ['sync', 'sync', 'Sincronização', 'Sincronize conteúdo para uso offline.', 'Sincronizar agora'],
        ['profile', 'user', 'Perfil', 'Atualize seus dados e sua senha.', 'Acessar']
      ]
    : [
        ['documents', 'file', 'Documentos', 'Consulte documentos técnicos.', 'Acessar'],
        ['sync', 'sync', 'Sincronização', 'Sincronize conteúdo offline.', 'Sincronizar agora'],
        ['documents', 'star', 'Meus documentos', 'Acesse rapidamente documentos utilizados.', 'Ver documentos'],
        ['profile', 'user', 'Perfil', 'Atualize seus dados e sua senha.', 'Acessar']
      ];

  page.innerHTML = `<section class="hero">
    <div class="hero-copy">
      <span class="hero-eyebrow">${icon('rail')} BYD Skyrail</span>
      <h1>Bem-vindo, ${esc(state.member.display_name)}!</h1>
      <p>${isAdmin() ? 'Acesse os sistemas, gerencie a documentação e acompanhe os principais indicadores.' : 'Acesse rapidamente documentos e acompanhe os indicadores de sincronização.'}</p>
    </div>
    <div class="hero-rail" aria-hidden="true"></div>
  </section>
  <section class="quick-grid ${isAdmin() ? 'admin' : ''}" aria-label="Acessos rápidos">
    ${quick.map(([action, ico, title, description, link]) => `<button type="button" class="quick-card" data-home-action="${action}">
      <span class="quick-icon">${icon(ico)}</span>
      <h3>${esc(title)}</h3><p>${esc(description)}</p>
      <span class="quick-link">${esc(link)} ${icon('arrow')}</span>
    </button>`).join('')}
  </section>
  <section class="home-widgets">
    <article class="widget-card">
      <div class="widget-head"><strong>Última sincronização</strong></div>
      <div class="sync-summary"><span class="sync-clock">${icon('clock')}</span><div><h3>${esc(formatSync())}</h3><p>${lastSync() ? 'Sincronizado com sucesso' : 'Sincronização pendente'}</p></div></div>
      <button class="btn btn-outline" style="margin-top:15px" data-sync type="button">${icon('sync')} Sincronizar agora</button>
    </article>
    <article class="widget-card">
      <div class="widget-head"><strong>Documentos disponíveis offline</strong><span class="quick-icon" style="margin:0">${icon('folder')}</span></div>
      <div class="metric-number">${offline.toLocaleString('pt-BR')}</div><div class="metric-caption">de ${state.docs.length.toLocaleString('pt-BR')} documento(s)</div>
      <button class="btn btn-ghost" data-nav="documents" type="button" style="margin-top:9px;padding-left:0">Ver detalhes ${icon('arrow')}</button>
    </article>
    <article class="widget-card">
      <div class="widget-head"><strong>Documentos recentes</strong><button class="btn btn-ghost" data-nav="documents" type="button" style="min-height:34px;padding:0">Ver todos ${icon('arrow')}</button></div>
      <div class="recent-list">${recent.length ? recent.map(doc => `<button type="button" class="recent-item" data-open-doc="${doc.id}" style="border:0;background:transparent;padding:0;text-align:left;cursor:pointer;width:100%">${icon('file')}<span><strong>${esc(doc.code)}</strong> — ${esc(doc.title)}</span><time>Rev. ${esc(doc.revision)}</time></button>`).join('') : '<span class="subtle">Nenhum documento recente.</span>'}</div>
    </article>
  </section>`;

  page.querySelectorAll('[data-nav]').forEach(button => button.onclick = () => navigate(button.dataset.nav));
  page.querySelectorAll('[data-sync]').forEach(button => button.onclick = doSync);
  page.querySelectorAll('[data-open-doc]').forEach(button => button.onclick = () => openDocument(button.dataset.openDoc));
  page.querySelectorAll('[data-home-action]').forEach(button => button.onclick = async () => {
    const action = button.dataset.homeAction;
    if (action === 'sync') return doSync();
    if (action === 'audit-users') {
      state.adminTab = 'users';
      return navigate('audit');
    }
    return navigate(action);
  });
}

function filteredDocuments() {
  const query = state.query.trim().toLowerCase();
  return state.docs.filter(doc => {
    const queryMatch = !query || [doc.code, doc.title, doc.description].some(value => String(value || '').toLowerCase().includes(query));
    const disciplineMatch = state.discipline === 'ALL' || doc.discipline === state.discipline;
    return queryMatch && disciplineMatch;
  });
}

function renderDocuments(page) {
  const docs = filteredDocuments();
  const disciplineOptions = disciplines(state.docs);
  page.innerHTML = `<div class="page-head"><div><h1>Documentos</h1><p>Consulte documentos técnicos por código, descrição e disciplina.</p></div></div>
    <section class="search-panel">
      <form id="document-search" class="search-row">
        <div class="input-with-icon">${icon('search')}<input class="input-control" name="query" value="${esc(state.query)}" placeholder="Buscar por código ou descrição..." aria-label="Buscar documentos"></div>
        <button class="btn btn-primary" type="submit">Pesquisar</button>
      </form>
      <div class="filter-row"><span class="filter-label">Filtrar por disciplina:</span>${['ALL', ...disciplineOptions].map(value => `<button type="button" class="filter-chip ${state.discipline === value ? 'active' : ''}" data-discipline="${esc(value)}">${value === 'ALL' ? 'Todas' : esc(value)}</button>`).join('')}<button type="button" class="btn btn-ghost clear-filter" data-clear>Limpar filtros</button></div>
    </section>
    <div class="results-bar"><strong>${docs.length.toLocaleString('pt-BR')} documento(s) encontrado(s)</strong><span class="subtle">Ordenar por <select id="sort-select"><option value="code" ${state.sort === 'code' ? 'selected' : ''}>Código</option><option value="revision" ${state.sort === 'revision' ? 'selected' : ''}>Revisão</option></select></span></div>
    ${documentTable(docs)}`;
  page.querySelector('#document-search').onsubmit = event => {
    event.preventDefault();
    state.query = new FormData(event.currentTarget).get('query')?.toString() || '';
    renderDocuments(page);
  };
  page.querySelectorAll('[data-discipline]').forEach(button => button.onclick = () => {
    state.discipline = button.dataset.discipline;
    renderDocuments(page);
  });
  page.querySelector('[data-clear]').onclick = () => {
    state.query = '';
    state.discipline = 'ALL';
    renderDocuments(page);
  };
  page.querySelector('#sort-select').onchange = event => {
    state.sort = event.target.value;
    renderDocuments(page);
  };
  bindDocumentOpen(page);
}

function documentTable(docs) {
  const sorted = sortDocuments(docs, state.sort);
  return `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Código</th><th>Descrição</th><th>Disciplina</th><th>Tipo</th><th>Revisão</th><th>Status</th><th></th></tr></thead><tbody>${sorted.map(doc => `<tr><td><span class="doc-code">${esc(doc.code)}</span></td><td><span class="doc-description">${esc(doc.title)}</span></td><td>${esc(doc.discipline)}</td><td>${esc(doc.type)}</td><td>Rev. ${esc(doc.revision)}</td><td>${statusBadge(doc.status)}</td><td><span class="table-actions"><button type="button" data-open="${doc.id}" aria-label="Abrir documento">${icon('download')}</button></span></td></tr>`).join('')}</tbody></table></div>`;
}

function statusBadge(status) {
  const map = { current: ['updated', 'Atualizado'], outdated: ['outdated', 'Desatualizado'], pending: ['pending', 'Pendente'] };
  const [cls, label] = map[status] || ['pending', status || '—'];
  return `<span class="status-badge ${cls}">${esc(label)}</span>`;
}

async function openDocument(id) {
  const doc = state.docs.find(item => item.id === id);
  const file = await getFile(id);
  if (!doc || !file?.blob) return toast('Documento não está disponível offline.', true);
  rememberDocument(id);
  const url = URL.createObjectURL(file.blob);
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<section class="modal document-modal"><header class="modal-head"><div><strong>${esc(doc.code)}</strong><small>${esc(doc.title)} · Rev. ${esc(doc.revision)}</small></div><button class="btn btn-outline" data-close type="button">Fechar</button></header><iframe src="${url}#toolbar=1" title="${esc(doc.code)}"></iframe></section>`;
  document.body.append(modal);
  const close = () => { URL.revokeObjectURL(url); modal.remove(); };
  modal.querySelector('[data-close]').onclick = close;
  modal.onclick = event => { if (event.target === modal) close(); };
}

async function doSync(rerender = true) {
  if (!navigator.onLine) return toast('Sem internet para sincronizar.', true);
  const buttons = [...document.querySelectorAll('[data-sync]')];
  buttons.forEach(button => button.disabled = true);
  try {
    const result = await syncAll((index, total, code) => toast(`Sincronizando ${index}/${total} · ${code}`));
    await loadLocal();
    updateConnectivity();
    toast(`Sincronização concluída: ${result.total} documento(s), ${result.downloaded} atualizado(s).`);
    if (rerender) await renderCurrentView();
    return result;
  } catch (error) {
    toast(error.message, true);
  } finally {
    buttons.forEach(button => button.disabled = false);
  }
}

async function bootAuthenticated() {
  await loadLocal();
  shell();
  state.view = routeFromHash();
  updateNav();
  if (navigator.onLine) await doSync(false);
  await renderCurrentView();
}

async function boot() {
  try {
    if (!state.member) {
      if (navigator.onLine) {
        state.member = await currentMember();
      } else {
        state.member = safeJson(localStorage.getItem('byd-skyrail-member-cache') || 'null', null);
      }
    }
    if (!state.member) return login();
    cacheMember();
    await bootAuthenticated();
  } catch (error) {
    login(error.message);
  }
}

addEventListener('hashchange', async () => {
  if (!state.member || !document.querySelector('#page')) return;
  state.view = routeFromHash();
  updateNav();
  await renderCurrentView();
});
addEventListener('online', async () => {
  updateConnectivity();
  toast('Conexão restabelecida.');
});
addEventListener('offline', () => {
  updateConnectivity();
  toast('Modo offline ativo.');
});

boot();