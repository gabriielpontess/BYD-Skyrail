import { normalizeNewUserInput } from './user-validation.js';

export async function createUserWithClient(client,input){
  const payload=normalizeNewUserInput(input);
  const {data,error}=await client.functions.invoke('create-user',{body:payload});
  if(data?.error)throw new Error(data.error);
  if(error||!data?.user)throw new Error('Não foi possível criar o usuário.');
  return data.user;
}
