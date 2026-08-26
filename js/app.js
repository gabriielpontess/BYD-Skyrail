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
    button.classList.toggle('active', button.dataset.nav === state.view);
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

function sortedDocuments(docs) {
  const list = [...docs];
  if (state.sort === 'title') return list.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' }));
  if (state.sort === 'updated') return list.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  return list.sort((a, b) => a.code.localeCompare(b.code, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

function matchesSearch(doc) {
  if (state.discipline !== 'ALL' && doc.discipline !== state.discipline) return false;
  const q = state.query.trim().toLocaleLowerCase('pt-BR');
  if (!q) return true;
  return `${doc.code} ${doc.title}`.toLocaleLowerCase('pt-BR').includes(q);
}

function disciplineClass(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('elétr')) return 'gold';
  if (text.includes('civil')) return 'green';
  return '';
}

async function renderDocuments(page) {
  const filters = disciplines(state.docs);
  const visible = sortedDocuments(state.docs.filter(matchesSearch));
  const files = new Map(await documentFiles(visible));
  const rows = visible.map(doc => {
    const file = files.get(doc.id);
    const statusClass = file?.blob ? 'updated' : 'ready';
    const statusLabel = file?.blob ? 'Disponível offline' : 'Baixar';
    return { doc, file, statusClass, statusLabel };
  });

  page.innerHTML = `<div class="page-head"><div><h1>Documentos</h1><p>Pesquise por código ou descrição e filtre por sistema.</p></div><div class="page-actions"><button class="btn btn-outline" data-sync type="button">${icon('sync')} Sincronizar</button></div></div>
  <section class="search-panel">
    <form id="document-search" class="search-row">
      <div class="input-with-icon">${icon('search')}<input class="input-control" id="document-query" value="${esc(state.query)}" placeholder="Buscar por código ou descrição..." aria-label="Buscar documentos"></div>
      <button class="btn btn-primary" type="submit">${icon('search')} Pesquisar</button>
    </form>
    <p class="search-hint">Dica: pressione Enter para pesquisar</p>
    <div class="filter-row"><span class="filter-label">Filtrar por sistema:</span>
      ${['ALL', ...filters].map(filter => `<button class="filter-chip ${state.discipline === filter ? 'active' : ''}" data-filter="${esc(filter)}" type="button">${filter === 'ALL' ? 'Todos' : esc(filter)}</button>`).join('')}
      ${state.discipline !== 'ALL' || state.query ? '<button class="clear-filter" data-clear-filter type="button">Limpar filtros ×</button>' : ''}
    </div>
  </section>
  <div class="results-bar"><strong>${visible.length.toLocaleString('pt-BR')} documento(s) encontrado(s)</strong><div class="results-tools"><label for="sort-docs">Ordenar por:</label><select id="sort-docs"><option value="code" ${state.sort === 'code' ? 'selected' : ''}>Código (A-Z)</option><option value="title" ${state.sort === 'title' ? 'selected' : ''}>Descrição (A-Z)</option><option value="updated" ${state.sort === 'updated' ? 'selected' : ''}>Mais recentes</option></select></div></div>
  ${visible.length ? `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th style="width:15%">Código</th><th>Descrição</th><th style="width:15%">Sistema</th><th style="width:9%">Revisão</th><th style="width:15%">Status</th><th style="width:16%">Atualizado em</th><th style="width:8%;text-align:right">Ações</th></tr></thead><tbody>
    ${rows.map(({ doc, statusClass, statusLabel }) => `<tr><td><button class="doc-code" data-open-doc="${doc.id}" type="button">${icon('file')} ${esc(doc.code)}</button></td><td><span class="doc-description">${esc(doc.title)}</span></td><td><span class="system-tag ${disciplineClass(doc.discipline)}">${esc(doc.discipline)}</span></td><td>Rev. ${esc(doc.revision)}</td><td><span class="status-badge ${statusClass}">${esc(statusLabel)}</span></td><td>${esc(formatDate(doc.updated_at, { dateStyle: 'short', timeStyle: 'short' }))}</td><td><div class="table-actions"><button data-open-doc="${doc.id}" type="button" aria-label="Abrir documento">${icon('download')}</button></div></td></tr>`).join('')}
  </tbody></table></div>
  <div class="mobile-document-list">${rows.map(({ doc, statusClass, statusLabel }) => `<article class="mobile-doc-card"><div class="mobile-doc-top"><button class="doc-code" data-open-doc="${doc.id}" type="button">${icon('file')} ${esc(doc.code)}</button><span class="status-badge ${statusClass}">${esc(statusLabel)}</span></div><span class="doc-description">${esc(doc.title)}</span><div class="mobile-doc-meta"><span class="system-tag ${disciplineClass(doc.discipline)}">${esc(doc.discipline)}</span><span class="status-badge ready">Rev. ${esc(doc.revision)}</span></div><div class="mobile-doc-actions"><button class="btn btn-outline" data-open-doc="${doc.id}" type="button">Abrir ${icon('arrow')}</button></div></article>`).join('')}</div>
  <div class="pagination"><button class="active" type="button">1</button></div>` : `<div class="empty-state"><span class="quick-icon">${icon('search')}</span><h3>Nenhum documento encontrado</h3><p>Ajuste a pesquisa ou os filtros.</p></div>`}`;

  page.querySelector('#document-search').onsubmit = event => {
    event.preventDefault();
    state.query = page.querySelector('#document-query').value.trim();
    renderDocuments(page);
  };
  page.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
    state.discipline = button.dataset.filter;
    renderDocuments(page);
  });
  page.querySelector('[data-clear-filter]')?.addEventListener('click', () => {
    state.query = '';
    state.discipline = 'ALL';
    renderDocuments(page);
  });
  page.querySelector('#sort-docs').onchange = event => {
    state.sort = event.target.value;
    renderDocuments(page);
  };
  page.querySelectorAll('[data-open-doc]').forEach(button => button.onclick = () => openDocument(button.dataset.openDoc));
  page.querySelector('[data-sync]')?.addEventListener('click', doSync);
}

