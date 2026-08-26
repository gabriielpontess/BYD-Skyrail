import { documentRepository } from './documents/catalog-repository.js';

const CACHE_KEY = 'byd-skyrail:systems-cache';
let scheduled = false;
let enhancing = false;
let rerunRequested = false;
let homeBooting = false;
let homeBootPending = false;
let systems = [];
let docs = [];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [rawName = '', query = ''] = raw.split('?');
  return { name: rawName || 'home', params: new URLSearchParams(query) };
}

function cachedSystems() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
}

function systemsFromDocuments(items = []) {
  const map = new Map();
  for (const doc of items) {
    const id = String(doc.system_id || '').trim();
    const name = String(doc.system_name || '').trim();
    if (!id || !name || map.has(id)) continue;
    map.set(id, { id, name, active: true });
  }
  return [...map.values()].sort((a,b) => a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'}));
}

async function waitForView(selector, timeoutMs = 10000) {
  if ($(selector)) return true;
  return new Promise(resolve => {
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      observer.disconnect();
      resolve(value);
    };
    const observer = new MutationObserver(() => {
      if ($(selector)) finish(true);
    });
    observer.observe(document.querySelector('#app'), { childList: true, subtree: true });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

async function refreshData() {
  try { docs = await documentRepository.getAll(); } catch (error) {
    console.error('[BYD Skyrail] Falha ao ler documentos locais para Sistemas:', error);
    docs = [];
  }

  try {
    const localSystems = await documentRepository.getSystems({ includeInactive: true });
    if (localSystems.length) {
      systems = localSystems;
      localStorage.setItem(CACHE_KEY, JSON.stringify(localSystems));
      return { ok: true, source: 'catalog' };
    }
  } catch (error) {
    console.error('[BYD Skyrail] Falha ao ler sistemas do catálogo local:', error);
  }

  const derived = systemsFromDocuments(docs);
  if (derived.length) {
    systems = derived;
    localStorage.setItem(CACHE_KEY, JSON.stringify(derived));
    return { ok: true, source: 'documents' };
  }

  systems = cachedSystems();
  return { ok: true, source: systems.length ? 'cache' : 'empty' };
}

function selectedSystemId() {
  const value = route().params.get('system');
  return value && systems.some(system => system.id === value && system.active !== false) ? value : 'ALL';
}

function goToDocuments(systemId = 'ALL') {
  location.hash = systemId === 'ALL' ? '#/documents' : `#/documents?system=${encodeURIComponent(systemId)}`;
}

function ensureSystemsSection() {
  if (route().name !== 'home') return null;
  const hero = $('.hero');
  if (!hero) return null;
  let section = $('.systems-home-section');
  if (!section) {
    section = document.createElement('section');
    section.className = 'systems-home-section';
    const next = hero.nextElementSibling;
    if (next) hero.parentNode.insertBefore(section, next); else hero.after(section);
  }
  return section;
}

function renderHomeSystems({ status = 'ready' } = {}) {
  const section = ensureSystemsSection();
  if (!section) return false;

  if (status === 'loading') {
    section.innerHTML = `<div class="systems-section-head"><div><span class="systems-kicker">Documentação por sistema</span><h2>Sistemas</h2><p>Carregando sistemas…</p></div></div><div class="systems-empty"><span>Carregando sistemas disponíveis…</span></div>`;
    return true;
  }

  if (status === 'error') {
    section.innerHTML = `<div class="systems-section-head"><div><span class="systems-kicker">Documentação por sistema</span><h2>Sistemas</h2><p>Não foi possível carregar os sistemas.</p></div><button type="button" class="btn btn-outline" data-retry-systems>Tentar novamente</button></div><div class="systems-empty"><span>Recarregue o catálogo local e tente novamente.</span></div>`;
    $('[data-retry-systems]', section)?.addEventListener('click', ensureHomeSystems);
    return true;
  }

  const active = systems.filter(system => system.active !== false);
  section.innerHTML = `<div class="systems-section-head"><div><span class="systems-kicker">Documentação por sistema</span><h2>Sistemas</h2><p>Selecione um sistema para consultar somente os documentos relacionados.</p></div><button type="button" class="btn btn-outline" data-all-systems>Ver todos os documentos</button></div>
    <div class="systems-card-grid">${active.length ? active.map(system => {
      const count = docs.filter(doc => doc.system_id === system.id).length;
      return `<button type="button" class="system-home-card" data-system-id="${esc(system.id)}"><span class="system-card-mark" aria-hidden="true">${esc(system.name.slice(0,2).toUpperCase())}</span><span class="system-card-copy"><strong>${esc(system.name)}</strong><small>${count.toLocaleString('pt-BR')} documento(s)</small></span><span class="system-card-action">Ver documentos →</span></button>`;
    }).join('') : `<div class="systems-empty"><strong>Nenhum sistema ativo no catálogo local.</strong><span>Importe um pacote documental com sistemas para preencher esta área.</span></div>`}</div>`;

  $('[data-all-systems]', section)?.addEventListener('click', () => goToDocuments());
  $$('[data-system-id]', section).forEach(button => button.addEventListener('click', () => goToDocuments(button.dataset.systemId)));
  return true;
}

async function ensureHomeSystems() {
  if (route().name !== 'home') return;
  if (homeBooting) {
    homeBootPending = true;
    return;
  }

  homeBooting = true;
  try {
    if (!await waitForView('.hero')) return;
    renderHomeSystems({ status: 'loading' });
    const result = await refreshData();
    if (route().name !== 'home') return;
    renderHomeSystems({ status: result.ok ? 'ready' : 'error' });
  } finally {
    homeBooting = false;
    if (homeBootPending) {
      homeBootPending = false;
      queueMicrotask(ensureHomeSystems);
    }
  }
}

function renameDisciplineFilter() {
  const row = $('.filter-row');
  if (!row) return;
  const label = $('.filter-label', row);
  if (label && label.textContent !== 'Filtrar por disciplina:') label.textContent = 'Filtrar por disciplina:';
}

function systemOptionsHtml(selected) {
  return `<option value="ALL">Todos os sistemas</option>${systems.filter(s => s.active !== false).map(system => `<option value="${esc(system.id)}" ${system.id === selected ? 'selected' : ''}>${esc(system.name)}</option>`).join('')}`;
}

function renderSystemFilter() {
  if (route().name !== 'documents') return;
  const panel = $('.search-panel');
  if (!panel) return;

  const canonicalNodes = $$('.canonical-system-filter', panel);
  let wrapper = canonicalNodes.shift() || null;
  canonicalNodes.forEach(node => node.remove());

  const selected = selectedSystemId();
  const activeSignature = systems
    .filter(system => system.active !== false)
    .map(system => `${system.id}:${system.name}`)
    .join('|');

  if (!wrapper) {
    wrapper = document.createElement('label');
    wrapper.className = 'canonical-system-filter';
    wrapper.dataset.systemFilter = 'canonical';
    wrapper.innerHTML = `<span>Sistema</span><select aria-label="Filtrar documentos por sistema"></select>`;
    const hint = $('.search-hint', panel);
    if (hint) hint.after(wrapper); else panel.prepend(wrapper);
    wrapper.querySelector('select').addEventListener('change', event => goToDocuments(event.target.value));
  }

  const select = $('select', wrapper);
  if (wrapper.dataset.optionsSignature !== activeSignature) {
    select.innerHTML = systemOptionsHtml(selected);
    wrapper.dataset.optionsSignature = activeSignature;
  }
  if (select.value !== selected) select.value = selected;
  renameDisciplineFilter();
}

function systemName(id) {
  return systems.find(system => system.id === id)?.name || 'Sem sistema';
}

function applyDocumentSystemPresentation() {
  if (route().name !== 'documents') return;
  const selected = selectedSystemId();
  const byId = new Map(docs.map(doc => [String(doc.id), doc]));
  const byCode = new Map();
  for (const doc of docs) {
    const code = String(doc.code || '').trim();
    if (!byCode.has(code)) byCode.set(code, []);
    byCode.get(code).push(doc);
  }
  const visibleIds = new Set();

  const resolveDocument = node => {
    const id = node.dataset.openDoc || node.querySelector?.('[data-open-doc]')?.dataset.openDoc;
    if (id && byId.has(String(id))) return byId.get(String(id));
    const code = $('.doc-code', node)?.textContent.trim() || '';
    const candidates = byCode.get(code) || [];
    return candidates.length === 1 ? candidates[0] : null;
  };

  $$('.doc-table tbody tr').forEach(row => {
    const doc = resolveDocument(row);
    if (!doc) return;
    const cell = row.cells?.[2];
    const name = systemName(doc.system_id);
    const tag = cell ? $('.system-tag', cell) : null;
    if (cell && (!tag || tag.textContent.trim() !== name)) cell.innerHTML = `<span class="system-tag">${esc(name)}</span>`;
    const show = selected === 'ALL' || doc.system_id === selected;
    row.hidden = !show;
    if (show) visibleIds.add(String(doc.id));
  });

  $$('.mobile-doc-card').forEach(card => {
    const doc = resolveDocument(card);
    if (!doc) return;
    const tag = $('.system-tag', card);
    const name = systemName(doc.system_id);
    if (tag && tag.textContent.trim() !== name) tag.textContent = name;
    const show = selected === 'ALL' || doc.system_id === selected;
    card.hidden = !show;
    if (show) visibleIds.add(String(doc.id));
  });

  const visibleCount = visibleIds.size;
  const count = $('.results-bar strong');
  if (count && selected !== 'ALL') {
    const label = `${visibleCount.toLocaleString('pt-BR')} documento(s) encontrado(s)`;
    if (count.textContent !== label) count.textContent = label;
  }

  const existingEmpty = $('.systems-filter-empty');
  const needsEmpty = selected !== 'ALL' && visibleCount === 0 && !!$('.doc-table-wrap');
  if (existingEmpty && !needsEmpty) existingEmpty.remove();
  if (!existingEmpty && needsEmpty) {
    const message = document.createElement('div');
    message.className = 'systems-filter-empty';
    message.textContent = 'Nenhum documento deste sistema corresponde aos demais filtros.';
    $('.doc-table-wrap').after(message);
  }
}

async function enhanceDocuments() {
  if (route().name !== 'documents') return;
  if (!await waitForView('.search-panel')) return;
  await refreshData();
  renderSystemFilter();
  applyDocumentSystemPresentation();
}

function schedule() {
  if (route().name !== 'documents') return;
  if (enhancing) {
    rerunRequested = true;
    return;
  }
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(async () => {
    scheduled = false;
    enhancing = true;
    try {
      await enhanceDocuments();
    } finally {
      enhancing = false;
      if (rerunRequested) {
        rerunRequested = false;
        schedule();
      }
    }
  });
}

new MutationObserver(() => {
  if (route().name === 'home') {
    if ($('.hero') && !$('.systems-home-section')) ensureHomeSystems();
    return;
  }
  if (route().name === 'documents') schedule();
}).observe(document.querySelector('#app'), { childList: true, subtree: true });

addEventListener('hashchange', () => {
  if (route().name === 'home') ensureHomeSystems();
  else if (route().name === 'documents') schedule();
});
addEventListener('load', () => {
  if (route().name === 'home') ensureHomeSystems();
  else if (route().name === 'documents') schedule();
});

if (route().name === 'home') ensureHomeSystems();
else if (route().name === 'documents') schedule();
