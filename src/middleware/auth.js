import { supabase } from '../lib/supabase.js';

const USER_HEADER = 'x-usuario';

// helper: respuesta estándar
function sendError(res, status, message) {
  return res.status(status).json({
    ok: false,
    message,
  });
}

// helper: obtiene usuario desde header + supabase
export async function getUserFromHeader(req) {
  if (!supabase) {
    // backend mal configurado
    throw new Error('[AUTH] Supabase no está inicializado');
  }

  const raw = req.header(USER_HEADER);
  const username = (raw || '').trim().toUpperCase();
  if (!username) return null;

  const { data, error } = await supabase
    .from('usuarios')
    .select('usuario, rol, activo')
    .eq('usuario', username)
    .maybeSingle();

  if (error) {
    // puedes loguear aquí
    return null;
  }

  if (!data || !data.activo) {
    return null;
  }

  return {
    usuario: data.usuario,
    rol: data.rol,
    activo: data.activo,
  };
}

// factory genérica: exigir rol opcional
function requireRole(requiredRole = null) {
  return async (req, res, next) => {
    try {
      const user = await getUserFromHeader(req);

      if (!user) {
        return sendError(res, 401, 'Usuario no autorizado');
      }

      if (requiredRole && user.rol !== requiredRole) {
        return sendError(res, 403, 'No tienes permisos suficientes');
      }

      req.user = user;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

// uso concreto:
export const requireUser = () => requireRole(null);
export const requireAdmin = () => requireRole('ADMIN');
