import { createUserInvite } from './api.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let scheduled = false;

// Canonical Sistema filtering is intentionally NOT implemented in this module.
// js/systems-ux.js is the sole owner of the Sistema control.

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function currentRole() {
  try { return String(JSON.parse(localStorage.getItem('byd-skyrail-member-cache') || 'null')?.role || '').toUpperCase(); }
  catch { return ''; }
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

function isAdministratorScreen() {
  return currentRole() === 'ADMIN';
}

function openAddUserPreview() {
  if (currentRole() !== 'ADMIN') return;
  document.querySelector('.ux-add-user-backdrop')?.remove();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop ux-add-user-backdrop';
  backdrop.innerHTML = `<section class="modal" style="width:min(680px,100%)" role="dialog" aria-modal="true" aria-label="Adicionar usuário">
    <header class="modal-head"><div class="modal-head-copy"><strong>Adicionar usuário</strong><small>Cadastro de acesso ao BYD Skyrail</small></div><button class="btn btn-outline" data-ux-close type="button">Fechar</button></header>
    <div class="modal-body">
      <form class="admin-form" data-ux-user-form>
        <label class="field wide"><span>Nome completo</span><input name="name" required placeholder="Nome do colaborador"></label>
        <label class="field wide"><span>E-mail</span><input name="email" type="email" required placeholder="usuario@empresa.com"></label>
        <label class="field"><span>Perfil</span><select name="role"><option value="USER">USER</option><option value="CONTROLLER">CONTROLLER</option><option value="ADMIN">ADMIN</option></select></label>
        <label class="field"><span>Acesso inicial</span><select name="active"><option value="false">Inativo</option><option value="true">Ativo</option></select></label>
        <div class="wide ux-add-user-note" aria-live="polite">Ao confirmar, o usuário receberá um convite seguro por e-mail para definir o acesso.</div>
        <div class="wide" style="display:flex;justify-content:flex-end"><button class="btn btn-primary" type="submit">Adicionar usuário</button></div>
      </form>
    </div>
  </section>`;

  const close = () => backdrop.remove();
  $('[data-ux-close]', backdrop).onclick = close;
  $('[data-ux-user-form]', backdrop).onsubmit = async event => {
    event.preventDefault();
    if (currentRole() !== 'ADMIN') {
      $('.ux-add-user-note', backdrop).textContent = 'Ação disponível somente para administradores.';
      return;
    }
    const form = event.currentTarget;
    const note = $('.ux-add-user-note', backdrop);
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    button.disabled = true;
    button.classList.add('is-loading');
    button.textContent = 'Criando usuário';
    note.classList.remove('error','success');
    note.textContent = 'Criando conta e perfil de acesso…';
    try {
      const user = await createUserInvite({
        display_name: data.get('name'),
        email: data.get('email'),
        role: data.get('role'),
        active: data.get('active') === 'true'
      });
      note.textContent = `Usuário ${user.display_name || data.get('name')} criado. Convite enviado para ${data.get('email')}.`;
      note.classList.add('success');
      form.reset();
      setTimeout(() => {
        close();
        document.querySelector('[data-refresh]')?.click();
      }, 700);
    } catch (error) {
      note.textContent = error?.message || 'Não foi possível criar o usuário.';
      note.classList.add('error');
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = 'Adicionar usuário';
    }
  };
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  document.body.append(backdrop);
}

function enhanceAdminProfile() {
  if (!isAdministratorScreen()) {
    $('.ux-admin-users-entry')?.remove();
    return;
  }
  const profileMain = $('.profile-main');
  if (!profileMain || $('.ux-admin-users-entry', profileMain)) return;

  const section = document.createElement('section');
  section.className = 'profile-section ux-admin-users-entry';
  section.innerHTML = `<div class="profile-section-head"><div><h2>Usuários e perfis</h2><p>Crie novos acessos e escolha entre os perfis ADMIN, CONTROLLER ou USER.</p></div><button class="btn btn-primary" data-ux-add-user type="button">Adicionar usuário</button></div>`;
  $('[data-ux-add-user]', section).onclick = openAddUserPreview;
  profileMain.append(section);
}

function enhanceAdminUsersTab() {
  if (currentRole() !== 'ADMIN') return;
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
  $('[data-ux-add-user]', toolbar).onclick = openAddUserPreview;
}

function enhanceAll() {
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
