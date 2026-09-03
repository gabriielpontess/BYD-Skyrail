const fold=value=>String(value??'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();

export const DOCUMENT_TYPE_BY_PREFIX={
  DE:'Desenho',
  LM:'Lista de materiais',
  LC:'Lista de cabos',
  EQ:'Esquema elétrico',
  DG:'Diagrama elétrico',
  ET:'Especificação Técnica',
  FT:'Formulário de Teste',
  MC:'Memorial de cálculo',
  MM:'Manual de manutenção',
  PF:'Plano de Inspeção e Teste em Fábrica',
  PN:'Procedimento de montagem',
  PV:'Procedimento de movimentação e armazenagem',
  PI:'Procedimento de Inspeção de Fábrica',
  PL:'Procedimento de Teste de Instalação',
  TR:'Plano de Treinamento',
  MD:'Memorial Descritivo',
  MO:'Manual de Operação',
  PT:'Procedimento de Teste',
  RT:'Relatório de Testes',
  EM:'Especificação de Materiais'
};

export function documentPrefix(code){return fold(code).split('-')[0]||''}
export function inferDocumentType(code){
  const prefix=documentPrefix(code);
  return DOCUMENT_TYPE_BY_PREFIX[prefix]||`${prefix||'—'} - Tipo não mapeado`;
}
export function effectiveDocumentType(doc){
  const current=String(doc?.document_type??doc?.documentType??'').trim();
  return !current||/^documento$/i.test(current)?inferDocumentType(doc?.code):current;
}
