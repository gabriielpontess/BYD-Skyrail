import { listSystems } from './api.js';
import { getClient } from './client.js';
import { listLocal } from './db.js';

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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function route() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name = 'home', query = ''] = raw.split('?');
  return { name, params: new URLSearchParams(query) };
}

function cachedSystems() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
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

async function authenticatedSession() {
  try {
    const { data, error } = await getClient().auth.getSession();
    if (error) return null;
    return data?.session || null;
  } catch {
    return null;
  }
}

async function waitForAuthenticatedSession(timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = await authenticatedSession();
    if (session?.user) return session;
    await sleep(120);
  }
  return null;
}

async function refreshData({ requireSession = false } = {}) {
  try { docs = await listLocal(); } catch { docs = []; }
  systems = cachedSystems();
  if (!navigator.onLine) return true;

  const session = requireSession ? await waitForAuthenticatedSession() : await authenticatedSession();
  if (!session?.user) return false;

  try {
    const fresh = await listSystems();
    systems = fresh;
    localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
    return true;
  } catch {
    return false;
  }
}

function selectedSystemId() {
  const value = route().params.get('system');
  return value && systems.some(system => system.id === value && system.active !== false) ? value : 'ALL';
}

function goToDocuments(systemId = 'ALL') {
  location.hash = systemId === 'ALL' ? '#/documents' : `#/documents?system=${encodeURIComponent(systemId)}`;
}

function renderHomeSystems() {
  if (route().name !== 'home') return false;
  const hero = $('.hero');
  if (!hero) return false;

  const active = systems.filter(system => system.active !== false);
  let section = $('.systems-home-section');
  if (!section) {
    section = document.createElement('section');
    section.className = 'systems-home-section';
    const next = hero.nextElementSibling;
    if (next) hero.parentNode.insertBefore(section, next); else hero.after(section);
  }

  section.innerHTML = `<div class="systems-section-head"><div><span class="systems-kicker">Documentação por sistema</span><h2>Sistemas</h2><p>Selecione um sistema para consultar somente os documentos relacionados.</p></div><button type="button" class="btn btn-outline" data-all-systems>Ver todos os documentos</button></div>
    <div class="systems-card-grid">${active.length ? active.map(system => {
      const count = docs.filter(doc => doc.system_id === system.id).length;
      return `<button type="button" class="system-home-card" data-system-id="${esc(system.id)}"><span class="system-card-mark" aria-hidden="true">${esc(system.name.slice(0,2).toUpperCase())}</span><span class="system-card-copy"><strong>${esc(system.name)}</strong><small>${count.toLocaleString('pt-BR')} documento(s)</small></span><span class="system-card-action">Ver documentos →</span></button>`;
    }).join('') : `<div class="systems-empty"><strong>Nenhum sistema ativo cadastrado.</strong><span>Um ADMIN pode cadastrar sistemas antes de classificar os documentos.</span></div>`}</div>`;

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
    await refreshData({ requireSession: true });
    if (route().name === 'home') renderHomeSystems();
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
  const byCode = new Map(docs.map(doc => [String(doc.code || '').trim(), doc]));
  let visibleCount = 0;

  $$('.doc-table tbody tr').forEach(row => {
    const code = $('.doc-code', row)?.textContent.trim() || '';
    const doc = byCode.get(code);
    if (!doc) return;
    const cell = row.cells?.[2];
    const name = systemName(doc.system_id);
    const tag = cell ? $('.system-tag', cell) : null;
    if (cell && (!tag || tag.textContent.trim() !== name)) cell.innerHTML = `<span class="system-tag">${esc(name)}</span>`;
    const show = selected === 'ALL' || doc.system_id === selected;
    if (row.hidden === show) row.hidden = !show;
    if (show) visibleCount++;
  });

  $$('.mobile-doc-card').forEach(card => {
    const code = $('.doc-code', card)?.textContent.trim() || '';
    const doc = byCode.get(code);
    if (!doc) return;
    const tag = $('.system-tag', card);
    const name = systemName(doc.system_id);
    if (tag && tag.textContent.trim() !== name) tag.textContent = name;
    const show = selected === 'ALL' || doc.system_id === selected;
    if (card.hidden === show) card.hidden = !show;
  });

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
addEventListener('online', () => {
  if (route().name === 'home') ensureHomeSystems();
  else if (route().name === 'documents') schedule();
});
addEventListener('load', () => {
  if (route().name === 'home') ensureHomeSystems();
  else if (route().name === 'documents') schedule();
});

try {
  getClient().auth.onAuthStateChange((_event, session) => {
    if (!session?.user) return;
    if (route().name === 'home') ensureHomeSystems();
    else if (route().name === 'documents') schedule();
  });
} catch {}

if (route().name === 'home') ensureHomeSystems();
else if (route().name === 'documents') schedule();
