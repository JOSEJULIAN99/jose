// C:\Users\Jose-Julian\Desktop\wombo\backend\src\routes\pedidos\eliminar.js
import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import {
  attachActor,
  sendError,
  parseId,
  getPedidoBasic,
  addRegistroSafe,
} from './helpers.js';

const router = Router();

// DELETE /api/pedidos/:id
router.delete('/:id', attachActor, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'ID inválido');

    const actorId = req.actorId;
    const motivo = (req.body?.motivo || '').trim();
    if (!motivo) return sendError(res, 400, 'Falta motivo de eliminación');

    const ped = await getPedidoBasic(id, 'id,estado');
    if (!ped) return sendError(res, 404, 'Pedido no encontrado');

    if (ped.estado !== 'REGISTRADO') {
      return sendError(res, 409, 'Solo pedidos REGISTRADOS se pueden eliminar en esta fase.');
    }

    const { error: eUpd } = await supabase
      .from('pedidos')
      .update({ estado: 'ELIMINADO' })
      .eq('id', id);

    if (eUpd) throw eUpd;

    await addRegistroSafe(id, actorId, 'ELIMINACION', motivo);
    res.json({ ok: true, pedido_id: id, estado: 'ELIMINADO' });
  } catch (e) {
    next(e);
  }
});

export default router;
