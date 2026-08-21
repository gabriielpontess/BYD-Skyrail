# BYD Skyrail

Aplicação independente para consulta de documentação técnica em campo, com sincronização offline.

## Escopo V1
- autenticação Supabase;
- biblioteca de PDFs com código, título, disciplina e revisão;
- administração mínima por perfil ADMIN;
- download/sincronização offline;
- busca e filtro local;
- atualização de revisão por novo objeto de Storage.

## Backend
1. Criar projeto Supabase exclusivo.
2. Aplicar `supabase/migrations/20260821154420_initial_byd_skyrail_schema.sql`.
3. Criar o primeiro usuário em Auth.
4. Inserir esse `auth.users.id` em `public.members` com `role='ADMIN'`.
5. Preencher `config.js` com URL + publishable key do projeto.

O projeto Supabase standalone foi criado em `sa-east-1`, o schema inicial já foi aplicado e o primeiro ADMIN está provisionado. Nunca coloque `service_role`/secret key no frontend.

## Deploy
O projeto Netlify `byd-skyrail` está vinculado ao repositório `gabriielpontess/BYD-Skyrail`, com `main` como branch de produção. Mudanças do PR standalone devem ser validadas em Deploy Preview antes do merge e do smoke test final no tablet.
