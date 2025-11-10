import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { requireAdmin } from '../../middleware/auth.js';

const router = Router();

// middleware de router: TODO aquí es admin SIEMPRE
router.use(requireAdmin());

// helper simple para errores de supabase
function handleSupabaseError(res, error) {
  return res.status(400).json({
    ok: false,
    message: error.message ?? 'Error en Supabase',
  });
}

// GET /admin/agencias?dpto=&prov=&dist=&nombre=
router.get('/', async (req, res, next) => {
  try {
    if (!supabase) {
      return res.status(500).json({ ok: false, message: 'Supabase no inicializado' });
    }

    const { dpto, prov, dist, nombre } = req.query;

    let q = supabase
      .from('agencias_shalom')
      .select('id,nombre_agencia,dpto,prov,dist,direccion,referencia,telefono', { count: 'exact' })
      .order('nombre_agencia');

    // normalizamos a mayúsculas o usamos ilike con %
    if (dpto) q = q.ilike('dpto', dpto);              // o .eq('dpto', dpto.toUpperCase())
    if (prov) q = q.ilike('prov', prov);
    if (dist) q = q.ilike('dist', dist);
    if (nombre) q = q.ilike('nombre_agencia', `%${nombre}%`);

    const { data, error } = await q.limit(500);

    if (error) return handleSupabaseError(res, error);

    return res.json({
      ok: true,
      total: data?.length ?? 0,
      data: data ?? [],
    });
  } catch (e) {
    next(e);
  }
});

// POST /admin/agencias
router.post('/', async (req, res, next) => {
  try {
    if (!supabase) {
      return res.status(500).json({ ok: false, message: 'Supabase no inicializado' });
    }

    const {
      nombre_agencia,
      dpto,
      prov,
      dist,
      direccion = null,
      referencia = null,
      telefono = null,
    } = req.body || {};

    if (!nombre_agencia || !dpto || !prov || !dist) {
      return res.status(400).json({
        ok: false,
        message: 'Campos requeridos: nombre_agencia, dpto, prov, dist',
      });
    }

    const insertPayload = {
      nombre_agencia,
      dpto,
      prov,
      dist,
      direccion,
      referencia,
      telefono,
    };

    const { data, error } = await supabase
      .from('agencias_shalom')
      .insert(insertPayload)
      .select('id,nombre_agencia,dpto,prov,dist,direccion,referencia,telefono')
      .single(); // mejor que maybeSingle para insert

    if (error) return handleSupabaseError(res, error);

    return res.status(201).json({
      ok: true,
      data,
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /admin/agencias/:id
router.patch('/:id', async (req, res, next) => {
  try {
    if (!supabase) {
      return res.status(500).json({ ok: false, message: 'Supabase no inicializado' });
    }

    const { id } = req.params;
    const {
      nombre_agencia,
      dpto,
      prov,
      dist,
      direccion,
      referencia,
      telefono,
    } = req.body || {};

    const upd = {};
    if (nombre_agencia !== undefined) upd.nombre_agencia = nombre_agencia;
    if (dpto !== undefined) upd.dpto = dpto;
    if (prov !== undefined) upd.prov = prov;
    if (dist !== undefined) upd.dist = dist;
    if (direccion !== undefined) upd.direccion = direccion;
    if (referencia !== undefined) upd.referencia = referencia;
    if (telefono !== undefined) upd.telefono = telefono;

    // nada que actualizar
    if (Object.keys(upd).length === 0) {
      return res.status(400).json({ ok: false, message: 'No hay campos para actualizar' });
    }

    const { data, error } = await supabase
      .from('agencias_shalom')
      .update(upd)
      .eq('id', id)
      .select('id')
      .single();

    if (error) return handleSupabaseError(res, error);

    return res.json({ ok: true, id: data.id });
  } catch (e) {
    next(e);
  }
});

// DELETE /admin/agencias/:id
router.delete('/:id', async (req, res, next) => {
  try {
    if (!supabase) {
      return res.status(500).json({ ok: false, message: 'Supabase no inicializado' });
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from('agencias_shalom')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) return handleSupabaseError(res, error);

    if (!data) {
      return res.status(404).json({ ok: false, message: 'Agencia no encontrada' });
    }

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;

