// routes/dashboard.js (enfoque agenda genérica)
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const attachApiClient = require('../middleware/apiClient');
const checkPermission = require("../middleware/checkPermission");

router.use(requireAuth);
router.use(attachApiClient);

const toKey = (str = "") =>
  str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");

function limitRange(start, end, maxDays = 31) {
  const s = new Date(start);
  const e = new Date(end);
  const diff = (e - s) / (1000 * 60 * 60 * 24);
  if (diff > maxDays) {
    throw new Error(`El rango no puede superar ${maxDays} días`);
  }
}

function daysBetween(start, end) {
  const dates = [];
  const cursor = new Date(start);
  const last = new Date(end);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// Render
router.get('/dashboard', checkPermission('dashboard.read'), async (req, res) => {
  res.render('dashboard', { 
    currentPath: req.path,
    personalization: req.session.user?.personalization || {},
    user: req.session.user
  });
});

// Filtros
router.get('/dashboard/filtros-agenda', async (req, res) => {
  try {
    const recursos = await req.apiClient.obtenerRecursosAgenda();
    const tipos = [...new Set((recursos || []).map(r => r.type).filter(Boolean))];
    const buildings = [...new Set((recursos || []).map(r => r.location?.building).filter(Boolean))];
    const zones = [...new Set((recursos || []).map(r => r.location?.zone).filter(Boolean))];
    res.json({ tipos, buildings, zones });
  } catch (err) {
    console.error('❌ Error filtros agenda:', err);
    res.status(500).json({ error: err.message });
  }
});

// Datos agregados
router.post('/dashboard/datos-agenda', async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin, tipo, building, zone } = req.body || {};
    const start = fecha_inicio || new Date().toISOString().slice(0, 10);
    const end = fecha_fin || start;
    limitRange(start, end, 31);

    const recursos = await req.apiClient.obtenerRecursosAgenda();
    const filtrados = (recursos || []).filter((r) => {
      const matchTipo = !tipo || (r.type || '').toLowerCase().includes(tipo.toLowerCase());
      const matchBuilding = !building || (r.location?.building || '').toLowerCase().includes(building.toLowerCase());
      const matchZone = !zone || (r.location?.zone || '').toLowerCase().includes(zone.toLowerCase());
      return matchTipo && matchBuilding && matchZone;
    });

    const fechas = daysBetween(start, end);
    const reservas = [];
    for (const f of fechas) {
      for (const r of filtrados) {
        try {
          const data = await req.apiClient.obtenerReservasAgenda(f, r.resourceId);
          reservas.push(...(data || []));
        } catch (e) {
          console.warn("No se pudieron obtener reservas", r.resourceId, f, e.message);
        }
      }
    }

    const activas = reservas.filter((x) => x.status !== 'cancelled');
    const bloqueos = activas.filter((x) => (x.status || '').toLowerCase() === 'blocked');
    const bookings = activas.filter((x) => (x.status || '').toLowerCase() !== 'blocked');

    const totalReservas = bookings.length;
    const totalBloqueos = bloqueos.length;
    const diasPeriodo = fechas.length || 1;
    const totalRecursos = filtrados.length || 1;

    const ocupacion = Math.min(100, Math.round(((bookings.length + bloqueos.length) / (diasPeriodo * totalRecursos)) * 100));
    const promedioDia = parseFloat((bookings.length / diasPeriodo).toFixed(1));

    const porDiaMap = {};
    fechas.forEach((d) => (porDiaMap[d] = 0));
    bookings.forEach((r) => {
      const d = (r.start || '').slice(0, 10);
      if (porDiaMap[d] != null) porDiaMap[d] += 1;
    });
    const reservasPorDia = { labels: Object.keys(porDiaMap), data: Object.values(porDiaMap) };

    const porTipo = {};
    bookings.forEach((r) => {
      const tipoRes = filtrados.find((x) => x.resourceId === r.resourceId)?.type || 'sin tipo';
      porTipo[tipoRes] = (porTipo[tipoRes] || 0) + 1;
    });
    const reservasPorTipo = { labels: Object.keys(porTipo), data: Object.values(porTipo) };

    const porUbic = {};
    bookings.forEach((r) => {
      const rc = filtrados.find((x) => x.resourceId === r.resourceId);
      const label = [rc?.location?.building, rc?.location?.zone].filter(Boolean).join(' · ') || 'sin ubicación';
      porUbic[label] = (porUbic[label] || 0) + 1;
    });
    const reservasPorUbicacion = { labels: Object.keys(porUbic), data: Object.values(porUbic) };

    res.json({
      kpis: {
        totalReservas,
        totalBloqueos,
        ocupacion,
        promedioDia,
        recursosActivos: filtrados.length
      },
      charts: {
        reservasPorDia,
        reservasPorTipo,
        reservasPorUbicacion
      }
    });
  } catch (err) {
    console.error('❌ Error en dashboard/datos-agenda:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