async function openDocument(id) {
  const doc = state.docs.find(item => item.id === id) || state.adminDocs.find(item => item.id === id);
  if (!doc) return toast('Documento não encontrado.', true);
  let file = await getFile(id);
  if (!file?.blob && navigator.onLine) {
    await doSync();
    file = await getFile(id);
  }
  if (!file?.blob) return toast('PDF ainda não está disponível offline.', true);
  rememberDocument(id);
  const url = URL.createObjectURL(file.blob);
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<section class="modal viewer" role="dialog" aria-modal="true" aria-label="Documento ${esc(doc.code)}">
    <header class="modal-head"><div class="modal-head-copy"><strong>${esc(doc.code)} · ${esc(doc.title)}</strong><small>${esc(doc.discipline)} · Rev. ${esc(doc.revision)} · Disponível offline</small></div><button class="btn btn-outline" data-close type="button">${icon('close')} Fechar</button></header>
    <iframe class="viewer-frame" src="${url}" title="${esc(doc.code)} - ${esc(doc.title)}"></iframe>
  </section>`;
  const close = () => { URL.revokeObjectURL(url); backdrop.remove(); };
  backdrop.querySelector('[data-close]').onclick = close;
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  document.body.append(backdrop);
}

async function renderProfile(page) {
  const meta = metadata();
  const photo = avatarValue();
  page.innerHTML = `<div class="page-head"><div><h1>Perfil</h1><p>Atualize suas informações pessoais e credenciais de acesso.</p></div></div>
  <section class="profile-layout">
    <aside class="profile-side">
      <article class="profile-card"><div id="profile-photo" class="profile-photo">${photo ? `<img src="${photo}" alt="Foto do perfil">` : esc(initials(state.member.display_name))}</div><div class="profile-photo-actions"><input id="avatar-input" type="file" accept="image/jpeg,image/png" hidden><button class="btn btn-outline" id="avatar-button" type="button">${icon('upload')} Alterar foto</button><small>JPG, PNG até 5MB · salvo neste dispositivo</small></div></article>
      <article class="profile-card access-card"><h3>Perfil de acesso</h3><div class="access-role"><span class="quick-icon">${icon(isAdmin() ? 'shield' : 'user')}</span><div><strong>${esc(accessLabel())}</strong><p>${isAdmin() ? 'Acesso administrativo, documentos, usuários e auditoria.' : 'Acesso a documentos e sincronização.'}</p></div></div></article>
    </aside>
    <div class="profile-main">
      <form id="profile-form" class="profile-section"><div class="profile-section-head"><h2>Informações pessoais</h2><button class="btn btn-outline" type="submit">Salvar alterações</button></div><div class="profile-grid">
        <label class="field"><span>Nome completo</span><input name="display_name" value="${esc(state.member.display_name)}" required></label>
        <label class="field"><span>Cargo</span><input name="cargo" value="${esc(meta.cargo || (isAdmin() ? 'Administrador' : ''))}" placeholder="Supervisor / Encarregado"></label>
        <label class="field"><span>E-mail</span><input value="${esc(state.member.user?.email || '')}" disabled></label>
        <label class="field"><span>Telefone</span><input name="telefone" value="${esc(meta.telefone || '')}" placeholder="(11) 99999-9999"></label>
      </div></form>
      <form id="password-form" class="profile-section"><div class="profile-section-head"><h2>Alterar senha</h2></div><div class="password-grid">
        <label class="field"><span>Senha atual</span><input name="current" type="password" autocomplete="current-password" required></label>
        <label class="field"><span>Nova senha</span><input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
        <label class="field"><span>Confirmar nova senha</span><input name="confirm" type="password" minlength="8" autocomplete="new-password" required></label>
        <button class="btn btn-primary" type="submit">${icon('key')} Alterar senha</button>
      </div></form>
    </div>
  </section>`;

  page.querySelector('#avatar-button').onclick = () => page.querySelector('#avatar-input').click();
  page.querySelector('#avatar-input').onchange = event => handleAvatar(event.target.files?.[0]);
  page.querySelector('#profile-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = new FormData(event.currentTarget);
      state.member = await updateOwnProfile({
        display_name: data.get('display_name'),
        cargo: data.get('cargo'),
        telefone: data.get('telefone')
      });
      cacheMember();
      document.querySelector('#header-user-name').textContent = state.member.display_name;
      document.querySelector('#header-user-role').textContent = accessLabel();
      toast('Perfil atualizado.');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  };
  page.querySelector('#password-form').onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = String(data.get('current') || '');
    const password = String(data.get('password') || '');
    const confirm = String(data.get('confirm') || '');
    if (password !== confirm) return toast('A confirmação da nova senha não confere.', true);
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await signIn(state.member.user?.email, current);
      await changeOwnPassword(password);
      event.currentTarget.reset();
      toast('Senha alterada com sucesso.');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  };
}

async function handleAvatar(file) {
  if (!file) return;
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    return toast('Use uma imagem JPG ou PNG de até 5MB.', true);
  }
  try {
    const dataUrl = await resizeAvatar(file);
    localStorage.setItem(avatarKey(), dataUrl);
    document.querySelector('#profile-photo').innerHTML = `<img src="${dataUrl}" alt="Foto do perfil">`;
    document.querySelector('.user-chip .avatar').innerHTML = `<img src="${dataUrl}" alt="Foto do perfil">`;
    toast('Foto atualizada neste dispositivo.');
  } catch {
    toast('Não foi possível processar a foto.', true);
  }
}

function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const size = Math.min(image.width, image.height);
        const sx = (image.width - size) / 2;
        const sy = (image.height - size) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 240;
        const context = canvas.getContext('2d');
        context.drawImage(image, sx, sy, size, size, 0, 0, 240, 240);
        resolve(canvas.toDataURL(file, .82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function eventLabel(event) {
  return ({
    CREATED: 'Documento criado',
    METADATA_UPDATED: 'Metadados atualizados',
    REVISION_UPDATED: 'Nova revisão',
    ACTIVATED: 'Documento ativado',
    DEACTIVATED: 'Documento desativado'
  })[event] || event;
}

async function ensureAuditData() {
  if (!navigator.onLine) throw new Error('A área administrativa exige conexão.');
  const [docs, members, audit] = await Promise.all([
    listAdmin(),
    listMembers(),
    listRecentDocumentHistory(60)
  ]);
  state.adminDocs = docs;
  state.members = members;
  state.audit = audit;
}

async function renderAudit(page) {
  page.innerHTML = `<div class="page-head"><div><h1>Conferência / Auditoria</h1><p>Painel administrativo de conformidade e gestão documental.</p></div><div class="page-actions"><button class="btn btn-outline" data-refresh type="button">${icon('sync')} Atualizar</button></div></div><div class="empty-state"><span class="quick-icon">${icon('sync')}</span><h3>Carregando dados administrativos…</h3></div>`;
  try {
    await ensureAuditData();
  } catch (error) {
    page.innerHTML += `<div class="login-error">${esc(error.message)}</div>`;
    return;
  }
  renderAuditContent(page);
}

function renderAuditContent(page) {
  const inactiveDocs = state.adminDocs.filter(doc => !doc.active).length;
  const activeMembers = state.members.filter(member => member.active).length;
  const pendingMembers = state.members.filter(member => !member.active).length;
  const revisionEvents = state.audit.filter(item => item.event_type === 'REVISION_UPDATED').length;

  page.innerHTML = `<div class="page-head"><div><h1>Conferência / Auditoria</h1><p>Painel administrativo de conformidade e auditoria.</p></div><div class="page-actions"><button class="btn btn-outline" data-refresh type="button">${icon('sync')} Atualizar</button></div></div>
  <div class="admin-tabs"><button class="admin-tab ${state.adminTab === 'overview' ? 'active' : ''}" data-admin-tab="overview" type="button">Visão geral</button><button class="admin-tab ${state.adminTab === 'documents' ? 'active' : ''}" data-admin-tab="documents" type="button">Documentos</button><button class="admin-tab ${state.adminTab === 'users' ? 'active' : ''}" data-admin-tab="users" type="button">Usuários</button><button class="admin-tab ${state.adminTab === 'history' ? 'active' : ''}" data-admin-tab="history" type="button">Histórico</button></div>
  <div id="admin-content"></div>`;
  page.querySelectorAll('[data-admin-tab]').forEach(button => button.onclick = () => {
    state.adminTab = button.dataset.adminTab;
    renderAuditContent(page);
  });
  page.querySelector('[data-refresh]').onclick = async () => {
    try { await ensureAuditData(); renderAuditContent(page); toast('Dados atualizados.'); }
    catch (error) { toast(error.message, true); }
  };
  const content = page.querySelector('#admin-content');
  if (state.adminTab === 'documents') renderAdminDocuments(content);
  else if (state.adminTab === 'users') renderAdminUsers(content);
  else if (state.adminTab === 'history') renderHistory(content);
  else renderAuditOverview(content, { inactiveDocs, activeMembers, pendingMembers, revisionEvents });
}

function renderAuditOverview(content, metrics) {
  const recent = state.audit.slice(0, 6);
  content.innerHTML = `<section class="stats-grid">
    ${metricCard('Total de documentos', state.adminDocs.length, 'file')}
    ${metricCard('Revisões recentes', metrics.revisionEvents, 'history')}
    ${metricCard('Usuários ativos', metrics.activeMembers, 'users')}
    ${metricCard('Documentos inativos', metrics.inactiveDocs, 'alert', metrics.inactiveDocs ? 'warn' : '')}
    ${metricCard('Acessos pendentes', metrics.pendingMembers, 'clock', metrics.pendingMembers ? 'warn' : '')}
  </section>
  <section class="audit-grid">
    <article class="panel-card"><h3>Revisões recentes</h3><table class="audit-table"><thead><tr><th>Documento</th><th>Revisão</th><th>Evento</th><th>Data</th></tr></thead><tbody>${recent.filter(item => item.event_type === 'REVISION_UPDATED').slice(0, 5).map(item => `<tr><td>${esc(item.code)}</td><td>Rev. ${esc(item.revision)}</td><td>${esc(eventLabel(item.event_type))}</td><td>${esc(formatDate(item.recorded_at, { dateStyle: 'short', timeStyle: 'short' }))}</td></tr>`).join('') || '<tr><td colspan="4">Nenhuma revisão recente.</td></tr>'}</tbody></table></article>
    <article class="panel-card"><h3>Log de atividades</h3><div class="activity-list">${recent.map(item => `<div class="activity-row"><span class="activity-dot"></span><div><strong>${esc(item.code)}</strong> — ${esc(eventLabel(item.event_type))}<br><span class="subtle">${esc(formatDate(item.recorded_at, { dateStyle: 'short', timeStyle: 'short' }))}</span></div></div>`).join('') || '<span class="subtle">Sem atividades.</span>'}</div></article>
    <article class="panel-card"><h3>Gestão de usuários</h3><div class="metric-number">${state.members.length}</div><div class="metric-caption">${metrics.activeMembers} ativo(s)</div><button class="btn btn-ghost" data-go-users type="button" style="padding-left:0;margin-top:8px">Gerenciar usuários ${icon('arrow')}</button><h3 style="margin-top:18px">Conformidade</h3><div class="metric-number">${state.adminDocs.length ? Math.round(((state.adminDocs.length - metrics.inactiveDocs) / state.adminDocs.length) * 100) : 100}%</div><div class="metric-caption">documentos ativos</div></article>
  </section>`;
  content.querySelector('[data-go-users]').onclick = () => { state.adminTab = 'users'; renderAuditContent(document.querySelector('#page')); };
}

function metricCard(label, value, ico, extra = '') {
  return `<article class="metric-card ${extra}"><span class="label">${esc(label)}</span><span class="value">${Number(value).toLocaleString('pt-BR')}</span><span class="delta">Atualizado agora</span><span class="metric-icon">${icon(ico)}</span></article>`;
}

function renderAdminDocuments(content) {
  content.innerHTML = `<div class="page-actions" style="justify-content:flex-end;margin-bottom:12px"><button class="btn btn-primary" data-new-doc type="button">${icon('file')} Cadastrar documento</button></div><div class="doc-table-wrap"><table class="doc-table"><thead><tr><th style="width:17%">Código</th><th>Descrição</th><th style="width:16%">Sistema</th><th style="width:9%">Revisão</th><th style="width:12%">Status</th><th style="width:16%">Atualizado</th><th style="width:10%;text-align:right">Ações</th></tr></thead><tbody>${state.adminDocs.map(doc => `<tr><td><button class="doc-code" data-history-doc="${doc.id}" type="button">${icon('file')} ${esc(doc.code)}</button></td><td><span class="doc-description">${esc(doc.title)}</span></td><td><span class="system-tag ${disciplineClass(doc.discipline)}">${esc(doc.discipline)}</span></td><td>Rev. ${esc(doc.revision)}</td><td><span class="status-badge ${doc.active ? 'updated' : 'inactive'}">${doc.active ? 'Ativo' : 'Inativo'}</span></td><td>${esc(formatDate(doc.updated_at, { dateStyle: 'short', timeStyle: 'short' }))}</td><td><div class="table-actions"><button data-edit-doc="${doc.id}" type="button" aria-label="Editar">${icon('edit')}</button><button data-history-doc="${doc.id}" type="button" aria-label="Histórico">${icon('history')}</button></div></td></tr>`).join('')}</tbody></table></div>`;
  content.querySelector('[data-new-doc]').onclick = () => openDocumentEditor(null);
  content.querySelectorAll('[data-edit-doc]').forEach(button => button.onclick = () => openDocumentEditor(state.adminDocs.find(doc => doc.id === button.dataset.editDoc)));
  content.querySelectorAll('[data-history-doc]').forEach(button => button.onclick = () => openDocumentHistory(button.dataset.historyDoc));
}

function openDocumentEditor(doc) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true"><header class="modal-head"><div class="modal-head-copy"><strong>${doc ? 'Editar documento' : 'Cadastrar documento'}</strong><small>${doc ? `${esc(doc.code)} · Rev. ${esc(doc.revision)}` : 'Novo documento técnico'}</small></div><button class="btn btn-outline" data-close type="button">${icon('close')} Fechar</button></header><div class="modal-body"><form id="document-admin-form" class="admin-form"><label class="field"><span>Código</span><input name="code" value="${esc(doc?.code || '')}" required></label><label class="field"><span>Revisão</span><input name="revision" value="${esc(doc?.revision || '')}" required></label><label class="field wide"><span>Descrição</span><input name="title" value="${esc(doc?.title || '')}" required></label><label class="field"><span>Sistema</span><input name="discipline" value="${esc(doc?.discipline || '')}" required></label><label class="field"><span>PDF</span><input name="file" type="file" accept="application/pdf,.pdf" ${doc ? '' : 'required'}></label><label class="field"><span>Status</span><select name="active"><option value="true" ${doc?.active === false ? '' : 'selected'}>Ativo</option><option value="false" ${doc?.active === false ? 'selected' : ''}>Inativo</option></select></label><div class="wide" style="display:flex;justify-content:flex-end"><button class="btn btn-primary" type="submit">${icon('check')} ${doc ? 'Salvar alterações' : 'Cadastrar documento'}</button></div></form></div></section>`;
  const close = () => backdrop.remove();
  backdrop.querySelector('[data-close]').onclick = close;
  backdrop.querySelector('#document-admin-form').onsubmit = async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = new FormData(event.currentTarget);
      await saveDocument(doc, {
        code: data.get('code'),
        revision: data.get('revision'),
        title: data.get('title'),
        discipline: data.get('discipline'),
        active: data.get('active') === 'true',
        file: event.currentTarget.elements.file.files[0] || null
      });
      await ensureAuditData();
      await doSync(false);
      close();
      renderAuditContent(document.querySelector('#page'));
      toast('Documento salvo.');
    } catch (error) {
      toast(error.message, true);
    } finally {
      button.disabled = false;
    }
  };
  document.body.append(backdrop);
}

