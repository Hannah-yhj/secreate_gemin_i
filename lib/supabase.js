import { createClient } from "@supabase/supabase-js";

let client = null;

export function getServiceClient() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 설정되어 있지 않습니다.");
  }

  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export async function findSourceByHash(hash) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("sources")
    .select("*, products!sources_product_id_fkey(product_id, provider, product_name)")
    .eq("document_hash", hash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { products: product, ...source } = data;
  return { source, product: product || null };
}

export async function findProductsByProvider(provider) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("provider", provider);

  if (error) throw error;
  return data || [];
}

export async function findAliasesByProvider(provider) {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("product_aliases")
    .select("*")
    .eq("provider", provider);

  if (error) throw error;
  return data || [];
}

export async function insertNewCard(payload) {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("insert_new_card", { payload });
  if (error) throw error;
  return data;
}

export async function updateExistingCard(payload) {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("update_existing_card", { payload });
  if (error) throw error;
  return data;
}
