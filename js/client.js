import '../config.js';
import { createClient } from '@supabase/supabase-js';

let client;
export function getClient(){
  if(client)return client;
  const cfg=globalThis.BYD_SKYRAIL_CONFIG||{};
  if(!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw new Error('BYD Skyrail ainda não foi conectado ao backend independente.');
  client=createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  return client;
}
