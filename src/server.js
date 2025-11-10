import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import reniecRouter from './routes/reniec.js';
import clientesRouter from './routes/clientes.js';
import catalogoRouter from './routes/catalogo.js';
import productosRouter from './routes/productos.js';
import pedidosRouter from './routes/pedidos/index.js';
import reportesRouter from './routes/reportes.js';
import authRouter from './routes/auth.js';
import adminUsuariosRouter from './routes/admin/admin_usuarios.js';
import adminAgenciasRouter from './routes/admin/admin_agencias.js';

const app = express();

// Seguridad básica
app.use(helmet());

// Body parser (con límite)
app.use(express.json({ limit: '1mb' }));

// CORS controlado por variable
const rawOrigins = process.env.CORS_ORIGINS || '';
const allowed = rawOrigins.split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    // Permitir coincidencia parcial o dominios *.netlify.app
    const isAllowed =
      allowed.includes(origin) ||
      origin.endsWith('.netlify.app') ||
      origin.includes('localhost');

    if (isAllowed) {
      return callback(null, true);
    }

    console.error('[ERROR] Origen no permitido por CORS:', origin);
    return callback(new Error('CORS bloqueado: ' + origin));
  },
  credentials: true,
}));


// Logs
app.use(morgan('dev'));

// Healthcheck
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'wombo-backend', time: new Date().toISOString() });
});

/**
 * Rutas API
 * Orden sugerido:
 * 1) auth
 * 2) públicas / de uso por la app
 * 3) reportes
 * 4) admin
 */
app.use('/api/auth', authRouter);

app.use('/api/reniec', reniecRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/catalogo', catalogoRouter);
app.use('/api/productos', productosRouter);
app.use('/api/pedidos', pedidosRouter);

app.use('/api/reportes', reportesRouter);

app.use('/api/admin/usuarios', adminUsuariosRouter);
app.use('/api/admin/agencias', adminAgenciasRouter);

// 404 para rutas de API que no existan
app.use('/api', (req, res) => {
  return res.status(404).json({ ok: false, message: 'Ruta no encontrada' });
});

// Manejador de errores básico (último)
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  const status = err.status || 500;
  return res.status(status).json({
    ok: false,
    message: err.message || 'Error interno',
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Wombo backend escuchando en http://localhost:${PORT}`);
});

