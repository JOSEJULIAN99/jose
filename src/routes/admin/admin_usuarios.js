import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { requireAdmin } from '../../middleware/auth.js';

const router = Router();

// todas las rutas de aquí requieren ADMIN
router.use(requireAdmin());

function sendError(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

// GET /admin/usuarios
router.get('/', async (req, res, next) => {
  try {
    if (!supabase) {
      return sendError(res, 500, 'Supabase no inicializado');
    }

    const { data, error } = await supabase
      .from('usuarios')
      .select('id,usuario,rol,activo,creado_en,actualizado_en')
      .order('usuario');

    if (error) {
      return sendError(res, 400, error.message);
    }

    return res.json({
      ok: true,
      total: data?.length ?? 0,
      data: data ?? [],
    });
  } catch (e) {
    next(e);
  }
});

// POST /admin/usuarios
router.post('/', async (req, res, next) => {
  try {
    if (!supabase) {
      return sendError(res, 500, 'Supabase no inicializado');
    }

    const { usuario, clave_prov, rol, activo = true } = req.body || {};

    if (!usuario || !clave_prov || !rol) {
      return sendError(res, 400, 'usuario, clave_prov y rol son requeridos');
    }

    const username = String(usuario).toUpperCase().trim();
    const role = String(rol).toUpperCase().trim();

    // (opcional) comprobar si ya existe
    const { data: existing, error: errExisting } = await supabase
      .from('usuarios')
      .select('id')
      .eq('usuario', username)
      .maybeSingle();

    if (errExisting) {
      return sendError(res, 400, errExisting.message);
    }

    if (existing) {
      return sendError(res, 409, 'El usuario ya existe');
    }

    // ATENCIÓN:
    // aquí lo estás guardando en claro. Si quieres, aquí mismo lo puedes hashear.
    const payload = {
      usuario: username,
      clave_prov: String(clave_prov).trim(),
      rol: role,
      activo: !!activo,
    };

    const { data, error } = await supabase
      .from('usuarios')
      .insert(payload)
      .select('id,usuario,rol,activo')
      .single();

    if (error) {
      return sendError(res, 400, error.message);
    }

    return res.status(201).json({
      ok: true,
      data,
    });
  } catch (e) {
    next(e);
  }
});

// PATCH /admin/usuarios/:id
router.patch('/:id', async (req, res, next) => {
  try {
    if (!supabase) {
      return sendError(res, 500, 'Supabase no inicializado');
    }

    const { id } = req.params;
    const { clave_prov, rol, activo } = req.body || {};

    const upd = {};
    if (clave_prov !== undefined) {
      // igual: aquí puedes hashear
      upd.clave_prov = String(clave_prov);
    }
    if (rol !== undefined) {
      upd.rol = String(rol).toUpperCase();
    }
    if (activo !== undefined) {
      upd.activo = !!activo;
    }

    if (Object.keys(upd).length === 0) {
      return sendError(res, 400, 'No hay campos para actualizar');
    }

    const { data, error } = await supabase
      .from('usuarios')
      .update(upd)
      .eq('id', id)
      .select('id,usuario,rol,activo')
      .maybeSingle();

    if (error) {
      return sendError(res, 400, error.message);
    }

    if (!data) {
      return sendError(res, 404, 'Usuario no encontrado');
    }

    return res.json({
      ok: true,
      data,
    });
  } catch (e) {
    next(e);
  }
});

// DELETE /admin/usuarios/:id  (baja lógica)
router.delete('/:id', async (req, res, next) => {
  try {
    if (!supabase) {
      return sendError(res, 500, 'Supabase no inicializado');
    }

    const { id } = req.params;

    const { data, error } = await supabase
      .from('usuarios')
      .update({ activo: false })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      return sendError(res, 400, error.message);
    }

    if (!data) {
      return sendError(res, 404, 'Usuario no encontrado');
    }

    return res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
