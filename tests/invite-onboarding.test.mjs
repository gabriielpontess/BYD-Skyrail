import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  authCallbackType,
  isInviteCallback,
  isRecoveryCallback,
  validateActivationPassword
} from '../js/users/invite-onboarding-logic.js';

assert.equal(authCallbackType({hash:'#access_token=abc&type=invite',search:''}),'invite');
assert.equal(authCallbackType({hash:'#access_token=abc&type=recovery',search:''}),'recovery');
assert.equal(authCallbackType({hash:'',search:'?type=invite'}),'invite');
assert.equal(authCallbackType({hash:'#/',search:''}),'');
assert.equal(isInviteCallback({hash:'#access_token=abc&type=invite',search:''}),true);
assert.equal(isRecoveryCallback({hash:'#access_token=abc&type=recovery',search:''}),true);

assert.equal(validateActivationPassword('Senha123','Senha123'),'Senha123');
assert.throws(()=>validateActivationPassword('1234567','1234567'),/pelo menos 8 caracteres/);
assert.throws(()=>validateActivationPassword('x'.repeat(129),'x'.repeat(129)),/no máximo 128 caracteres/);
assert.throws(()=>validateActivationPassword('Senha123','Senha456'),/confirmação da senha não confere/);

const [onboarding,api,index]=await Promise.all([
  readFile(new URL('../js/users/invite-onboarding.js',import.meta.url),'utf8'),
  readFile(new URL('../js/api.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8')
]);
assert.doesNotMatch(onboarding,/sessionStorage/,'estado de ativação não pode depender da sessão do navegador');
assert.match(onboarding,/select\('user_id,active,activated_at'\)/,'onboarding deve consultar ativação persistida no servidor');
assert.match(onboarding,/functions\.invoke\('set-password'/,'senha e ativação devem ser concluídas pela Edge Function autenticada');
assert.match(onboarding,/resetPasswordForEmail/,'login deve permitir recuperar uma ativação interrompida sem novo convite');
assert.match(onboarding,/history\.replaceState/,'tokens de convite/recuperação devem ser removidos da URL após sucesso');
assert.match(onboarding,/Ativar acesso/,'deve existir tela explícita de primeiro acesso');
assert.match(api,/!data\?\.activated_at/,'membro sem ativação concluída não pode entrar no app');
assert.match(index,/js\/users\/invite-onboarding\.js[\s\S]*js\/app\.js/,'onboarding deve carregar antes do app principal');
console.log('invite-onboarding.test.mjs: ok');
