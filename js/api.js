import { getClient } from './client.js';
import { documentRepository } from './documents/catalog-repository.js';
import { normalizeNewUserInput } from './users/user-validation.js';
import { createUserWithClient, inviteRedirectForLocation } from './users/user-provisioning.js';

const v=value=>String(value??'').trim();
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function currentMember(){
  const client=getClient();
  const {data:{session}}=await client.auth.getSession();
  if(!session?.user)return null;
  const {data,error}=await client.from('members').select('user_id,display_name,role,active,activated_at').eq('user_id',session.user.id).single();
  if(error||!data?.active||!data?.activated_at)return null;
  const authName=v(session.user.user_metadata?.display_name);
  return{user:session.user,...data,display_name:authName||data.display_name};
}
export async function signIn(email,password){const{error}=await getClient().auth.signInWithPassword({email:v(email),password:String(password??'')});if(error)throw new Error('E-mail ou senha inválidos.');return currentMember()}
export async function signOut(){await getClient().auth.signOut({scope:'local'})}
export async function requestPasswordReset(email,locationLike=globalThis.location){const address=v(email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw new Error('Informe um e-mail válido.');const{error}=await getClient().auth.resetPasswordForEmail(address,{redirectTo:inviteRedirectForLocation(locationLike)});if(error)throw new Error('Não foi possível enviar o e-mail de recuperação.');}
export async function updateOwnProfile(input){const display_name=v(input?.display_name),cargo=v(input?.cargo),telefone=v(input?.telefone);if(!display_name)throw new Error('Nome obrigatório.');const{error}=await getClient().auth.updateUser({data:{display_name,cargo,telefone}});if(error)throw new Error('Não foi possível atualizar o perfil.');return currentMember()}
export async function changeOwnPassword(password){const next=String(password??'');if(next.length<8)throw new Error('A nova senha deve ter pelo menos 8 caracteres.');const{error}=await getClient().auth.updateUser({password:next});if(error)throw new Error('Não foi possível alterar a senha.')}

export { normalizeNewUserInput };

export async function createUserInvite(input){return createUserWithClient(getClient(),input)}

export async function listSystems({includeInactive=false}={}){return documentRepository.getSystems({includeInactive})}
export async function saveSystem(){throw new Error('Sistemas são administrados pelo catálogo local desta V1. Importe um pacote documental atualizado.')}
export async function listActive(){return documentRepository.getAll()}
export async function listAdmin(){return documentRepository.getAll({includeInactive:true})}

export async function listMembers(){const{data,error}=await getClient().from('members').select('user_id,display_name,role,active,activated_at,created_at,updated_at').order('display_name');if(error)throw new Error('Não foi possível carregar os usuários.');return data||[]}
export async function updateMember(userId,input){const role=v(input?.role).toUpperCase();if(!['ADMIN','CONTROLLER','USER'].includes(role))throw new Error('Perfil de usuário inválido.');const display_name=v(input?.display_name);if(!display_name)throw new Error('Nome do usuário obrigatório.');const{data,error}=await getClient().from('members').update({display_name,role,active:input?.active===true}).eq('user_id',v(userId)).select('user_id,display_name,role,active,activated_at,created_at,updated_at').single();if(error||!data)throw new Error('Não foi possível atualizar o usuário.');return data}
export async function listDocumentHistory(documentId){
  const ref=v(documentId);
  let query=getClient().from('document_history').select('id,document_id,event_type,code,title,discipline,revision,file_path,active,recorded_at,recorded_by');
  if(UUID_RE.test(ref)){
    query=query.eq('document_id',ref);
  }else{
    const document=await documentRepository.getById(ref);
    const code=v(document?.code);
    if(!code)return[];
    query=query.eq('code',code);
  }
  const{data,error}=await query.order('recorded_at',{ascending:false});
  if(error)throw new Error('Não foi possível carregar o histórico do documento.');
  return data||[];
}
export async function listRecentDocumentHistory(limit=50){const safeLimit=Math.min(100,Math.max(1,Number(limit)||50));const{data,error}=await getClient().from('document_history').select('id,document_id,event_type,code,title,discipline,revision,file_path,active,recorded_at,recorded_by').order('recorded_at',{ascending:false}).limit(safeLimit);if(error)throw new Error('Não foi possível carregar a auditoria.');return data||[]}

export async function downloadPdf(){throw new Error('Download por nuvem foi removido. O PDF deve existir no armazenamento local do aplicativo.')}
export async function saveDocument(){throw new Error('Cadastro individual em nuvem foi removido. Atualize a documentação por pacote local.')}
