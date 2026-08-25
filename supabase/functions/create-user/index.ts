import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

const APP_URL = "https://byd-skyrail.netlify.app";
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

  const adminClient = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } = await adminClient.auth.getUser(jwt);
  const caller = authData?.user;
  if (authError || !caller) return json(401, { error: "Sessão inválida." });

  const { data: callerMember, error: callerError } = await adminClient
    .from("members")
    .select("role,active")
    .eq("user_id", caller.id)
    .maybeSingle();

  if (callerError) return json(500, { error: "Não foi possível validar o administrador." });
  if (!callerMember?.active || callerMember.role !== "ADMIN") {
    return json(403, { error: "Apenas administradores ativos podem criar usuários." });
  }

  let payload: { display_name?: string; email?: string; role?: string; active?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Corpo da requisição inválido." });
  }

  const displayName = String(payload.display_name || "").trim();
  const email = String(payload.email || "").trim().toLowerCase();
  const role = String(payload.role || "USER").trim().toUpperCase();
  const active = payload.active === true;

  if (!displayName) return json(400, { error: "Nome obrigatório." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "E-mail inválido." });
  if (!["ADMIN", "CONTROLLER", "USER"].includes(role)) return json(400, { error: "Perfil inválido." });

  const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName },
    redirectTo: APP_URL
  });

  if (inviteError || !inviteData?.user) {
    const duplicate = /already|registered|exists|duplicate/i.test(inviteError?.message || "");
    return json(duplicate ? 409 : 400, {
      error: duplicate ? "Já existe um usuário com este e-mail." : "Não foi possível convidar o usuário."
    });
  }

  const userId = inviteData.user.id;
  const { data: member, error: memberError } = await adminClient
    .from("members")
    .upsert({
      user_id: userId,
      display_name: displayName,
      role,
      active
    }, { onConflict: "user_id" })
    .select("user_id,display_name,role,active,created_at,updated_at")
    .single();

  if (memberError || !member) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => {});
    return json(500, { error: "O convite foi revertido porque o perfil não pôde ser criado." });
  }

  return json(201, {
    user: member,
    invited_email: email,
    message: "Convite enviado e perfil criado com sucesso."
  });
});
