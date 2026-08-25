import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeNewUserInput } from '../js/api.js';

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

const [api,ux,edge,policy]=await Promise.all([
  readFile(new URL('../js/api.js',import.meta.url),'utf8'),
  readFile(new URL('../js/ux-adjustments.js',import.meta.url),'utf8'),
  readFile(new URL('../supabase/functions/create-user/index.ts',import.meta.url),'utf8'),
  readFile(new URL('../docs/verification-policy.md',import.meta.url),'utf8')
]);
assert.match(api,/functions\.invoke\('create-user'/,'frontend deve invocar a Edge Function segura');
assert.match(api,/\['ADMIN','CONTROLLER','USER'\]\.includes\(role\)/,'frontend deve aceitar os três perfis');
assert.match(ux,/await createUserInvite\(/,'modal deve executar a criação real');
assert.doesNotMatch(ux,/Esta prévia não cria usuários no Auth/,'mensagem de prévia não pode permanecer no fluxo ativo');
assert.match(ux,/button\.disabled = true/,'envio deve bloquear duplo clique durante criação');
assert.match(edge,/callerMember\.role !== \"ADMIN\"/,'Edge Function deve restringir criação a ADMIN ativo');
assert.match(edge,/\[\"ADMIN\", \"CONTROLLER\", \"USER\"\]\.includes\(role\)/,'Edge Function deve aceitar CONTROLLER');
assert.match(edge,/inviteUserByEmail/,'Edge Function deve criar convite via Auth admin');
assert.match(edge,/deleteUser\(userId\)/,'falha ao criar member deve reverter usuário Auth');
assert.match(policy,/Nenhuma funcionalidade, correção ou item de checklist pode ser marcado/,'regra de verificação deve permanecer documentada');
console.log('user-creation.test.mjs: ok');
