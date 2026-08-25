import { getClient } from '../client.js';
import { inviteRedirectForLocation } from './user-provisioning.js';
import {
  authCallbackType,
  isInviteCallback,
  isRecoveryCallback,
  validateActivationPassword
} from './invite-onboarding-logic.js';

export { authCallbackType, isInviteCallback, isRecoveryCallback, validateActivationPassword };

function clearAuthState() {
  history.replaceState(null, '', location.pathname || '/');
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

async function currentSession(client, callbackType) {
  if (callbackType) return waitForSession(client);
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

async function memberActivation(client, userId) {
  const { data, error } = await client
    .from('members')
    .select('user_id,active,activated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function renderPasswordScreen(session, client, { pendingActivation = false } = {}) {
  let root = document.querySelector('#invite-activation-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'invite-activation-root';
    document.body.append(root);
  }
  root.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#f4f7fb;overflow:auto';

  const email = session?.user?.email || '';
  const firstAccess = pendingActivation;
  const title = firstAccess ? 'Ativar acesso' : 'Definir nova senha';
  const heroTitle = firstAccess ? 'Ative seu acesso<br>ao BYD Skyrail.' : 'Recupere seu acesso<br>ao BYD Skyrail.';
  const description = firstAccess
    ? 'Defina sua senha para concluir o primeiro acesso ao sistema.'
    : 'Defina uma nova senha para voltar a acessar o sistema.';
  const submitLabel = firstAccess ? 'Ativar acesso' : 'Salvar nova senha';

  root.innerHTML = `<main class="login-shell" style="min-height:100vh">
    <section class="login-visual" aria-hidden="true">
      <div class="login-visual-copy">
        <div class="login-gold-line"></div>
        <h2>${heroTitle}</h2>
        <p>${description}</p>
      </div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <h1>${title}</h1>
        <p>${email ? `Conta: <strong>${escapeHtml(email)}</strong>` : 'Defina uma senha para continuar.'}</p>
        <div id="invite-error" class="login-error" role="alert" hidden></div>
        <form id="invite-activation-form" class="login-form">
          <label class="field"><span>Nova senha</span><input type="password" name="password" autocomplete="new-password" minlength="8" maxlength="128" required></label>
          <label class="field"><span>Confirmar senha</span><input type="password" name="confirm" autocomplete="new-password" minlength="8" maxlength="128" required></label>
          <button class="btn btn-primary" type="submit">${submitLabel}</button>
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
    button.textContent = firstAccess ? 'Ativando…' : 'Salvando…';
    errorBox.hidden = true;
    try {
      const data = new FormData(form);
      const password = validateActivationPassword(data.get('password'), data.get('confirm'));
      const { data: result, error } = await client.functions.invoke('set-password', { body: { password } });
      if (result?.error) throw new Error(result.error);
      if (error || !result?.activated_at) throw new Error('Não foi possível definir a senha.');
      clearAuthState();
      location.reload();
    } catch (error) {
      errorBox.textContent = error?.message || 'Não foi possível concluir a operação.';
      errorBox.hidden = false;
      button.disabled = false;
      button.textContent = submitLabel;
    }
  };
}

export async function bootstrapInviteOnboarding() {
  const client = getClient();
  const callbackType = authCallbackType();
  const session = await currentSession(client, callbackType);
  if (!session?.user) return false;

  const member = await memberActivation(client, session.user.id);
  if (!member?.active) return false;

  const pendingActivation = !member.activated_at;
  const recovery = callbackType === 'recovery';
  if (!pendingActivation && !recovery) {
    if (callbackType === 'invite') clearAuthState();
    return false;
  }

  renderPasswordScreen(session, client, { pendingActivation });
  return true;
}

function recoveryMessage(form, message, error = false) {
  let box = form.querySelector('[data-password-recovery-message]');
  if (!box) {
    box = document.createElement('div');
    box.dataset.passwordRecoveryMessage = '1';
    box.setAttribute('role', 'status');
    form.append(box);
  }
  box.textContent = message;
  box.style.cssText = `font-size:13px;line-height:1.45;text-align:center;color:${error ? '#b42318' : '#34506f'};`;
}

function attachPasswordRecovery() {
  const form = document.querySelector('#login-form');
  if (!form || form.querySelector('[data-password-recovery]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.passwordRecovery = '1';
  button.textContent = 'Esqueci minha senha';
  button.style.cssText = 'border:0;background:transparent;color:#174a7e;font:inherit;font-size:14px;font-weight:700;cursor:pointer;padding:2px 0 0;text-align:center;';
  form.append(button);

  button.addEventListener('click', async () => {
    const email = String(form.elements.email?.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      recoveryMessage(form, 'Informe seu e-mail acima para recuperar o acesso.', true);
      form.elements.email?.focus();
      return;
    }

    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Enviando…';
    try {
      const client = getClient();
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: inviteRedirectForLocation()
      });
      if (error) throw error;
      recoveryMessage(form, 'Se este e-mail estiver cadastrado, enviaremos um link para definir uma nova senha.');
    } catch {
      recoveryMessage(form, 'Não foi possível solicitar a recuperação agora. Tente novamente.', true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}

if (typeof document !== 'undefined') {
  bootstrapInviteOnboarding().catch(error => console.error('[BYD Skyrail] Falha no onboarding:', error));
  attachPasswordRecovery();
  const observer = new MutationObserver(attachPasswordRecovery);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
