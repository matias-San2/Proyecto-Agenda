// routes/api.js
const express = require('express');
const router = express.Router();

// Personalización deshabilitada: se exponen rutas mínimas para compatibilidad.
router.all('/personalization*', (req, res) => {
  res.status(410).json({ ok: false, error: 'Personalización deshabilitada' });
});
router.all('/perfil/branding', (req, res) => {
  res.status(410).json({ ok: false, error: 'Branding deshabilitado' });
});

module.exports = router;