async function openDocumentHistory(documentId) {
  try {
    const history = await listDocumentHistory(documentId);
    const doc = state.adminDocs.find(item => item.id === documentId);
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `<section class="modal" role="dialog" aria-modal="true"><header class="modal-head"><div class="modal-head-copy"><strong>Histórico · ${esc(doc?.code || '')}</strong><small>${esc(doc?.title || '')}</small></div><button class="btn btn-outline" data-close type="button">${icon('close')} Fechar</button></header><div class="modal-body"><div class="modal-list">${history.map(item => `<div class="modal-row"><div><strong>${esc(eventLabel(item.event_type))} · Rev. ${esc(item.revision)}</strong><div class="subtle" style="font-size:12px;margin-top:4px">${esc(formatDate(item.recorded_at, { dateStyle: 'medium', timeStyle: 'short' }))}</div></div><span class="status-badge ${item.active ? 'updated' : 'inactive'}">${item.active ? 'Ativo' : 'Inativo'}</span></div>`).join('') || '<div class="empty-state">Sem histórico.</div>'}</div></div></section>`;
    backdrop.querySelector('[data-close]').onclick = () => backdrop.remove();
    document.body.append(backdrop);
  } catch (error) {
    toast(error.message, true);
  }
}

function renderAdminUsers(content) {
  content.innerHTML = `<div class="panel-card"><h3>Gestão de usuários</h3><div class="user-list">${state.members.map(member => `<div class="user-row"><div><strong>${esc(member.display_name)}</strong><small>${esc(member.role)} · ${member.active ? 'Ativo' : 'Inativo'}</small></div><button class="btn btn-outline" data-edit-user="${member.user_id}" type="button">${icon('edit')} Editar</button></div>`).join('')}</div></div>`;
  content.querySelectorAll('[data-edit-user]').forEach(button => button.onclick = () => openUserEditor(state.members.find(member => member.user_id === button.dataset.editUser)));
}

