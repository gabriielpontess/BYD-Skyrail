# Regra de verificação antes de conclusão

Esta regra é obrigatória para o desenvolvimento do DocInspector/BYD Skyrail.

## Regra

Nenhuma funcionalidade, correção ou item de checklist pode ser marcado como **concluído**, **pronto**, **resolvido** ou **aprovado** apenas porque o código foi implementado ou porque o build compilou.

Antes de comunicar conclusão, deve existir evidência de teste compatível com o risco da mudança:

1. alteração de lógica: teste automatizado que exercite a lógica modificada;
2. alteração de interface: teste funcional da interação correspondente, além do build;
3. integração com Supabase/Auth/Edge Function: validar deploy/configuração e, quando houver credencial/ambiente de teste autorizado, executar o fluxo ponta a ponta;
4. responsividade/touch/viewer: validar em viewport/dispositivo representativo;
5. correção de defeito reportado: reproduzir o defeito e confirmar que o cenário deixa de falhar.

Se não for possível executar algum teste por falta de credencial, dispositivo ou ambiente, o item deve permanecer explicitamente **pendente de validação** e essa limitação deve ser informada. CI verde, deploy `ready` e presença do código são evidências necessárias em alguns casos, mas não substituem o teste funcional exigido.

## Critério de comunicação

- `Implementado`: código aplicado, ainda não necessariamente validado.
- `Teste automatizado aprovado`: suíte correspondente passou.
- `Teste funcional aprovado`: interação/fluxo executado e resultado esperado observado.
- `Concluído`: somente quando os testes aplicáveis acima estiverem aprovados.
