import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeNewUserInput } from '../js/users/user-validation.js';
import { createUserWithClient, inviteRedirectForLocation } from '../js/users/user-provisioning.js';

const valid=normalizeNewUserInput({
  display_name:'  Teste Controller  ',
  email:' TESTE.CONTROLLER@BYD.COM ',
  role:'controller',
  active:true
});
assert.deepEqual(valid,{
  display_name:'Teste Controller',
  email:'teste.controller@byd.com',
  role:'CONTROLLER',
  active:true
});
assert.throws(()=>normalizeNewUserInput({display_name:'',email:'a@b.com',role:'USER'}),/Nome obrigatório/);
assert.throws(()=>normalizeNewUserInput({display_name:'Teste',email:'invalido',role:'USER'}),/E-mail inválido/);
assert.throws(()=>normalizeNewUserInput({display_name:'Teste',email:'a@b.com',role:'ROOT'}),/Perfil de usuário inválido/);

assert.equal(inviteRedirectForLocation({origin:'https://deploy-preview-8--byd-skyrail.netlify.app'}),'https://deploy-preview-8--byd-skyrail.netlify.app/');
assert.equal(inviteRedirectForLocation({origin:'https://deploy-preview-8--byd-skyrail.netlify.app/'}),'https://deploy-preview-8--byd-skyrail.netlify.app/');
assert.equal(inviteRedirectForLocation({origin:'https://byd-skyrail.netlify.app'}),'https://byd-skyrail.netlify.app/');
assert.equal(inviteRedirectForLocation({origin:'http://localhost:3000'}),'https://byd-skyrail.netlify.app/');

const calls=[];
const fakeClient={functions:{invoke:async(name,options)=>{
  calls.push({name,options});
  return{data:{user:{user_id:'u-1',display_name:options.body.display_name,role:options.body.role,active:options.body.active}},error:null};
}}};
const created=await createUserWithClient(
  fakeClient,
  {display_name:'Teste',email:'TESTE@BYD.COM',role:'CONTROLLER',active:true},
  {origin:'https://deploy-preview-8--byd-skyrail.netlify.app'}
);
assert.equal(created.role,'CONTROLLER');
assert.equal(calls.length,1);
assert.equal(calls[0].name,'create-user');
assert.deepEqual(calls[0].options.body,{
  display_name:'Teste',
  email:'teste@byd.com',
  role:'CONTROLLER',
  active:true,
  redirect_to:'https://deploy-preview-8--byd-skyrail.netlify.app/'
});

const duplicateClient={functions:{invoke:async()=>({data:{error:'Já existe um usuário com este e-mail.'},error:null})}};
await assert.rejects(()=>createUserWithClient(duplicateClient,{display_name:'Teste',email:'teste@byd.com',role:'USER',active:true},{origin:'https://byd-skyrail.netlify.app'}),/Já existe um usuário/);

const [api,validation,provisioning,ux,edge,setPassword,policy]=await Promise.all([
  readFile(new URL('../js/api.js',import.meta.url),'utf8'),
  readFile(new URL('../js/users/user-validation.js',import.meta.url),'utf8'),
  readFile(new URL('../js/users/user-provisioning.js',import.meta.url),'utf8'),
  readFile(new URL('../js/ux-adjustments.js',import.meta.url),'utf8'),
  readFile(new URL('../supabase/functions/create-user/index.ts',import.meta.url),'utf8'),
  readFile(new URL('../supabase/functions/set-password/index.ts',import.meta.url),'utf8'),
  readFile(new URL('../docs/verification-policy.md',import.meta.url),'utf8')
]);
assert.match(api,/createUserWithClient\(getClient\(\),input\)/,'API pública deve usar o serviço testado');
assert.match(provisioning,/functions\.invoke\('create-user'/,'serviço deve invocar a Edge Function segura');
assert.match(provisioning,/redirect_to: inviteRedirectForLocation/,'frontend deve enviar o destino explícito por ambiente');
assert.match(provisioning,/return `\$\{TRUSTED_APP_ORIGINS\.has\(value\) \? value : PRODUCTION_ORIGIN\}\/`/,'frontend deve canonicalizar redirect com barra final para casar com /**');
assert.match(validation,/\['ADMIN','CONTROLLER','USER'\]\.includes\(role\)/,'validação deve aceitar os três perfis');
assert.match(ux,/await createUserInvite\(/,'modal deve executar a criação real');
assert.doesNotMatch(ux,/Esta prévia não cria usuários no Auth/,'mensagem de prévia não pode permanecer no fluxo ativo');
assert.match(ux,/button\.disabled = true/,'envio deve bloquear duplo clique durante criação');
assert.match(edge,/callerMember\.role !== \"ADMIN\"/,'Edge Function deve restringir criação a ADMIN ativo');
assert.match(edge,/callerMember\.activated_at/,'ADMIN pendente não pode criar novos usuários');
assert.match(edge,/\[\"ADMIN\", \"CONTROLLER\", \"USER\"\]\.includes\(role\)/,'Edge Function deve aceitar CONTROLLER');
assert.match(edge,/inviteUserByEmail/,'Edge Function deve criar convite via Auth admin');
assert.match(edge,/activated_at: null/,'novo convite deve permanecer pendente até a senha ser definida');
assert.match(edge,/deleteUser\(userId\)/,'falha ao criar member deve reverter usuário Auth');
assert.match(edge,/payload\.redirect_to/,'Edge Function deve considerar o redirect solicitado pelo frontend');
assert.match(edge,/TRUSTED_ORIGINS\.has\(candidate\)/,'redirect solicitado deve passar por allowlist explícita');
assert.match(edge,/effective_redirect/,'Edge Function deve registrar o redirect efetivo para diagnóstico real');
assert.doesNotMatch(edge,/http:\/\/localhost:3000/,'Edge Function de produção não deve apontar convites para localhost');
assert.match(setPassword,/auth\.admin\.updateUserById\(user\.id, \{ password \}\)/,'definição de senha deve ocorrer no servidor autenticado');
assert.match(setPassword,/activated_at: activatedAt/,'ativação deve ser persistida somente após a senha ser atualizada');
assert.doesNotMatch(setPassword,/console\.log\([^)]*password/i,'senha nunca deve ser registrada em log');
assert.match(policy,/Nenhuma funcionalidade, correção ou item de checklist pode ser marcado/,'regra de verificação deve permanecer documentada');
console.log('user-creation.test.mjs: ok');
