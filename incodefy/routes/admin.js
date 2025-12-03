const express = require('express');
const router = express.Router();
const checkPermission = require('../middleware/checkPermission');

// GET /admin/rotaciones - Muestra la página de gestión de rotaciones de roles
router.get('/rotaciones', checkPermission('admin.users'), (req, res) => {
  res.render('admin-rotations', {
    title: 'Gestión de Rotaciones',
    currentPath: req.path
  });
});

module.exports = router;
