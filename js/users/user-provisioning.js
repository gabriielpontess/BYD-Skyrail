import { normalizeNewUserInput } from './user-validation.js';

const TRUSTED_APP_ORIGINS = new Set([
  'https://byd-skyrail.netlify.app',
  'https://deploy-preview-8--byd-skyrail.netlify.app'
]);

export function inviteRedirectForLocation(locationLike = globalThis.location) {
  const origin = String(locationLike?.origin || '').trim().replace(/\/$/, '');
  return TRUSTED_APP_ORIGINS.has(origin) ? origin : 'https://byd-skyrail.netlify.app';
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
