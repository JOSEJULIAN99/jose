import { Router } from 'express';
import crear from './crear.js';
import listar from './listar.js';
import detalle from './detalle.js';
import modificar from './modificar.js';
import eliminar from './eliminar.js';
import estados from './estados.js';
import pagar from './pagar.js';

const router = Router();

router.use('/', crear);
router.use('/', listar);
router.use('/', detalle);
router.use('/', modificar);
router.use('/', eliminar);
router.use('/', estados);
router.use('/', pagar);

export default router;
