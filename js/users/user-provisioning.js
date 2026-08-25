import { normalizeNewUserInput } from './user-validation.js';

const PRODUCTION_ORIGIN = 'https://byd-skyrail.netlify.app';
const PREVIEW_ORIGIN = 'https://deploy-preview-8--byd-skyrail.netlify.app';
const TRUSTED_APP_ORIGINS = new Set([PRODUCTION_ORIGIN, PREVIEW_ORIGIN]);

function canonicalRedirect(origin) {
  const value = String(origin || '').trim().replace(/\/+$/, '');
  return `${TRUSTED_APP_ORIGINS.has(value) ? value : PRODUCTION_ORIGIN}/`;
}

export function inviteRedirectForLocation(locationLike = globalThis.location) {
  return canonicalRedirect(locationLike?.origin);
}

export async function createUserWithClient(client,input,locationLike = globalThis.location){
  const payload={
    ...normalizeNewUserInput(input),
    redirect_to: inviteRedirectForLocation(locationLike)
  };
  const {data,error}=await client.functions.invoke('create-user',{body:payload});
  if(data?.error)throw new Error(data.error);
  if(error||!data?.user)throw new Error('Não foi possível criar o usuário.');
  return data.user;
}
