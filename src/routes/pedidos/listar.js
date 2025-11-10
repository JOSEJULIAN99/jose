import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import {
  attachActor,
  sendError,
  validarDestinoEntrada,
  mapDestinoToDB,
  findOrCreateCliente,
  addRegistroSafe
} from './helpers.js';

const router = Router();

router.get('/', async (req, res, next) => {
  // ─────────────────────────────────────────────
  // GET /api/pedidos
  // ─────────────────────────────────────────────

    try {
      const estado = (req.query.estado || 'REGISTRADO').toString().toUpperCase();
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
      const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

      const { data, error } = await supabase
        .from('pedidos')
        .select(
          'id,estado,agencia_tipo,nom_agencia_o_direccion,dpto,prov,dist,total,abono,creado_en,clientes:cliente_id(nombre_completo,telefono)'
        )
        .eq('estado', estado)
        .order('creado_en', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;

      const rows = (data || []).map((r) => ({
        ...r,
        pendiente: Number((Number(r.total || 0) - Number(r.abono || 0)).toFixed(2)),
      }));

      return res.json({ ok: true, total: rows.length, data: rows });
    } catch (e) {
      next(e);
    }
  });


export default router;
