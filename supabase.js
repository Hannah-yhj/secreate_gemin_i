import { createClient } from "https://esm.sh/@supabase/supabase-js";

const supabase = createClient(
    "https://cnqonqbmvrfkhcncqopa.supabase.co",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucW9ucWJtdnJma2hjbmNxb3BhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MTk1MDcsImV4cCI6MjA5OTQ5NTUwN30.Y5RiaO7zopsdyGClGceuihLWE_M_ru8Fh92_bFiiITY"
);
// ui.js, app.js는 일반 스크립트라 import를 못 쓰므로,
// window 전역에 올려서 다른 스크립트에서도 바로 쓸 수 있게 함
window.supabase = supabase;