// helpers.js
import { supabase } from '../../lib/supabase.js';

export function sendError(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

export function parseId(param) {
  const n = Number(param);
  return Number.isFinite(n) ? n : null;
}

export function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v || ''));
}

export async function addRegistroSafe(pedido_id, usuario_id, registro, mensaje = null) {
  try {
    const row = { pedido_id, usuario_id: usuario_id || null, registro, mensaje };
    const { error } = await supabase.from('registros').insert(row);
    if (error) throw error;
  } catch (e) {
    console.warn('[registros.insert]', e?.message || e);
  }
}

export async function findUsuarioIdByHandle(handle) {
  const h = String(handle || '').trim();
  if (!h) return null;

  if (isUuid(h)) {
    const { data, error } = await supabase.from('usuarios').select('id').eq('id', h).maybeSingle();
    if (!error && data?.id) return data.id;
  }

  const { data, error } = await supabase.from('usuarios').select('id').eq('usuario', h).maybeSingle();
  if (!error && data?.id) return data.id;
  return null;
}

export async function attachActor(req, res, next) {
  try {
    let usuario_id = req.body?.usuario_id || req.headers['x-usuario-id'] || null;
    const usuarioHandle = req.body?.usuario || req.body?.usuario_crea || req.headers['x-usuario'] || null;

    if (usuario_id && !isUuid(usuario_id)) return sendError(res, 400, 'usuario_id no es un UUID válido.');

    if (!usuario_id) {
      if (!usuarioHandle) return sendError(res, 400, 'Falta usuario.');
      const resolved = await findUsuarioIdByHandle(usuarioHandle);
      if (!resolved) return sendError(res, 400, 'No se pudo resolver usuario_id.');
      usuario_id = resolved;
    } else {
      const { data, error } = await supabase.from('usuarios').select('id').eq('id', usuario_id).maybeSingle();
      if (error || !data?.id) return sendError(res, 400, 'usuario_id no existe.');
    }

    req.actorId = usuario_id;
    next();
  } catch (e) {
    next(e);
  }
}

export async function getPedidoBasic(id, columns = 'id,estado,cliente_id') {
  const { data, error } = await supabase.from('pedidos').select(columns).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function findOrCreateCliente(cli) {
  const tipo_doc = String(cli.tipo_doc || '').trim().toUpperCase();
  const nro_doc = String(cli.nro_doc || '').trim();
  const nombre_completo = String(cli.nombre_completo || '').trim();
  const telefono = cli.telefono ? String(cli.telefono).trim() : null;

  if (!tipo_doc || !nro_doc || !nombre_completo) throw new Error('Datos de cliente incompletos.');

  const { data: existing, error: e1 } = await supabase
    .from('clientes')
    .select('id,nombre_completo,telefono')
    .eq('tipo_doc', tipo_doc)
    .eq('nro_doc', nro_doc)
    .maybeSingle();
  if (e1) throw e1;

  if (!existing) {
    const { data: created, error: e2 } = await supabase
      .from('clientes')
      .insert({ tipo_doc, nro_doc, nombre_completo, telefono })
      .select('id,nombre_completo,telefono')
      .maybeSingle();
    if (e2) throw e2;
    return created;
  }

  const sameName = (existing.nombre_completo || '').trim() === nombre_completo;
  const samePhone = (existing.telefono || null) === (telefono || null);
  if (sameName && samePhone) return existing;

  const { data: updated, error: e3 } = await supabase
    .from('clientes')
    .update({ nombre_completo, telefono })
    .eq('id', existing.id)
    .select('id,nombre_completo,telefono')
    .maybeSingle();
  if (e3) throw e3;
  return updated;
}

export function validarDestinoEntrada(agencia) {
  const at = String(agencia.agencia_tipo || '').toUpperCase();
  const agNombre = agencia.agencia_nombre?.trim() || null;
  const dir = agencia.direccion?.trim() || null;

  if (at === 'SHALOM' && !agNombre) return 'Para SHALOM, agencia_nombre es obligatorio.';
  if ((at === 'OLVA' || at === 'FLORES') && !dir) return 'Para OLVA/FLORES, direccion es obligatoria.';
  if (at === 'OTRA' && (!agNombre || !dir)) return 'Para OTRA, agencia_nombre y direccion son obligatorias.';
  return null;
}

export function mapDestinoToDB(agencia) {
  const tipo = String(agencia.agencia_tipo || '').trim().toUpperCase();
  let agencia_tipo = ['SHALOM','OLVA','FLORES','OTRA'].includes(tipo) ? tipo : 'OTRA';
  let nom_agencia_o_direccion = agencia_tipo === 'SHALOM' ? agencia.agencia_nombre || null : agencia.direccion || null;
  return { agencia_tipo, nom_agencia_o_direccion };
}
