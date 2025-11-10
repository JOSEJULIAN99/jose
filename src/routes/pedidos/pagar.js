import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import {
  attachActor,
  sendError,
  validarDestinoEntrada,
  mapDestinoToDB,
  findOrCreateCliente,
  addRegistroSafe,
  parseId
} from './helpers.js';

const router = Router();

router.post('/:id/pagar', attachActor, async (req, res, next) => { // 🎯 La ruta debe incluir el ID // ─────────────────────────────────────────────
  // POST /api/pedidos/:id/pagar
  // ─────────────────────────────────────────────
    try {
        const id = parseId(req.params.id); // 👈 Captura el ID correctamente
        if (!id) return sendError(res, 400, 'ID inválido');
        
        const actorId = req.actorId;
        const { monto, motivo } = req.body || {};

      const pago = Number(monto);
      if (!Number.isFinite(pago) || pago < 0) {
        return sendError(res, 400, 'Monto inválido');
      }

      const { data: ped, error: eGet } = await supabase
        .from('pedidos')
        .select('total,abono,estado')
        .eq('id', id)
        .maybeSingle();
      if (eGet) throw eGet;
      if (!ped) return sendError(res, 404, 'Pedido no encontrado');
      if (ped.estado !== 'EMBALADO') {
        return sendError(res, 409, 'Solo pedidos EMBALADOS pueden marcarse como ENTREGADO.');
      }

      const pendiente = Number((Number(ped.total || 0) - Number(ped.abono || 0)).toFixed(2));
      if (Math.abs(pago - pendiente) > 0.009 && !motivo) {
        return sendError(res, 400, 'El monto difiere del pendiente. Indique un motivo.');
      }

      const nuevoAbono = Number((Number(ped.abono || 0) + pago).toFixed(2));

      const { error: eUpd } = await supabase
        .from('pedidos')
        .update({ abono: nuevoAbono, estado: 'ENTREGADO' })
        .eq('id', id);
      if (eUpd) throw eUpd;

      await addRegistroSafe(id, actorId, 'ENTREGADO', motivo ? String(motivo).trim() : null);

      return res.json({
        ok: true,
        pedido_id: id,
        estado: 'ENTREGADO',
        abono: nuevoAbono,
        pendiente: 0,
      });
    } catch (e) {
      next(e);
    }
  });

  export default router;
