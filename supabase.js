import { createClient } from "https://esm.sh/@supabase/supabase-js";

const supabase = createClient(
    "여기에 Project URL",
    "여기에 anon public key"
);

export default supabase;