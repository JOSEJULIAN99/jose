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

router.post('/', attachActor, async (req, res, next) => {
    // ─────────────────────────────────────────────
    // POST /api/pedidos  (crear pedido)
    // ─────────────────────────────────────────────
      try {
        const { cliente, agencia, carrito, abono } = req.body || {};
        const actorId = req.actorId;
  
        if (!cliente?.tipo_doc || !cliente?.nro_doc || !cliente?.nombre_completo) {
          return sendError(res, 400, 'Faltan datos de cliente (tipo_doc, nro_doc, nombre_completo).');
        }
        if (!agencia?.agencia_tipo || !agencia?.dpto || !agencia?.prov || !agencia?.dist) {
          return sendError(res, 400, 'Faltan datos de agencia (agencia_tipo, dpto, prov, dist).');
        }
        if (!Array.isArray(carrito?.items) || carrito.items.length === 0) {
          return sendError(res, 400, 'El carrito está vacío.');
        }
  
        const destinoError = validarDestinoEntrada(agencia);
        if (destinoError) return sendError(res, 400, destinoError);
  
        const items = carrito.items.map((it) => ({
          id: it?.id ?? null,
          nombre: String(it?.nombre || '').trim(),
          cantidad: Math.max(1, parseInt(it?.cantidad, 10) || 1),
          precio_unitario: Number(it?.precio_unitario || 0),
          es_manual: !!it?.es_manual,
        }));
  
        if (items.some((x) => !x.nombre || x.cantidad < 1 || x.precio_unitario < 0)) {
          return sendError(res, 400, 'Items inválidos (nombre, cantidad>=1, precio_unitario>=0).');
        }
  
        const subtotal = items.reduce((a, x) => a + x.cantidad * x.precio_unitario, 0);
        const dTipo = String(carrito?.descuento?.tipo || 'monto').toLowerCase();
        const dVal = Number(carrito?.descuento?.valor || 0);
        const descMonto =
          dTipo === 'porc'
            ? Math.min(subtotal, Math.max(0, (subtotal * Math.min(100, Math.max(0, dVal))) / 100))
            : Math.min(subtotal, Math.max(0, dVal));
  
        const total = Number((subtotal - descMonto).toFixed(2));
        const abonoN = Math.max(0, Number(abono || 0));
        if (abonoN > total) return sendError(res, 400, 'El abono no puede ser mayor que el total.');
        const pendiente = Number((total - abonoN).toFixed(2));
  
        const cliRow = await findOrCreateCliente({
          tipo_doc: cliente.tipo_doc,
          nro_doc: cliente.nro_doc,
          nombre_completo: cliente.nombre_completo,
          telefono: cliente.telefono || null,
        });
  
        const { agencia_tipo, nom_agencia_o_direccion } = mapDestinoToDB(agencia);
  
        const { data: insPed, error: ePed } = await supabase
          .from('pedidos')
          .insert({
            cliente_id: cliRow.id,
            agencia_tipo,
            dpto: agencia.dpto,
            prov: agencia.prov,
            dist: agencia.dist,
            nom_agencia_o_direccion,
            total,
            descuento: Number(descMonto.toFixed(2)),
            abono: Number(abonoN.toFixed(2)),
            estado: 'REGISTRADO',
          })
          .select('id,total,abono')
          .maybeSingle();
        if (ePed) throw ePed;
  
        const pedido_id = insPed?.id;
        if (!pedido_id) return sendError(res, 500, 'No se pudo crear el pedido.');
  
        const detRows = items.map((x) => ({
          pedido_id,
          producto_id: x.id,
          nombre_item: x.nombre,
          cantidad: x.cantidad,
          precio_unitario: Number(x.precio_unitario.toFixed(2)),
          es_manual: x.es_manual,
          valido: true,
        }));
        const { error: eDet } = await supabase.from('pedido_detalles').insert(detRows);
        if (eDet) {
          await supabase.from('pedidos').update({ estado: 'ELIMINADO' }).eq('id', pedido_id);
          return sendError(res, 400, 'No se pudieron registrar los ítems: ' + eDet.message);
        }
  
        await addRegistroSafe(pedido_id, actorId, 'REGISTRADO', null);
  
        return res.status(201).json({
          ok: true,
          pedido_id,
          total: insPed.total,
          abono: insPed.abono,
          pendiente,
        });
      } catch (e) {
        next(e);
      }
});

export default router;
