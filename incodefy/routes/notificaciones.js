// routes/notificaciones.js
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const attachApiClient = require('../middleware/apiClient');
const checkPermission = require("../middleware/checkPermission");

router.use(requireAuth);
router.use(attachApiClient);

router.get('/historial-notificaciones', checkPermission('notificaciones.historial'), (req, res) => {
  res.render('historial_notificaciones', {
    currentPath: req.path,
    personalization: req.session.user?.personalization || {},
    user: req.session.user
  });
});

router.get('/notificaciones-usuario', async (req, res) => {
  try {
    console.log('📡 Obteniendo notificaciones del usuario:', req.session.user.email);

    const notificaciones = await req.apiClient.obtenerNotificaciones();

    console.log('✅ Notificaciones crudas obtenidas:', Array.isArray(notificaciones) ? notificaciones.length : 'no-array');
    if (Array.isArray(notificaciones) && notificaciones.length > 0) {
      console.log('🔍 Ejemplo notificación:', JSON.stringify(notificaciones[0], null, 2));
    }

    const t = typeof req.t === 'function' ? req.t.bind(req) : (k) => k;

    const data = await Promise.all(notificaciones.map(async (n) => {
      let detalleProcesado = [];
      const esAuditoria = n.tipo === 'audit';
      let mensajeTraducido = n.descripcion;

      try {
        if (!esAuditoria) {
          const match = n.descripcion?.match(/(\d+)/);
          const count = match ? parseInt(match[1], 10) : 0;
          if (count > 0) {
            mensajeTraducido = t('notifications.import_success', { count });
          }
        }

        const detalleOriginal = typeof n.detalle === 'string' 
          ? JSON.parse(n.detalle) 
          : n.detalle;
        
        if (Array.isArray(detalleOriginal)) {
          detalleProcesado = await Promise.all(detalleOriginal.map(async (consulta) => {
            try {
              let estadoTraducido = esAuditoria
                ? (consulta.estado || 'creada')
                : t('common.pending');

              if (!esAuditoria && consulta.estado) {
                const estadoKey = consulta.estado.toLowerCase().replace(/\s+/g, '_');
                estadoTraducido = t(`notifications.${estadoKey}`, t('common.pending'));
              }

              const tipoConsulta = consulta.tipoconsulta;
              const normalizedTipo = String(tipoConsulta || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();
              const tipoConsultaTraducido = esAuditoria
                ? (tipoConsulta || 'agenda')
                : normalizedTipo === 'medica'
                  ? t('common.medical')
                  : t('common.non_medical');

              return {
                fecha: consulta.fecha,
                horaInicio: consulta.horaInicio || consulta.horainicio,
                horaFin: consulta.horaFin || consulta.horafin,
                medico: consulta.medico,
                box: consulta.box,
                estado: estadoTraducido,
                tipoconsulta: tipoConsultaTraducido
              };
            } catch (consultaErr) {
              console.error('❌ Error procesando consulta individual:', consultaErr);
              return {
                fecha: consulta.fecha || '',
                horaInicio: consulta.horaInicio || consulta.horainicio || '',
                horaFin: consulta.horaFin || consulta.horafin || '',
                medico: t('common.unknown_doctor'),
                box: t('common.unknown_box'),
                estado: t('common.pending'),
                tipoconsulta: t('common.medical')
              };
            }
          }));
        } else if (detalleOriginal && typeof detalleOriginal === 'object') {
          detalleProcesado = [{
            fecha: detalleOriginal.fecha || '',
            horaInicio: detalleOriginal.horaInicio || '',
            horaFin: detalleOriginal.horaFin || '',
            medico: detalleOriginal.medico || (esAuditoria ? (n.userEmail || '') : t('common.unknown_doctor')),
            box: detalleOriginal.box || detalleOriginal.resourceId || '',
            estado: detalleOriginal.estado || (esAuditoria ? 'creada' : t('common.pending')),
            tipoconsulta: detalleOriginal.tipoconsulta || (esAuditoria ? 'agenda' : t('common.medical'))
          }];
        }
      } catch (e) {
        console.error('❌ Error procesando notificación:', e);
        detalleProcesado = typeof n.detalle === 'string' ? n.detalle : JSON.stringify(n.detalle);
      }

      return {
        id: n.id || n.idNotificacion,
        fecha: n.fecha ? new Date(n.fecha).toISOString().slice(0, 19).replace('T', ' ') : '',
        mensaje: mensajeTraducido,
        detalle: detalleProcesado,
        tipo: n.tipo || 'info',
        leida: n.leida || false
      };
    }));

    console.log(`✅ ${data.length} notificaciones procesadas correctamente`);

    res.json({ 
      notificaciones: data,
      headers: {
        date: t('common.date'),
        start_time: t('common.start_time'),
        end_time: t('common.end_time'),
        doctor: t('common.doctor'),
        box: t('common.box'),
        consult_type: t('common.consult_type'),
        status: t('common.status')
      }
    });
  } catch (err) {
    console.error('❌ Error al cargar notificaciones:', err);
    console.error('Stack trace:', err.stack);
    res.status(500).json({ 
      error: 'Error al cargar notificaciones',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});
module.exports = router;
