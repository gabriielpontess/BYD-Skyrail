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
2. Aplicar `supabase/migrations/0001_initial.sql`.
3. Criar o primeiro usuário em Auth.
4. Inserir esse `auth.users.id` em `public.members` com `role='ADMIN'`.
5. Copiar `config.example.js` para `config.js` e preencher URL + publishable key.

Nunca coloque service_role/secret key no frontend.
