/* =====================================================================
   supabase-config.js  –  Dazu Beauty Shop
   Supabase client initialization
   ===================================================================== */

'use strict';

// ====================================================================
// CONFIGURACION DE SUPABASE
// Reemplaza estos valores con los de tu proyecto de Supabase.
// Los encontras en: Supabase Dashboard > Settings > API
// ====================================================================
const SUPABASE_URL  = 'TU_SUPABASE_URL';
const SUPABASE_KEY  = 'TU_SUPABASE_ANON_KEY';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
