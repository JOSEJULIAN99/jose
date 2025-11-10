// C:\Users\Jose-Julian\Desktop\wombo\backend\src\routes\auth.js
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { supabase, supabaseAdmin } from '../lib/supabase.js';
import { requireUser } from '../middleware/auth.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'CAMBIA_ESTE_SECRET_EN_PRODUCCION';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function sendError(res, status, message) {
  return res.status(status).json({ ok: false, message });
}

// normaliza el rol que venga de BD
function normRol(r) {
  return String(r || 'OPERADOR').trim().toUpperCase();
}

// intenta primero con supabase normal, si no con service role
async function getUserFromSupabase(username) {
  try {
    // intento 1: ANON
    const resp = await supabase
      .from('usuarios')
      .select('id,usuario,rol,activo,clave_prov')
      .eq('usuario', username)
      .maybeSingle();

    if (!resp.error && resp.data) {
      return resp.data;
    }

    // si falló y tenemos admin, probamos admin
    if (resp.error && supabaseAdmin) {
      console.warn('[AUTH] supabase normal falló:', resp.error.message);
      const respAdmin = await supabaseAdmin
        .from('usuarios')
        .select('id,usuario,rol,activo,clave_prov')
        .eq('usuario', username)
        .maybeSingle();

      if (respAdmin.error) {
        console.warn('[AUTH] error final supabase:', respAdmin.error);
        throw respAdmin.error;
      }
      return respAdmin.data;
    }

    return null;
  } catch (err) {
    console.warn('[AUTH] error final supabase:', err);
    throw err;
  }
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { usuario, clave } = req.body || {};
    if (!usuario || !clave) {
      return sendError(res, 400, 'Credenciales requeridas');
    }

    const u = String(usuario).toUpperCase().trim();

    let user;
    try {
      user = await getUserFromSupabase(u);
    } catch (err) {
      // ni anon ni service respondieron
      return sendError(res, 503, 'No se pudo conectar a Supabase');
    }

    if (!user) {
      return sendError(res, 401, 'Usuario o clave inválidos');
    }
    if (!user.activo) {
      return sendError(res, 401, 'Usuario inactivo');
    }

    const passwordOk = String(user.clave_prov || '').trim() === String(clave).trim();
    if (!passwordOk) {
      return sendError(res, 401, 'Usuario o clave inválidos');
    }

    // FORZAMOS el rol AQUÍ
    const rol = normRol(user.rol);

    const token = jwt.sign(
      { sub: user.usuario, rol },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // importante: devolver plano para tu front
    return res.json({
      ok: true,
      usuario: user.usuario,
      rol,              // <-- ya UPPERCASE
      token,
      data: {
        usuario: user.usuario,
        rol
      }
    });
  } catch (e) {
    next(e);
  }
});

// sigue igual
router.get('/me', requireUser(), async (req, res) => {
  return res.json({
    ok: true,
    data: {
      usuario: req.user.usuario,
      rol: req.user.rol,
    },
  });
});

router.get('/me-token', async (req, res) => {
  const auth = req.header('authorization') || '';
  const [, token] = auth.split(' ');
  if (!token) {
    return sendError(res, 401, 'Token requerido');
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({
      ok: true,
      data: {
        usuario: payload.sub,
        rol: payload.rol,
      },
    });
  } catch (err) {
    return sendError(res, 401, 'Token inválido o expirado');
  }
});

export default router;
