// C:\Users\Jose-Julian\Desktop\wombo\backend\src\routes\catalogo.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

function sendError(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

function parseLimit(queryLimit, max) {
  const n = Number(queryLimit);
  if (!Number.isFinite(n) || n <= 0) return max;
  return Math.min(n, max);
}

const up = (v) => String(v ?? '').trim().toUpperCase();
// Utilidad para búsquedas "contiene"
const like = (v) => `%${up(v)}%`;

function setCache(res) {
  if (process.env.NODE_ENV === 'production') {
    res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
  } else {
    res.set('Cache-Control', 'no-store');
  }
}

// GET /api/catalogo/peru-dptos
router.get('/peru-dptos', async (req, res, next) => {
  try {
    if (!supabase) return sendError(res, 500, 'Supabase no configurado');

    // Llama a la función SQL 'get_distinct_dptos'
    const { data, error } = await supabase.rpc('get_distinct_dptos');
    if (error) return sendError(res, 500, error.message);

    setCache(res);
    // Mapeamos para que sea un array de strings: ['LIMA', 'AREQUIPA', ...]
    const dptos = data ? data.map((item) => item.dpto) : [];
    return res.json({ ok: true, total: dptos.length, data: dptos });
  } catch (e) {
    next(e);
  }
});

// GET /api/catalogo/peru-provs
router.get('/peru-provs', async (req, res, next) => {
  try {
    if (!supabase) return sendError(res, 500, 'Supabase no configurado');
    const { dpto } = req.query;
    if (!dpto) return sendError(res, 400, 'El parámetro "dpto" es requerido.');

    // Llama a la función SQL 'get_distinct_provs'
    const { data, error } = await supabase.rpc('get_distinct_provs', {
      dpto_filter: up(dpto),
    });
    if (error) return sendError(res, 500, error.message);

    const provs = data ? data.map((item) => item.prov) : [];
    return res.json({ ok: true, total: provs.length, data: provs });
  } catch (e) {
    next(e);
  }
});

// GET /api/catalogo/peru-dists
router.get('/peru-dists', async (req, res, next) => {
  try {
    if (!supabase) return sendError(res, 500, 'Supabase no configurado');
    const { dpto, prov } = req.query;
    if (!dpto) return sendError(res, 400, 'El parámetro "dpto" es requerido.');
    if (!prov) return sendError(res, 400, 'El parámetro "prov" es requerido.');

    // Llama a la función SQL 'get_distinct_dists'
    const { data, error } = await supabase.rpc('get_distinct_dists', {
      dpto_filter: up(dpto),
      prov_filter: up(prov),
    });
    if (error) return sendError(res, 500, error.message);

    const dists = data ? data.map((item) => item.dist) : [];
    return res.json({ ok: true, total: dists.length, data: dists });
  } catch (e) {
    next(e);
  }
});


// GET /api/catalogo/agencias-shalom
// Tabla: agencias_shalom(id uuid, nombre_agencia text, direccion text,
//                        dpto text, prov text, dist text, referencia text)
router.get('/agencias-shalom', async (req, res, next) => {
  try {
    if (!supabase) return sendError(res, 500, 'Supabase no configurado');

    const { dpto, prov, dist, nombre, limit } = req.query;
    const finalLimit = parseLimit(limit, 200);

    let q = supabase
      .from('agencias_shalom')
      .select('id,nombre_agencia,direccion,dpto,prov,dist,referencia')
      .order('nombre_agencia', { ascending: true });

    // Búsqueda por "contiene" (case-insensitive) en dpto/prov/dist/nombre_agencia
    if (dpto) q = q.ilike('dpto', like(dpto));
    if (prov) q = q.ilike('prov', like(prov));
    if (dist) q = q.ilike('dist', like(dist));
    if (nombre) q = q.ilike('nombre_agencia', like(nombre));

    const { data, error } = await q.limit(finalLimit);
    if (error) return sendError(res, 500, error.message);

    setCache(res);
    return res.json({ ok: true, total: data?.length ?? 0, data: data ?? [] });
  } catch (e) {
    next(e);
  }
});

export default router;
