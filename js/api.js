import { getClient } from './client.js';
import { normalizeDocument, sortDocuments } from './model.js';

export const BUCKET = 'documents';
const COLS = 'id,code,title,discipline,revision,file_path,updated_at,active';
const v = value => String(value ?? '').trim();

export async function currentMember() {
  const client = getClient();
  const { data: { session } } = await client.auth.getSession();
  if (!session?.user) return null;
  const { data, error } = await client
    .from('members')
    .select('user_id,display_name,role,active')
    .eq('user_id', session.user.id)
    .single();
  if (error || !data?.active) return null;
  const authName = v(session.user.user_metadata?.display_name);
  return { user: session.user, ...data, display_name: authName || data.display_name };
}

export async function signIn(email, password) {
  const { error } = await getClient().auth.signInWithPassword({
    email: v(email),
    password: String(password ?? '')
  });
  if (error) throw new Error('E-mail ou senha inválidos.');
  return currentMember();
}

export async function signOut() {
  await getClient().auth.signOut({ scope: 'local' });
}

export async function updateOwnProfile(input) {
  const display_name = v(input?.display_name);
  const cargo = v(input?.cargo);
  const telefone = v(input?.telefone);
  if (!display_name) throw new Error('Nome obrigatório.');
  const client = getClient();
  const { error } = await client.auth.updateUser({
    data: { display_name, cargo, telefone }
  });
  if (error) throw new Error('Não foi possível atualizar o perfil.');
  return currentMember();
}

export async function changeOwnPassword(password) {
  const next = String(password ?? '');
  if (next.length < 8) throw new Error('A nova senha deve ter pelo menos 8 caracteres.');
  const { error } = await getClient().auth.updateUser({ password: next });
  if (error) throw new Error('Não foi possível alterar a senha.');
}

export async function listActive() {
  const { data, error } = await getClient()
    .from('documents')
    .select(COLS)
    .eq('active', true)
    .order('discipline')
    .order('code');
  if (error) throw new Error('Não foi possível carregar a biblioteca.');
  return sortDocuments((data || []).map(normalizeDocument).filter(Boolean));
}

export async function listAdmin() {
  const { data, error } = await getClient()
    .from('documents')
    .select(COLS)
    .order('discipline')
    .order('code');
  if (error) throw new Error('Não foi possível carregar a administração.');
  return sortDocuments((data || []).map(normalizeDocument).filter(Boolean));
}

export async function listMembers() {
  const { data, error } = await getClient()
    .from('members')
    .select('user_id,display_name,role,active,created_at,updated_at')
    .order('display_name');
  if (error) throw new Error('Não foi possível carregar os usuários.');
  return data || [];
}

export async function updateMember(userId, input) {
  const role = v(input?.role).toUpperCase();
  if (!['ADMIN', 'USER'].includes(role)) throw new Error('Perfil de usuário inválido.');
  const display_name = v(input?.display_name);
  if (!display_name) throw new Error('Nome do usuário obrigatório.');
  const { data, error } = await getClient()
    .from('members')
    .update({ display_name, role, active: input?.active === true })
    .eq('user_id', v(userId))
    .select('user_id,display_name,role,active,created_at,updated_at')
    .single();
  if (error || !data) throw new Error('Não foi possível atualizar o usuário.');
  return data;
}

export async function listDocumentHistory(documentId) {
  const { data, error } = await getClient()
    .from('document_history')
    .select('id,document_id,event_type,code,title,discipline,revision,file_path,active,recorded_at,recorded_by')
    .eq('document_id', v(documentId))
    .order('recorded_at', { ascending: false });
  if (error) throw new Error('Não foi possível carregar o histórico do documento.');
  return data || [];
}

export async function listRecentDocumentHistory(limit = 50) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const { data, error } = await getClient()
    .from('document_history')
    .select('id,document_id,event_type,code,title,discipline,revision,file_path,active,recorded_at,recorded_by')
    .order('recorded_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error('Não foi possível carregar a auditoria.');
  return data || [];
}

export async function downloadPdf(path) {
  const { data, error } = await getClient().storage.from(BUCKET).download(path);
  if (error || !(data instanceof Blob)) throw new Error('Não foi possível baixar o PDF.');
  return data;
}

function payload(input) {
  const p = {
    code: v(input.code),
    title: v(input.title),
    discipline: v(input.discipline),
    revision: v(input.revision),
    active: input.active !== false
  };
  for (const [key, value] of Object.entries(p)) {
    if (key !== 'active' && !value) throw new Error(`Campo ${key} obrigatório.`);
  }
  return p;
}

function pdf(file, required) {
  if (!file && !required) return null;
  if (!(file instanceof File) || file.size < 1 || !/\.pdf$/i.test(file.name)) {
    throw new Error('Selecione um PDF válido.');
  }
  return file;
}

async function upload(id, file) {
  const path = `${id}/${crypto.randomUUID()}.pdf`;
  const { error } = await getClient().storage.from(BUCKET).upload(path, file, {
    contentType: 'application/pdf',
    cacheControl: '0',
    upsert: false
  });
  if (error) throw new Error('Não foi possível enviar o PDF.');
  return path;
}

async function remove(path) {
  if (path) await getClient().storage.from(BUCKET).remove([path]).catch(() => {});
}

async function findByCode(code) {
  const { data, error } = await getClient()
    .from('documents')
    .select(COLS)
    .eq('code', v(code))
    .maybeSingle();
  if (error) throw new Error('Não foi possível verificar o código do documento.');
  return normalizeDocument(data);
}

export async function saveDocument(existing, input) {
  const p = payload(input);
  const current = existing || await findByCode(p.code);
  const file = pdf(input.file, !current);
  const id = current?.id || crypto.randomUUID();
  const oldPath = current?.file_path || '';
  const nextPath = file ? await upload(id, file) : oldPath;
  const client = getClient();
  let query;
  if (current) {
    query = client.from('documents').update({
      ...p,
      file_path: nextPath,
      updated_at: new Date().toISOString()
    }).eq('id', id);
  } else {
    query = client.from('documents').insert({
      id,
      ...p,
      file_path: nextPath,
      updated_at: new Date().toISOString()
    });
  }
  const { data, error } = await query.select(COLS).single();
  if (error || !data) {
    if (file) await remove(nextPath);
    throw new Error('Não foi possível salvar o documento.');
  }
  return normalizeDocument(data);
}
