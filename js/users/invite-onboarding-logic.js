export function authCallbackType(locationLike = globalThis.location) {
  const hash = String(locationLike?.hash || '').replace(/^#/, '');
  const search = String(locationLike?.search || '').replace(/^\?/, '');
  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);
  const type = hashParams.get('type') || searchParams.get('type') || '';
  return ['invite', 'recovery'].includes(type) ? type : '';
}

export function isInviteCallback(locationLike = globalThis.location) {
  return authCallbackType(locationLike) === 'invite';
}

export function isRecoveryCallback(locationLike = globalThis.location) {
  return authCallbackType(locationLike) === 'recovery';
}

export function validateActivationPassword(password, confirm) {
  const value = String(password || '');
  if (value.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
  if (value.length > 128) throw new Error('A senha deve ter no máximo 128 caracteres.');
  if (value !== String(confirm || '')) throw new Error('A confirmação da senha não confere.');
  return value;
}
