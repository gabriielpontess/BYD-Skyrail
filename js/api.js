import { getClient } from './client.js';
import { documentRepository } from './documents/catalog-repository.js';

const v=value=>String(value??'').trim();

export async function currentMember(){
  const client=getClient();
  const {data:{session}}=await client.auth.getSession();
  if(!session?.user)return null;
  const {data,error}=await client.from('members').select('user_id,display_name,role,active').eq('user_id',session.user.id).single();
  if(error||!data?.active)return null;
  const authName=v(session.user.user_metadata?.display_name);
  return{user:session.user,...data,display_name:authName||data.display_name};
}
export async function signIn(email,password){const{error}=await getClient().auth.signInWithPassword({email:v(email),password:String(password??'')});if(error)throw new Error('E-mail ou senha inválidos.');return currentMember()}
export async function signOut(){await getClient().auth.signOut({scope:'local'})}
export async function updateOwnProfile(input){const display_name=v(input?.display_name),cargo=v(input?.cargo),telefone=v(input?.telefone);if(!display_name)throw new Error('Nome obrigatório.');const{error}=await getClient().auth.updateUser({data:{display_name,cargo,telefone}});if(error)throw new Error('Não foi possível atualizar o perfil.');return currentMember()}
export async function changeOwnPassword(password){const next=String(password??'');if(next.length<8)throw new Error('A nova senha deve ter pelo menos 8 caracteres.');const{error}=await getClient().auth.updateUser({password:next});if(error)throw new Error('Não foi possível alterar a senha.')}

export function normalizeNewUserInput(input){
  const display_name=v(input?.display_name);
  const email=v(input?.email).toLowerCase();
  const role=v(input?.role||'USER').toUpperCase();
  const active=input?.active===true;
  if(!display_name)throw new Error('Nome obrigatório.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('E-mail inválido.');
  if(!['ADMIN','CONTROLLER','USER'].includes(role))throw new Error('Perfil de usuário inválido.');
  return{display_name,email,role,active};
}

export async function createUserInvite(input){
  const payload=normalizeNewUserInput(input);
  const {data,error}=await getClient().functions.invoke('create-user',{body:payload});
  if(data?.error)throw new Error(data.error);
  if(error||!data?.user)throw new Error('Não foi possível criar o usuário.');
  return data.user;
}

export async function listSystems({includeInactive=false}={}){return documentRepository.getSystems({includeInactive})}
export async function saveSystem(){throw new Error('Sistemas são administrados pelo catálogo local desta V1. Importe um pacote documental atualizado.')}
export async function listActive(){return documentRepository.getAll()}
export async function listAdmin(){return documentRepository.getAll({includeInactive:true})}

export async function listMembers(){const{data,error}=await getClient().from('members').select('user_id,display_name,role,active,created_at,updated_at').order('display_name');if(error)throw new Error('Não foi possível carregar os usuários.');return data||[]}
export async function updateMember(userId,input){const role=v(input?.role).toUpperCase();if(!['ADMIN','CONTROLLER','USER'].includes(role))throw new Error('Perfil de usuário inválido.');const display_name=v(input?.display_name);if(!display_name)throw new Error('Nome do usuário obrigatório.');const{data,error}=await getClient().from('members').update({display_name,role,active:input?.active===true}).eq('user_id',v(userId)).select('user_id,display_name,role,active,created_at,updated_at').single();if(error||!data)throw new Error('Não foi possível atualizar o usuário.');return data}
export async function listDocumentHistory(documentId){const{data,error}=await getClient().from('document_history').select('id,document_id,event_type,code,title,discipline,revision,file_path,active,recorded_at,recorded_by').eq('document_id',v(documentId)).order('recorded_at',{ascending:false});if(error)throw new Error('Não foi possível carregar o histórico do documento.');return data||[]}
export async function listRecentDocumentHistory(limit=50){const safeLimit=Math.min(100,Math.max(1,Number(limit)||50));const{data,error}=await getClient().from('document_history').select('id,document_id,event_type,code,title,discipline,revision,file_path,active,recorded_at,recorded_by').order('recorded_at',{ascending:false}).limit(safeLimit);if(error)throw new Error('Não foi possível carregar a auditoria.');return data||[]}

export async function downloadPdf(){throw new Error('Download por nuvem foi removido. O PDF deve existir no armazenamento local do aplicativo.')}
export async function saveDocument(){throw new Error('Cadastro individual em nuvem foi removido. Atualize a documentação por pacote local.')}
