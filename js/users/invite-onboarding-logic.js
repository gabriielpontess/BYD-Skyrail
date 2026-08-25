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
