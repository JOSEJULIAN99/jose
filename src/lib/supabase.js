// C:\Users\Jose-Julian\Desktop\wombo\backend\src\lib\supabase.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;       // <- preferido
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE; // <- respaldo / admin

if (!SUPABASE_URL) {
  throw new Error('[SUPABASE] Falta la variable SUPABASE_URL');
}

// 1. elegimos la key principal (preferir ANON)
const MAIN_KEY = SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE;

if (!MAIN_KEY) {
  throw new Error('[SUPABASE] Falta SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE en .env');
}

// 2. cliente “normal” (todas las rutas comunes usan este)
//    si es ANON → seguridad limitada (lo normal)
//    si no había ANON → cae en service pero solo porque no había otra
export const supabase = createClient(SUPABASE_URL, MAIN_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: { schema: 'public' },
});

// 3. cliente “admin” SOLO si tenemos service_role
//    esto lo usas en rutas tipo /api/admin/*
export const supabaseAdmin = SUPABASE_SERVICE_ROLE
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      db: { schema: 'public' },
    })
  : null;

// (opcional) logs para depurar
if (process.env.NODE_ENV !== 'production') {
  console.log('[SUPABASE] URL =', SUPABASE_URL);
  console.log('[SUPABASE] ANON (5) =', SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.slice(0, 5) : 'NO');
  console.log('[SUPABASE] SERVICE (5) =', SUPABASE_SERVICE_ROLE ? SUPABASE_SERVICE_ROLE.slice(0, 5) : 'NO');
  console.log('[SUPABASE] Cliente creado con key que empieza en:', MAIN_KEY.slice(0, 10));
}
