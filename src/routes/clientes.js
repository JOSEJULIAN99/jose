// C:\Users\Jose-Julian\Desktop\wombo\backend\src\routes\clientes.js
import { Router } from 'express';
import { supabase } from '../lib/supabase.js';

const router = Router();

function sendError(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

// --- Validaciones backend (evita confiar sólo en el front) ---
const VALID_DOCS = new Set(['DNI', 'CE', 'OTRO']);
const isDNI = (s) => /^\d{8}$/.test(s || '');
const isCE  = (s) => /^[a-zA-Z0-9]{1,12}$/.test(s || '');
const isPhoneIntl = (s) => s == null || /^\+\d{10,15}$/.test(String(s));

/**
 * GET /api/clientes/search?tipo_doc=DNI&nro_doc=00000000
 * Busca cliente exacto. Responde 200 con objeto o 404 si no existe.
 */
router.get('/search', async (req, res, next) => {
  try {
    if (!supabase) return sendError(res, 500, 'Supabase no configurado');

    const tipo_doc = String(req.query.tipo_doc || '').trim().toUpperCase();
    const nro_doc  = String(req.query.nro_doc  || '').trim();

    if (!tipo_doc || !nro_doc) {
      return sendError(res, 400, 'Faltan parámetros: tipo_doc y nro_doc');
    }
    if (!VALID_DOCS.has(tipo_doc)) {
      return sendError(res, 400, 'tipo_doc inválido (DNI|CE|OTRO)');
    }
    if ((tipo_doc === 'DNI' && !isDNI(nro_doc)) ||
        (tipo_doc === 'CE'  && !isCE(nro_doc))) {
      return sendError(res, 400, 'nro_doc no cumple el formato');
    }

    const { data, error } = await supabase
      .from('clientes')
      .select('id,tipo_doc,nro_doc,nombre_completo,telefono')
      .eq('tipo_doc', tipo_doc)
      .eq('nro_doc', nro_doc)
      .maybeSingle();

    if (error) {
      return sendError(res, 500, error.message);
    }
    if (!data) {
      return res.status(404).json({ ok: false, message: 'Cliente no encontrado' });
    }

    return res.json({ ok: true, data });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/clientes
 * body: { tipo_doc, nro_doc, nombre_completo, telefono? }
 *
 * Reglas:
 * - si NO existe (tipo_doc,nro_doc) -> crea
 * - si SÍ existe y cambian (telefono) -> actualiza
 * - si SÍ existe y no cambian -> devuelve lo existente
 *
 * Implementación robusta:
 * 1) Intentar INSERT directo
 * 2) Si UNIQUE violation (23505), hacer SELECT y comparar; si difiere, UPDATE
 */
router.post('/', async (req, res, next) => {
  try {
    if (!supabase) return sendError(res, 500, 'Supabase no configurado');

    let { tipo_doc, nro_doc, nombre_completo, telefono = null } = req.body || {};

    if (!tipo_doc || !nro_doc || !nombre_completo) {
      return sendError(res, 400, 'Campos requeridos: tipo_doc, nro_doc, nombre_completo');
    }

    // normalizar
    tipo_doc = String(tipo_doc).trim().toUpperCase();
    nro_doc  = String(nro_doc).trim();
    nombre_completo = String(nombre_completo).trim();
    telefono = telefono ? String(telefono).trim() : null;

    // validar
    if (!VALID_DOCS.has(tipo_doc)) {
      return sendError(res, 400, 'tipo_doc inválido (DNI|CE|OTRO)');
    }
    if ((tipo_doc === 'DNI' && !isDNI(nro_doc)) ||
        (tipo_doc === 'CE'  && !isCE(nro_doc))) {
      return sendError(res, 400, 'nro_doc no cumple el formato');
    }
    if (!nombre_completo) {
      return sendError(res, 400, 'nombre_completo no puede estar vacío');
    }
    if (!isPhoneIntl(telefono)) {
      return sendError(res, 400, 'telefono debe ser internacional (+##########) o null');
    }

    const payload = { tipo_doc, nro_doc, nombre_completo, telefono };

    // 1) Intentar crear primero
    const { data: created, error: errCreate } = await supabase
      .from('clientes')
      .insert(payload)
      .select('id,tipo_doc,nro_doc,nombre_completo,telefono')
      .maybeSingle();

    if (!errCreate && created) {
      return res.status(201).json({
        ok: true, created: true, updated: false, data: created
      });
    }

    // Si hubo error distinto a duplicado, devolver 500
    if (errCreate && errCreate.code !== '23505') {
      return sendError(res, 500, errCreate.message);
    }

    // 2) Ya existe (duplicado): leer y comparar
    const { data: existing, error: errExisting } = await supabase
      .from('clientes')
      .select('id,tipo_doc,nro_doc,nombre_completo,telefono')
      .eq('tipo_doc', tipo_doc)
      .eq('nro_doc', nro_doc)
      .maybeSingle();

    if (errExisting) {
      return sendError(res, 500, errExisting.message);
    }
    if (!existing) {
      // Caso raro: duplicado sin registro visible; tratar como error interno
      return sendError(res, 500, 'Inconsistencia: duplicado sin registro');
    }

    // Ahora solo interesa si cambia el teléfono
const samePhone = (existing.telefono || null) === (telefono || null);

if (samePhone) {
  return res.json({ ok: true, created: false, updated: false, data: existing });
}

    const { data: updated, error: errUpdate } = await supabase
  .from('clientes')
  .update({ telefono })
  .eq('id', existing.id)
  .select('id,tipo_doc,nro_doc,nombre_completo,telefono')
  .maybeSingle();

    if (errUpdate) {
      return sendError(res, 500, errUpdate.message);
    }

    return res.json({ ok: true, created: false, updated: true, data: updated });
  } catch (e) {
    next(e);
  }
});

export default router;
