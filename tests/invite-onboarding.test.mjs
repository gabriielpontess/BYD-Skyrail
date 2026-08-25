import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isInviteCallback, validateActivationPassword } from '../js/users/invite-onboarding.js';

assert.equal(isInviteCallback({hash:'#access_token=abc&type=invite',search:''}),true);
assert.equal(isInviteCallback({hash:'#access_token=abc&type=recovery',search:''}),false);
assert.equal(isInviteCallback({hash:'',search:'?type=invite'}),true);
assert.equal(isInviteCallback({hash:'#/',search:''}),false);

assert.equal(validateActivationPassword('Senha123','Senha123'),'Senha123');
assert.throws(()=>validateActivationPassword('1234567','1234567'),/pelo menos 8 caracteres/);
assert.throws(()=>validateActivationPassword('Senha123','Senha456'),/confirmação da senha não confere/);

const [onboarding,index]=await Promise.all([
  readFile(new URL('../js/users/invite-onboarding.js',import.meta.url),'utf8'),
  readFile(new URL('../index.html',import.meta.url),'utf8')
]);
assert.match(onboarding,/sessionStorage\.setItem\(INVITE_KEY, '1'\)/,'callback de convite deve sobreviver à limpeza do hash pelo cliente Auth');
assert.match(onboarding,/client\.auth\.updateUser\(\{ password \}\)/,'ativação deve definir a senha no Supabase Auth');
assert.match(onboarding,/history\.replaceState/,'tokens de convite devem ser removidos da URL após ativação');
assert.match(onboarding,/location\.reload\(\)/,'app deve recarregar após ativação para usar a sessão persistida');
assert.match(onboarding,/Ativar acesso/,'deve existir tela explícita de primeiro acesso');
assert.match(index,/js\/users\/invite-onboarding\.js[\s\S]*js\/app\.js/,'onboarding deve carregar antes do app principal');
console.log('invite-onboarding.test.mjs: ok');
