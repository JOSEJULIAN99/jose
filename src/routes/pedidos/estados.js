import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import {
  attachActor,
  sendError,
  addRegistroSafe,
  getPedidoBasic,
  parseId, // ✅ falta importar
} from './helpers.js';

const router = Router();

// ─────────────────────────────────────────────
// POST /api/pedidos/:id/embalar
// ─────────────────────────────────────────────
router.post('/:id/embalar', attachActor, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'ID inválido');

    const actorId = req.actorId;

    const ped = await getPedidoBasic(id, 'id,estado');
    if (!ped) return sendError(res, 404, 'Pedido no encontrado');
    if (ped.estado !== 'REGISTRADO') {
      return sendError(res, 409, 'Solo pedidos REGISTRADOS pueden pasar a EMBALADO.');
    }

    const { error: eUpd } = await supabase
      .from('pedidos')
      .update({ estado: 'EMBALADO' })
      .eq('id', id);
    if (eUpd) throw eUpd;

    await addRegistroSafe(id, actorId, 'EMBALADO', null);
    return res.json({ ok: true, pedido_id: id, estado: 'EMBALADO' });
  } catch (e) {
    next(e);
  }
});

// ─────────────────────────────────────────────
// POST /api/pedidos/:id/regresar
// ─────────────────────────────────────────────
router.post('/:id/regresar', attachActor, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'ID inválido');

    const actorId = req.actorId;
    const { motivo } = req.body || {};
    if (!motivo || !String(motivo).trim())
      return sendError(res, 400, 'Falta motivo de regreso');

    const ped = await getPedidoBasic(id, 'id,estado');
    if (!ped) return sendError(res, 404, 'Pedido no encontrado');
    if (ped.estado !== 'EMBALADO') {
      return sendError(res, 409, 'Solo pedidos EMBALADOS pueden regresar a REGISTRADO.');
    }

    const { error: eUpd } = await supabase
      .from('pedidos')
      .update({ estado: 'REGISTRADO' })
      .eq('id', id);
    if (eUpd) throw eUpd;

    await addRegistroSafe(id, actorId, 'REGRESO A EMBALAR', String(motivo).trim());
    return res.json({ ok: true, pedido_id: id, estado: 'REGISTRADO' });
  } catch (e) {
    next(e);
  }
});

// ─────────────────────────────────────────────
// POST /api/pedidos/:id/cancelar
// ─────────────────────────────────────────────
router.post('/:id/cancelar', attachActor, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'ID inválido');

    const actorId = req.actorId;
    const { motivo } = req.body || {};
    if (!motivo || !String(motivo).trim())
      return sendError(res, 400, 'Falta motivo de cancelación');

    const ped = await getPedidoBasic(id, 'id,estado');
    if (!ped) return sendError(res, 404, 'Pedido no encontrado');
    if (ped.estado !== 'EMBALADO') {
      return sendError(res, 409, 'Solo pedidos EMBALADOS pueden cancelarse en esta fase.');
    }

    const { error: eUpd } = await supabase
      .from('pedidos')
      .update({ estado: 'CANCELADO' })
      .eq('id', id);
    if (eUpd) throw eUpd;

    await addRegistroSafe(id, actorId, 'CANCELACION', String(motivo).trim());
    return res.json({ ok: true, pedido_id: id, estado: 'CANCELADO' });
  } catch (e) {
    next(e);
  }
});

export default router;
