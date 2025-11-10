// //backend/src/routes/pedidos/modificar.js
import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import {
  attachActor,
  sendError,
  validarDestinoEntrada,
  mapDestinoToDB,
  findOrCreateCliente,
  addRegistroSafe,
  getPedidoBasic,
  parseId,
} from './helpers.js';

const router = Router();


router.patch('/:id', attachActor, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'ID inválido');

    const actorId = req.actorId;
    const { cliente, agencia, pedido, abono, motivo } = req.body || {};
    if (!motivo?.trim()) return sendError(res, 400, 'Falta motivo de cambio');

    const pedActual = await getPedidoBasic(
      id,
      'id,estado,cliente_id,total,abono'
    );
    if (!pedActual) return sendError(res, 404, 'Pedido no encontrado');
    if (pedActual.estado !== 'REGISTRADO')
      return sendError(res, 409, 'Solo pedidos REGISTRADOS pueden editarse.');

    // === 1. CLIENTE ===
    let nuevoClienteId = pedActual.cliente_id;
    if (cliente) {
      const tipo_doc = String(cliente.tipo_doc || '').toUpperCase();
      const nro_doc = String(cliente.nro_doc || '').trim();
      if (!tipo_doc || !nro_doc)
        return sendError(res, 400, 'Faltan tipo_doc o nro_doc');

      const { data: cliAct } = await supabase
        .from('clientes')
        .select('id,tipo_doc,nro_doc')
        .eq('id', pedActual.cliente_id)
        .maybeSingle();

      const docCambiado =
        !cliAct ||
        cliAct.tipo_doc !== tipo_doc ||
        cliAct.nro_doc !== nro_doc;

      if (docCambiado) {
        const cliRes = await findOrCreateCliente({
          tipo_doc,
          nro_doc,
          nombre_completo: cliente.nombre_completo,
          telefono: cliente.telefono,
        });
        nuevoClienteId = cliRes.id;
      }
    }

    // === 2. AGENCIA / DESTINO ===
    const updPedido = {};
    if (nuevoClienteId !== pedActual.cliente_id)
      updPedido.cliente_id = nuevoClienteId;

    if (agencia) {
      const atIn = agencia.agencia_tipo
        ? String(agencia.agencia_tipo).toUpperCase()
        : undefined;
      const errEntrada = atIn
        ? validarDestinoEntrada({ ...agencia, agencia_tipo: atIn })
        : null;
      if (errEntrada) return sendError(res, 400, errEntrada);

      const map = mapDestinoToDB({ ...agencia, agencia_tipo: atIn });
      Object.assign(updPedido, map);

      if ('dpto' in agencia) updPedido.dpto = agencia.dpto;
      if ('prov' in agencia) updPedido.prov = agencia.prov;
      if ('dist' in agencia) updPedido.dist = agencia.dist;
    }

    // === 3. DETALLES ===
    if (pedido?.items && Array.isArray(pedido.items)) {
      // Obtener actuales (DEBE OBTENER TODOS, válidos e inválidos, para la lógica de reactivación/invalidación)
      const { data: actuales, error: eSel } = await supabase
        .from('pedido_detalles')
        .select('id, producto_id, nombre_item, cantidad, precio_unitario, valido')
        .eq('pedido_id', id);
      if (eSel) throw eSel;

      const idsActuales = new Set(actuales.map((x) => x.id));
      const idsMantener = new Set();

      for (const item of pedido.items) {
        const match = actuales.find(
          (d) =>
            (d.producto_id && d.producto_id === item.id) ||
            (!d.producto_id && d.nombre_item.trim() === item.nombre.trim())
        );

        if (match) {
          // Actualiza si cambió cantidad/precio y reactiva si estaba inválido
          const { error: eUpdDet } = await supabase
            .from('pedido_detalles')
            .update({
              cantidad: Number(item.cantidad) || 1,
              precio_unitario: Number(item.precio_unitario) || 0,
              valido: true, // 🎯 Fuerza a TRUE si se está modificando/reactivando
            })
            .eq('id', match.id);
          if (eUpdDet) throw eUpdDet; // 🎯 Manejo de errores en UPDATE
          idsMantener.add(match.id);
        } else {
          // Inserta nuevo
          const { error: eInsDet } = await supabase.from('pedido_detalles').insert({
            pedido_id: id,
            producto_id: item.id ?? null,
            nombre_item: item.nombre.trim(),
            cantidad: Number(item.cantidad) || 1,
            precio_unitario: Number(item.precio_unitario) || 0,
            es_manual: !!item.es_manual,
            valido: true,
          });
          if (eInsDet) throw eInsDet; // 🎯 Manejo de errores en INSERT
        }
      }

      // Invalida los que fueron quitados
      const idsAInvalidar = [...idsActuales].filter(
        (idDet) => !idsMantener.has(idDet)
      );
      if (idsAInvalidar.length > 0) {
        const { error: eInvDet } = await supabase // 🎯 Manejo de errores en INVALIDACIÓN
          .from('pedido_detalles')
          .update({ valido: false })
          .in('id', idsAInvalidar);
        if (eInvDet) throw eInvDet; 
      }

      // Recalcular total
      const subtotal = pedido.items.reduce(
        (a, d) => a + d.cantidad * d.precio_unitario,
        0
      );
      const desc =
        pedido.descuento?.tipo === 'porc'
          ? (subtotal * (Number(pedido.descuento.valor) || 0)) / 100
          : Number(pedido.descuento?.valor || 0);
      updPedido.total = subtotal - desc;
    }

    // === 4. ABONO ===
    if (typeof abono === 'number' && abono >= 0) updPedido.abono = abono;

    // === 5. Guardar cambios ===
    if (Object.keys(updPedido).length > 0) {
      const { error: eUpdPed } = await supabase
        .from('pedidos')
        .update(updPedido)
        .eq('id', id);
      if (eUpdPed) throw eUpdPed;
    }

    await addRegistroSafe(id, actorId, 'MODIFICACION', motivo.trim());

    return res.json({
      ok: true,
      pedido_id: id,
      cliente_id: nuevoClienteId,
      total_actualizado: updPedido.total,
    });
  } catch (e) {
    console.error('Error PATCH pedido:', e);
    next(e);
  }
});

export default router;