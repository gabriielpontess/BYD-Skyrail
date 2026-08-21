import { createUserInvite } from './api.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let scheduled = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function documentDataFromRow(row) {
  const cells = [...row.cells];
  if (cells.length < 5) return null;
  return {
    code: cells[0]?.innerText.trim() || '—',
    title: cells[1]?.innerText.trim() || '—',
    system: cells[2]?.innerText.trim() || '—',
    revision: cells[3]?.innerText.trim() || '—',
    status: cells[4]?.innerText.trim() || '—',
    updated: cells[5]?.innerText.trim() || '—'
  };
}

function documentDataFromCard(card) {
  return {
    code: $('.doc-code', card)?.innerText.trim() || '—',
    title: $('.doc-description', card)?.innerText.trim() || '—',
    system: $('.system-tag', card)?.innerText.trim() || '—',
    revision: $$('.status-badge', card).find(item => /rev\./i.test(item.innerText))?.innerText.trim() || '—',
    status: $('.mobile-doc-top .status-badge', card)?.innerText.trim() || '—',
    updated: 'Disponível na consulta do documento.'
  };
}

function openDocumentDetails(data, actionButton) {
  document.querySelector('.ux-doc-details-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop ux-doc-details-backdrop';
  backdrop.innerHTML = `<section class="modal ux-document-details" role="dialog" aria-modal="true" aria-label="Informações do documento">
    <header class="modal-head">
      <div class="modal-head-copy"><strong>${escapeHtml(data.code)}</strong><small>Informações do documento selecionado</small></div>
      <button class="btn btn-outline" data-ux-close type="button">Fechar</button>
    </header>
    <div class="modal-body">
      <div class="ux-document-details-grid">
        <div class="ux-detail-item ux-detail-wide"><span>Descrição</span><strong>${escapeHtml(data.title)}</strong></div>
        <div class="ux-detail-item"><span>Sistema</span><strong>${escapeHtml(data.system)}</strong></div>
        <div class="ux-detail-item"><span>Revisão</span><strong>${escapeHtml(data.revision)}</strong></div>
        <div class="ux-detail-item"><span>Status</span><strong>${escapeHtml(data.status)}</strong></div>
        <div class="ux-detail-item"><span>Atualizado em</span><strong>${escapeHtml(data.updated)}</strong></div>
      </div>
      <div class="ux-detail-actions">
        <button class="btn btn-outline" data-ux-close type="button">Voltar</button>
        <button class="btn btn-primary" data-ux-open-pdf type="button">Abrir documento</button>
      </div>
    </div>
  </section>`;

  const close = () => backdrop.remove();
  $$('[data-ux-close]', backdrop).forEach(button => button.onclick = close);
  $('[data-ux-open-pdf]', backdrop).onclick = () => {
    close();
    actionButton?.click();
  };
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  document.body.append(backdrop);
}

function enhanceDocumentRows() {
  $$('.doc-table tbody tr').forEach(row => {
    if (row.dataset.uxClickable === 'true') return;
    const openButton = $('.table-actions [data-open-doc]', row);
    if (!openButton) return;

    const data = documentDataFromRow(row);
    if (!data) return;

    row.dataset.uxClickable = 'true';
    row.setAttribute('data-ux-clickable', 'true');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Ver informações do documento ${data.code}`);

    const showDetails = event => {
      if (event?.target?.closest('.table-actions')) return;
      event?.preventDefault();
      event?.stopPropagation();
      openDocumentDetails(data, openButton);
    };

    row.addEventListener('click', showDetails);
    row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') showDetails(event);
    });

    const codeButton = $('.doc-code', row);
    if (codeButton) codeButton.onclick = showDetails;
  });

  $$('.mobile-doc-card').forEach(card => {
    if (card.dataset.uxClickable === 'true') return;
    const openButton = $('.mobile-doc-actions [data-open-doc]', card);
    if (!openButton) return;
    const data = documentDataFromCard(card);

    card.dataset.uxClickable = 'true';
    card.setAttribute('data-ux-clickable', 'true');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ver informações do documento ${data.code}`);

    const showDetails = event => {
      if (event?.target?.closest('.mobile-doc-actions')) return;
      event?.preventDefault();
      event?.stopPropagation();
      openDocumentDetails(data, openButton);
    };

    card.addEventListener('click', showDetails);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') showDetails(event);
    });

    const codeButton = $('.doc-code', card);
    if (codeButton) codeButton.onclick = showDetails;
  });
}

