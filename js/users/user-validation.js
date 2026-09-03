const text=value=>String(value??'').trim();

export function normalizeNewUserInput(input){
  const display_name=text(input?.display_name);
  const email=text(input?.email).toLowerCase();
  const role=text(input?.role||'USER').toUpperCase();
  const active=input?.active===true;
  if(!display_name)throw new Error('Nome obrigatório.');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('E-mail inválido.');
  if(!['ADMIN','CONTROLLER','USER'].includes(role))throw new Error('Perfil de usuário inválido.');
  return{display_name,email,role,active};
}
