import { Router } from 'express';
import { supabase } from '../../lib/supabase.js';
import { sendError, parseId } from './helpers.js';

const router = Router();

// ─────────────────────────────────────────────
// GET /api/pedidos/:id  → pedido + detalles + registros
// ─────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return sendError(res, 400, 'ID inválido');

    // Pedido principal con cliente vinculado
    const { data: pedido, error: ePed } = await supabase
      .from('pedidos')
      .select(`
        id,
        estado,
        agencia_tipo,
        nom_agencia_o_direccion,
        dpto,
        prov,
        dist,
        total,
        descuento,
        abono,
        creado_en,
        clientes:cliente_id(id,tipo_doc,nro_doc,nombre_completo,telefono)
      `)
      .eq('id', id)
      .maybeSingle();
    if (ePed) throw ePed;
    if (!pedido) return sendError(res, 404, 'Pedido no encontrado');

    // Detalles del pedido
    const { data: detalles, error: eDet } = await supabase
      .from('pedido_detalles')
      .select('id,producto_id,nombre_item,cantidad,precio_unitario,es_manual,valido')
      .eq('pedido_id', id)
      .order('id', { ascending: true });
    if (eDet) throw eDet;

    // Subtotal y pendiente calculados
    const subtotal = Number(
      (detalles || []).reduce((a, d) => a + Number(d.cantidad) * Number(d.precio_unitario), 0).toFixed(2)
    );
    const pendiente = Number((Number(pedido.total || 0) - Number(pedido.abono || 0)).toFixed(2));

    // Historial de registros
    const { data: regs } = await supabase
      .from('registros')
      .select('id,usuario_id,registro,mensaje,creado_en')
      .eq('pedido_id', id)
      .order('creado_en', { ascending: false });

    return res.json({
      ok: true,
      data: {
        pedido: { ...pedido, subtotal, pendiente },
        detalles: detalles || [],
        registros: regs || [],
      },
    });
  } catch (e) {
    next(e);
  }
});

export default router;