function enhanceSystemFilter() {
  const panel = $('.search-panel');
  const row = $('.filter-row', panel || document);
  if (!panel || !row || $('.ux-system-filter', panel)) return;
  const filterButtons = $$('[data-filter]', row);
  if (!filterButtons.length) return;
  const selected = filterButtons.find(button => button.classList.contains('active'))?.dataset.filter || 'ALL';
  const wrapper = document.createElement('label');
  wrapper.className = 'ux-system-filter';
  wrapper.innerHTML = `<span>Sistema</span><select aria-label="Filtrar documentos por sistema">${filterButtons.map(button => `<option value="${escapeHtml(button.dataset.filter)}" ${button.dataset.filter === selected ? 'selected' : ''}>${escapeHtml(button.dataset.filter === 'ALL' ? 'Todos os sistemas' : button.textContent.trim())}</option>`).join('')}</select>`;
  const select = $('select', wrapper);
  select.onchange = () => filterButtons.find(button => button.dataset.filter === select.value)?.click();
  row.before(wrapper);
}

function isAdministratorScreen() {
  return /administrador/i.test($('#header-user-role')?.textContent || '') || /administrador/i.test($('.access-role strong')?.textContent || '');
}

function openAddUserDialog() {
  document.querySelector('.ux-add-user-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop ux-add-user-backdrop';
  backdrop.innerHTML = `<section class="modal" style="width:min(680px,100%)" role="dialog" aria-modal="true" aria-label="Adicionar usuário">
    <header class="modal-head"><div class="modal-head-copy"><strong>Adicionar usuário</strong><small>Convite seguro para acesso ao BYD Skyrail</small></div><button class="btn btn-outline" data-ux-close type="button">Fechar</button></header>
    <div class="modal-body">
      <form class="admin-form" data-ux-user-form>
        <label class="field wide"><span>Nome completo</span><input name="name" required placeholder="Nome do colaborador"></label>
        <label class="field wide"><span>E-mail</span><input name="email" type="email" required placeholder="usuario@empresa.com"></label>
        <label class="field"><span>Perfil</span><select name="role"><option value="USER">USER</option><option value="ADMIN">ADMIN</option></select></label>
        <label class="field"><span>Acesso inicial</span><select name="active"><option value="false">Inativo</option><option value="true">Ativo</option></select></label>
        <div class="wide ux-add-user-note">O usuário receberá um convite por e-mail. A senha será definida pelo próprio usuário.</div>
        <div class="wide" style="display:flex;justify-content:flex-end"><button class="btn btn-primary" type="submit">Enviar convite</button></div>
      </form>
    </div>
  </section>`;

  const close = () => backdrop.remove();
  $('[data-ux-close]', backdrop).onclick = close;
  $('[data-ux-user-form]', backdrop).onsubmit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const note = $('.ux-add-user-note', backdrop);
    const data = new FormData(form);
    button.disabled = true;
    note.textContent = 'Criando acesso e enviando convite…';
    try {
      await createUserInvite({
        display_name: data.get('name'),
        email: data.get('email'),
        role: data.get('role'),
        active: data.get('active') === 'true'
      });
      note.textContent = 'Convite enviado e perfil criado com sucesso.';
      note.style.background = 'var(--green-100)';
      note.style.color = 'var(--green-700)';
      form.reset();
      setTimeout(close, 1200);
    } catch (error) {
      note.textContent = error.message || 'Não foi possível criar o usuário.';
      note.style.background = 'var(--red-100)';
      note.style.color = 'var(--red-700)';
    } finally {
      button.disabled = false;
    }
  };
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  document.body.append(backdrop);
}

function enhanceAdminProfile() {
  if (!isAdministratorScreen()) return;
  const profileMain = $('.profile-main');
  if (!profileMain || $('.ux-admin-users-entry', profileMain)) return;
  const section = document.createElement('section');
  section.className = 'profile-section ux-admin-users-entry';
  section.innerHTML = `<div class="profile-section-head"><div><h2>Usuários e perfis</h2><p>Crie novos acessos e escolha entre os perfis ADMIN ou USER.</p></div><button class="btn btn-primary" data-ux-add-user type="button">Adicionar usuário</button></div>`;
  $('[data-ux-add-user]', section).onclick = openAddUserDialog;
  profileMain.append(section);
}

function enhanceAdminUsersTab() {
  const list = $('.user-list');
  if (!list) return;
  const panel = list.closest('.panel-card');
  if (!panel || $('.ux-users-toolbar', panel)) return;
  const heading = $('h3', panel);
  const toolbar = document.createElement('div');
  toolbar.className = 'ux-users-toolbar';
  toolbar.innerHTML = `<h3>${escapeHtml(heading?.textContent || 'Gestão de usuários')}</h3><button class="btn btn-primary" data-ux-add-user type="button">Adicionar usuário</button>`;
  heading?.remove();
  panel.prepend(toolbar);
  $('[data-ux-add-user]', toolbar).onclick = openAddUserDialog;
}

function enhanceAll() {
  enhanceSystemFilter();
  enhanceDocumentRows();
  enhanceAdminProfile();
  enhanceAdminUsersTab();
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    enhanceAll();
  });
}

new MutationObserver(scheduleEnhance).observe(document.querySelector('#app'), { childList: true, subtree: true });
addEventListener('hashchange', scheduleEnhance);
addEventListener('load', scheduleEnhance);
scheduleEnhance();
