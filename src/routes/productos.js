// C:\Users\Jose-Julian\Desktop\wombo\backend\src\routes\productos.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

function sendError(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

// Verificamos Supabase una sola vez
router.use((req, res, next) => {
  if (!supabase) return sendError(res, 500, 'Supabase no configurado');
  next();
});

/**
 * GET /api/productos
 * Query:
 *   - activos=true|false    (default: true)      -> filtra por columna real "activo"
 *   - favoritos=true|false  (default: true)      -> filtra por columna real "favorito"
 *   - categoria=Texto       (match exacto, case-insensitive, sin comodines)
 *   - q=texto               (búsqueda por nombre, contains, case-insensitive)
 *   - limit=100 (max 500)
 *   - offset=0
 *
 * Nota: sin orden explícito (se respeta el orden natural del backend).
 */
router.get('/', async (req, res, next) => {
  try {
    const activos   = String(req.query.activos   ?? 'true').toLowerCase() !== 'false';
    const favoritos = String(req.query.favoritos ?? 'true').toLowerCase() !== 'false';
    const qtext     = (req.query.q || '').toString().trim();
    const categoria = (req.query.categoria || '').toString().trim();

    const limit  = Math.min(parseInt(req.query.limit  || '100', 10), 500);
    const offset = Math.max(parseInt(req.query.offset || '0',   10), 0);

    let q = supabase
      .from('productos')
      .select('id,nombre,precio_base,imagen_url,favorito,categoria,activo')
      .range(offset, offset + limit - 1); // sin .order()

    if (activos)   q = q.eq('activo', true);
    if (favoritos) q = q.eq('favorito', true);
    if (categoria) q = q.ilike('categoria', categoria);   // igualdad case-insensitive
    if (qtext)     q = q.ilike('nombre', `%${qtext}%`);   // contains case-insensitive

    const { data, error } = await q;
    if (error) return sendError(res, 500, error.message);

    // Sin cache en dev para evitar 304 durante pruebas
    if (process.env.NODE_ENV !== 'production') {
      res.set('Cache-Control', 'no-store');
    }

    return res.json({ ok: true, total: data?.length ?? 0, data: data ?? [] });
  } catch (e) {
    next(e);
  }
});

export default router;
