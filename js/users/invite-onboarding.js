import { getClient } from '../client.js';

const INVITE_KEY = 'byd-skyrail:invite-activation-pending';

export function isInviteCallback(locationLike = globalThis.location) {
  const hash = String(locationLike?.hash || '').replace(/^#/, '');
  const search = String(locationLike?.search || '').replace(/^\?/, '');
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);
  return hashParams.get('type') === 'invite' || searchParams.get('type') === 'invite';
}

export function validateActivationPassword(password, confirm) {
  const value = String(password || '');
  if (value.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
  if (value !== String(confirm || '')) throw new Error('A confirmação da senha não confere.');
  return value;
}

function rememberInvite() {
  if (isInviteCallback()) sessionStorage.setItem(INVITE_KEY, '1');
}

function hasPendingInvite() {
  return sessionStorage.getItem(INVITE_KEY) === '1';
}

function clearInviteState() {
  sessionStorage.removeItem(INVITE_KEY);
  const cleanUrl = `${location.pathname}${location.search}`;
  history.replaceState(null, '', cleanUrl || '/');
}

function renderActivation(session, client) {
  let root = document.querySelector('#invite-activation-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'invite-activation-root';
    document.body.append(root);
  }
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#f4f7fb;overflow:auto';
  const email = session?.user?.email || '';
  root.innerHTML = `<main class="login-shell" style="min-height:100vh">
    <section class="login-visual" aria-hidden="true">
      <div class="login-visual-copy">
        <div class="login-gold-line"></div>
        <h2>Ative seu acesso<br>ao BYD Skyrail.</h2>
        <p>Defina sua senha para concluir o primeiro acesso ao sistema.</p>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <h1>Ativar acesso</h1>
        <p>${email ? `Conta: <strong>${escapeHtml(email)}</strong>` : 'Defina uma senha para concluir seu cadastro.'}</p>
        <div id="invite-error" class="login-error" role="alert" hidden></div>
        <form id="invite-activation-form" class="login-form">
          <label class="field"><span>Nova senha</span><input type="password" name="password" autocomplete="new-password" minlength="8" required></label>
          <label class="field"><span>Confirmar senha</span><input type="password" name="confirm" autocomplete="new-password" minlength="8" required></label>
          <button class="btn btn-primary" type="submit">Ativar acesso</button>
        </form>
      </div>
    </section>
  </main>`;

  const form = root.querySelector('#invite-activation-form');
  const errorBox = root.querySelector('#invite-error');
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = 'Ativando…';
    errorBox.hidden = true;
    try {
      const data = new FormData(form);
      const password = validateActivationPassword(data.get('password'), data.get('confirm'));
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new Error(error.message || 'Não foi possível definir a senha.');
      clearInviteState();
      location.reload();
    } catch (error) {
      errorBox.textContent = error?.message || 'Não foi possível concluir a ativação.';
      errorBox.hidden = false;
      button.disabled = false;
      button.textContent = 'Ativar acesso';
    }
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function waitForSession(client, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data?.session) return data.session;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return null;
}

export async function bootstrapInviteOnboarding() {
  rememberInvite();
  if (!hasPendingInvite()) return false;
  const client = getClient();
  try {
    const session = await waitForSession(client);
    if (!session) throw new Error('O convite não pôde ser validado. Solicite um novo convite ao administrador.');
    renderActivation(session, client);
    return true;
  } catch (error) {
    let root = document.querySelector('#invite-activation-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'invite-activation-root';
      document.body.append(root);
    }
    root.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#f4f7fb;padding:32px;overflow:auto';
    root.innerHTML = `<div class="login-card" style="max-width:560px;margin:8vh auto"><h1>Não foi possível ativar o acesso</h1><div class="login-error" role="alert">${escapeHtml(error?.message || 'Convite inválido ou expirado.')}</div></div>`;
    return true;
  }
}

if (typeof document !== 'undefined' && typeof sessionStorage !== 'undefined') {
  bootstrapInviteOnboarding();
}
