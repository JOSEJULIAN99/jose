  // C:\Users\Jose-Julian\Desktop\wombo\backend\src\routes\reportes.js
  import { Router } from 'express';
  import { supabase } from '../lib/supabase.js';

  const router = Router();

  function sendError(res, status, message) {
    return res.status(status).json({ ok: false, message });
  }

  router.use((req, res, next) => {
    if (!supabase) return sendError(res, 500, 'Supabase no configurado');
    next();
  });

  /* ============================================================================
    GET /api/reportes/todo
    Devuelve listado general de pedidos filtrable.
  ============================================================================ */
  router.get('/todo', async (req, res, next) => {
    try {
      const {
        estado,
        cliente,
        fecha_from,
        fecha_to,
        agencia_tipo,
        dpto,
        prov,
        dist,
        limit = '100',
        offset = '0',
      } = req.query;

      const lim = Math.min(parseInt(limit, 10) || 100, 200);
      const off = Math.max(parseInt(offset, 10) || 0, 0);

      let q = supabase
        .from('pedidos')
        .select(
          `
          id, estado, agencia_tipo, dpto, prov, dist, nom_agencia_o_direccion,
          total, descuento, abono, creado_en, cliente_id,
          clientes:cliente_id(nombre_completo, telefono)
          `
        )
        .order('creado_en', { ascending: false });

      // filtros
      if (estado && estado !== '(Todos)') q = q.eq('estado', estado.toUpperCase());
      if (agencia_tipo && agencia_tipo !== '(Todas)') q = q.eq('agencia_tipo', agencia_tipo.toUpperCase());
      if (dpto) q = q.eq('dpto', dpto.toUpperCase());
      if (prov) q = q.eq('prov', prov.toUpperCase());
      if (dist) q = q.eq('dist', dist.toUpperCase());

      if (fecha_from) {
        const fromIso = new Date(`${fecha_from}T00:00:00Z`).toISOString();
        q = q.gte('creado_en', fromIso);
      }
      if (fecha_to) {
        const toIso = new Date(`${fecha_to}T23:59:59Z`).toISOString();
        q = q.lte('creado_en', toIso);
      }

      const { data, error } = await q.range(off, off + lim - 1);
      if (error) return sendError(res, 400, error.message);

      let rows = Array.isArray(data) ? data : [];

      // filtro por cliente (en memoria)
      if (cliente && cliente.trim()) {
        const search = cliente.trim().toUpperCase();
        rows = rows.filter((r) =>
          (r.clientes?.nombre_completo || '').toUpperCase().includes(search)
        );
      }

      // calcular pendiente = total - abono
      rows = rows.map((r) => ({
        ...r,
        pendiente: Math.max(Number(r.total || 0) - Number(r.abono || 0), 0),
      }));

      return res.json({ ok: true, data: rows });
    } catch (e) {
      next(e);
    }
  });

  /* ============================================================================
    GET /api/reportes/kpis
    Devuelve estadísticas globales
  ============================================================================ */
  router.get('/kpis', async (req, res, next) => {
    try {
      const { data, error } = await supabase.from('pedidos').select('estado, abono');
      if (error) return sendError(res, 400, error.message);

      const counts = {
        REGISTRADO: 0,
        EMBALADO: 0,
        ENTREGADO: 0,
        CANCELADO: 0,
        ELIMINADO: 0,
      };
      let dinero_ingresado = 0;

      for (const r of data || []) {
        const est = (r.estado || '').toUpperCase();
        if (counts[est] !== undefined) counts[est]++;
        dinero_ingresado += Number(r.abono || 0);
      }

      return res.json({
        ok: true,
        data: {
          counts_by_estado: counts,
          pedidos_entregados: counts.ENTREGADO,
          pedidos_cancelados: counts.CANCELADO,
          dinero_ingresado,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  /* ============================================================================
     GET /api/reportes/tops
     Devuelve top productos, usuarios y departamentos (CON LÓGICA MEJORADA)
  ============================================================================ */
  router.get('/tops', async (req, res, next) => {
    try {
      const [detRes, pedRes, usrRes, regRes] = await Promise.all([
        supabase
          .from('pedido_detalles')
          .select('nombre_item,cantidad,precio_unitario,valido')
          .eq('valido', true), // <-- Esto ya excluía valido:false
        supabase
          .from('pedidos')
          .select('id, dpto, estado, total'), // <-- CORRECCIÓN: Añadido 'id'
        supabase.from('usuarios').select('id,usuario,rol'),
        supabase
          .from('registros')
          .select('usuario_id, registro, pedido_id'), // <-- CORRECCIÓN: Añadido 'pedido_id' y 'registro'
      ]);

      if (detRes.error) return sendError(res, 400, detRes.error.message);
      if (pedRes.error) return sendError(res, 400, pedRes.error.message);
      if (usrRes.error) return sendError(res, 400, usrRes.error.message);
      if (regRes.error) return sendError(res, 400, regRes.error.message);

      /* === 1) Productos más vendidos === */
      // NOTA: Tu consulta original '.eq('valido', true)' ya hacía esta optimización.
      // El bucle de abajo solo procesa productos que ya vienen filtrados desde la BD.
      const mapProd = new Map();
      for (const d of detRes.data || []) {
        const key = d.nombre_item?.trim() || 'SIN NOMBRE';
        const curr = mapProd.get(key) || {
          nombre_item: key,
          cantidad_total: 0,
          dinero_total: 0,
        };
        const cant = Number(d.cantidad || 0);
        const pu = Number(d.precio_unitario || 0);
        curr.cantidad_total += cant;
        curr.dinero_total += cant * pu;
        mapProd.set(key, curr);
      }
      const productos_mas_vendidos = Array.from(mapProd.values())
        .sort((a, b) => b.cantidad_total - a.cantidad_total)
        .slice(0, 10);

      /* === 2) Usuarios con más ventas (pedidos registrados, no eliminados) === */
      const usuariosPorId = new Map(
        (usrRes.data || []).map((u) => [u.id, { usuario: u.usuario, rol: u.rol }])
      );

      // Crea mapa de pedido_id → { total, estado }
      const pedidosPorId = new Map(
        (pedRes.data || []).map((p) => [
          p.id,
          {
            total: Number(p.total || 0),
            estado: (p.estado || '').toUpperCase(),
          },
        ])
      );

      const mapUser = new Map();
      for (const r of regRes.data || []) {
        // MEJORA 1: Solo contar si el registro es 'REGISTRADO'
        const tipoRegistro = (r.registro || '').toUpperCase();
        if (!r.usuario_id || tipoRegistro !== 'REGISTRADO') {
          continue;
        }

        const uInfo = usuariosPorId.get(r.usuario_id);
        const key = uInfo ? uInfo.usuario : r.usuario_id;

        // MEJORA 2: Verificar que el pedido no esté 'ELIMINADO'
        const pedidoInfo = pedidosPorId.get(r.pedido_id);
        const estadoPedido = pedidoInfo ? pedidoInfo.estado : 'ELIMINADO'; // Asumir eliminado si no se encuentra
        const monto = pedidoInfo ? pedidoInfo.total : 0;

        const curr = mapUser.get(key) || { usuario_crea: key, pedidos: 0, total: 0 };

        // Solo sumar si el pedido NO está eliminado
        if (estadoPedido !== 'ELIMINADO') {
          curr.pedidos++; // Contar el pedido registrado
          curr.total += monto; // Sumar el monto del pedido no eliminado
        }
        mapUser.set(key, curr);
      }

      const usuarios_mas_ventas = Array.from(mapUser.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      /* === 3) Departamentos con más envíos (que no estén eliminados) === */
      const mapDpto = new Map();
      for (const p of pedRes.data || []) {
        const est = (p.estado || '').toUpperCase();

        // MEJORA 3: Contar todos mientras no estén 'ELIMINADO'
        // (Antes solo contaba 'ENTREGADO' o 'EMBALADO')
        if (est !== 'ELIMINADO') {
          const d = (p.dpto || 'SIN DPTO').toUpperCase();
          mapDpto.set(d, (mapDpto.get(d) || 0) + 1);
        }
      }
      const departamentos_top = Array.from(mapDpto.entries())
        .map(([dpto, pedidos]) => ({ dpto, pedidos }))
        .sort((a, b) => b.pedidos - a.pedidos)
        .slice(0, 10);

      return res.json({
        ok: true,
        data: {
          productos_mas_vendidos,
          usuarios_mas_ventas,
          departamentos_top,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  export default router;
