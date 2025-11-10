// C:\Users\Jose-Julian\Desktop\wombo\backend\src\routes\reniec.js
import { Router } from 'express';
import axios from 'axios';

const router = Router();

function sendError(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

/**
 * GET /api/reniec/dni?numero=46027897
 * - valida que sean 8 dígitos
 * - llama a Decolecta usando TOKEN_DECOLECTA del .env
 * - normaliza la respuesta a un formato ÚNICO que tu React entiende
 *
 * NOTA: dejamos la misma URL que ya estabas usando:
 *   https://api.decolecta.com/v1/reniec/dni?numero=...
 * si tu proveedor la cambia a /v1/reniec/dni/{numero} solo cambia la línea del url.
 */
router.get('/dni', async (req, res, next) => {
  try {
    const numero = String(req.query.numero || '').trim();

    // 1. validar DNI
    if (!/^\d{8}$/.test(numero)) {
      return sendError(res, 400, 'El DNI debe tener exactamente 8 dígitos.');
    }

    // 2. validar token
    const token = process.env.TOKEN_DECOLECTA;
    if (!token) {
      return sendError(res, 500, 'Falta TOKEN_DECOLECTA en variables de entorno.');
    }

    // 3. llamada al proveedor
    const url = `https://api.decolecta.com/v1/reniec/dni?numero=${encodeURIComponent(numero)}`;

    const { data } = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      timeout: 8000,
    });

    // 4. normalización
    // Decolecta a veces devuelve:
    // { full_name, document_number, ... }
    // o a veces: { nombres, apellido_paterno, apellido_materno, ... }
    const fromFull = (data && data.full_name) ? data.full_name.trim() : '';
    const fromParts = [
      data?.apellido_paterno || '',
      data?.apellido_materno || '',
      data?.nombres || '',
    ]
      .map(s => String(s).trim())
      .filter(Boolean)
      .join(' ')
      .trim();

    // elegimos primero el que venga completo
    const full_name = fromFull || fromParts || null;
    const document_number = data?.document_number || numero;

    if (!full_name) {
      // lo encontró el servicio, pero no hay nombre útil
      return res.status(404).json({
        ok: false,
        message: 'DNI no encontrado en RENIEC (no hay nombre).',
      });
    }

    // 5. devolvemos en el formato que tu frontend espera
    // tu React usa: data.full_name  (o directamente full_name en raíz),
    // así que devolvemos las DOS cosas para no romper nada.
    return res.json({
      ok: true,
      full_name,               // <- forma directa (para tu Cliente.jsx mejorado)
      document_number,         // <- por si luego lo muestras
      nombres: data?.nombres || null,
      apellido_paterno: data?.apellido_paterno || null,
      apellido_materno: data?.apellido_materno || null,
      data: {
        full_name,
        document_number,
      },
      raw: data,               // <- por si quieres depurar en el front
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 502;
      const msg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Error consultando RENIEC (Decolecta).';
      return sendError(res, status, msg);
    }
    return next(error);
  }
});

export default router;
