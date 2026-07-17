import { findProductsByProvider, findAliasesByProvider } from "./supabase.js";

function normalize(str) {
  return (str || "")
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[.,:;·・\-_/\\()[\]{}'"!?]/g, "")
    .toLowerCase();
}

export async function resolveProduct({ provider, product_name }) {
  const normProvider = normalize(provider);
  const normName = normalize(product_name);

  const products = await findProductsByProvider(provider);
  const directMatch = products.find(
    p => normalize(p.provider) === normProvider && normalize(p.product_name) === normName
  );
  if (directMatch) {
    return { status: "existing", product_id: directMatch.product_id, matchedVia: "products" };
  }

  const aliases = await findAliasesByProvider(provider);
  const aliasMatch = aliases.find(
    a => normalize(a.provider) === normProvider && normalize(a.alias) === normName
  );
  if (aliasMatch) {
    return { status: "existing", product_id: aliasMatch.product_id, matchedVia: "product_aliases" };
  }

  return { status: "new", product_id: null, matchedVia: null };
}