function openUserEditor(member) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<section class="modal" style="width:min(620px,100%)" role="dialog" aria-modal="true"><header class="modal-head"><div class="modal-head-copy"><strong>Editar usuário</strong><small>Perfis e acesso ao BYD Skyrail</small></div><button class="btn btn-outline" data-close type="button">${icon('close')} Fechar</button></header><div class="modal-body"><form id="user-admin-form" class="admin-form"><label class="field wide"><span>Nome</span><input name="display_name" value="${esc(member.display_name)}" required></label><label class="field"><span>Perfil</span><select name="role"><option value="USER" ${member.role === 'USER' ? 'selected' : ''}>USER</option><option value="ADMIN" ${member.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option></select></label><label class="field"><span>Acesso</span><select name="active"><option value="true" ${member.active ? 'selected' : ''}>Ativo</option><option value="false" ${!member.active ? 'selected' : ''}>Inativo</option></select></label><div class="wide" style="display:flex;justify-content:flex-end"><button class="btn btn-primary" type="submit">${icon('check')} Salvar</button></div></form></div></section>`;
  const close = () => backdrop.remove();
  backdrop.querySelector('[data-close]').onclick = close;
  backdrop.querySelector('#user-admin-form').onsubmit = async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await updateMember(member.user_id, {
        display_name: data.get('display_name'),
        role: data.get('role'),
        active: data.get('active') === 'true'
      });
      await ensureAuditData();
      close();
      renderAuditContent(document.querySelector('#page'));
      toast('Usuário atualizado.');
    } catch (error) {
      toast(error.message, true);
    }
  };
  document.body.append(backdrop);
}

function renderHistory(content) {
  content.innerHTML = `<article class="panel-card"><h3>Histórico de atividades</h3><table class="audit-table"><thead><tr><th>Documento</th><th>Evento</th><th>Revisão</th><th>Sistema</th><th>Data</th></tr></thead><tbody>${state.audit.map(item => `<tr><td>${esc(item.code)}</td><td>${esc(eventLabel(item.event_type))}</td><td>Rev. ${esc(item.revision)}</td><td>${esc(item.discipline)}</td><td>${esc(formatDate(item.recorded_at, { dateStyle: 'short', timeStyle: 'short' }))}</td></tr>`).join('') || '<tr><td colspan="5">Sem histórico.</td></tr>'}</tbody></table></article>`;
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