import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {

    const { data: products, error: pErr } =
      await supabase.from("products").select("*");

    const { data: benefits, error: bErr } =
      await supabase.from("benefits").select("*");

    const { data: rules, error: rErr } =
      await supabase.from("rules").select("*");

    const { data: sources, error: sErr } =
      await supabase.from("sources").select("*");

    if (pErr || bErr || rErr || sErr) {
      throw pErr || bErr || rErr || sErr;
    }

    res.status(200).json({
      products,
      benefits,
      rules,
      sources
    });

  } catch (error) {

    res.status(500).json({
      error: error.message
    });

  }
}