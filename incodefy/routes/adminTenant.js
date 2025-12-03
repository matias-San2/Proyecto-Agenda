const express = require('express');
const fetch = require('node-fetch');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

router.get('/eliminacion-exitosa', requireAuth, (req, res) => {
  res.render('eliminacion-exitosa');
});

router.delete('/admin/tenant/:empresaId', requireAuth, async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.status(401).render('error', { message: 'Usuario no autenticado.' });
    }

    if (!['admin', 'superadmin'].includes(user.role)) {
      return res.status(403).render('error', { message: 'No tienes permisos para eliminar un tenant.' });
    }

    const empresaId = req.params.empresaId;
    const apiUrl = `${process.env.API_BASE_URL}/admin/tenant/${empresaId}`;

    const response = await fetch(apiUrl, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${user.idToken}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json().catch(() => ({}));
    console.log("DELETE TENANT RAW RESPONSE:", response.status, result);

    if (!response.ok || result.ok === false) {
      const errorMessage = result.error || 'No se pudo eliminar el tenant.';
      return res.status(response.status || 500).render('error', { message: errorMessage });
    }

    return res.redirect('/eliminacion-exitosa');
  } catch (error) {
    console.error('Error eliminando tenant:', error);
    return res.status(500).render('error', { message: 'Error interno al eliminar el tenant.' });
  }
});

module.exports = router;
