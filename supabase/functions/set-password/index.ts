import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Método não permitido." });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = req.headers.get("Authorization") || "";
  const jwt = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!url || !serviceRole) return json(500, { error: "Configuração server-side indisponível." });
  if (!jwt) return json(401, { error: "Sessão obrigatória." });

  let payload: { password?: string };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Corpo da requisição inválido." });
  }

  const password = String(payload.password || "");
  if (password.length < 8) return json(400, { error: "A senha deve ter pelo menos 8 caracteres." });
  if (password.length > 128) return json(400, { error: "A senha deve ter no máximo 128 caracteres." });

  const adminClient = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } = await adminClient.auth.getUser(jwt);
  const user = authData?.user;
  if (authError || !user) return json(401, { error: "Sessão inválida." });

  const { data: member, error: memberError } = await adminClient
    .from("members")
    .select("user_id,active,activated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) return json(500, { error: "Não foi possível validar o acesso." });
  if (!member?.active) return json(403, { error: "Usuário sem acesso ativo." });

  const wasPending = !member.activated_at;
  const { error: passwordError } = await adminClient.auth.admin.updateUserById(user.id, { password });
  if (passwordError) return json(400, { error: "Não foi possível definir a senha." });

  const activatedAt = member.activated_at || new Date().toISOString();
  const { data: updatedMember, error: activationError } = await adminClient
    .from("members")
    .update({ activated_at: activatedAt })
    .eq("user_id", user.id)
    .select("user_id,active,activated_at")
    .single();

  if (activationError || !updatedMember) {
    return json(500, {
      error: "A senha foi atualizada, mas não foi possível concluir a ativação. Entre novamente e tente concluir o acesso."
    });
  }

  console.log(JSON.stringify({
    event: "set-password",
    user_id: user.id,
    activation_completed: wasPending
  }));

  return json(200, {
    activated_at: updatedMember.activated_at,
    activation_completed: wasPending,
    message: wasPending ? "Acesso ativado com sucesso." : "Senha atualizada com sucesso."
  });
});
