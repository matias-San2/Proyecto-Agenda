// routes/api.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { refreshUserPersonalization } = require('./auth');
const multer = require('multer');
const FormData = require('form-data');
const upload = multer();
// Middleware para verificar autenticación en API
const requireAuthAPI = (req, res, next) => {
  if (!req.session.user || !req.session.user.idToken) {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }
  next();
};

// POST /api/personalization - Actualizar personalización del usuario
router.post('/personalization', requireAuthAPI, async (req, res) => {
  try {
    console.log('📝 Actualizando personalización:', req.body);
    const parameters = req.body.parameters || {};

    // Guardar el idioma en la sesión si está presente
    if (parameters['locale.language']) {
      req.session.lang = parameters['locale.language'];
    }
    if (!req.session.personalization) {
        req.session.personalization = {};
    }
    req.session.personalization['locale.language'] = req.session.lang;
    // Handle themeKey persistence in session before sending to backend
    if (parameters.themeKey) {
      req.session.themeKey = parameters.themeKey;
      if (req.session.personalization) {
        req.session.personalization.themeKey = parameters.themeKey;
      }
      delete parameters.themeKey; // Remove themeKey before sending to Lambda
    }
    req.body.parameters = parameters;
    const response = await fetch(process.env.API_BASE_URL,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${req.session.user.idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body)
      }
    );

    const data = await response.json();
    
    if (response.ok) {
      // Actualizar la personalización en la sesión
      const refreshSuccess = await refreshUserPersonalization(req);
      
      if (refreshSuccess) {
        console.log('✅ Personalización actualizada en sesión');
      }

      res.json({
        ...data,
        session_updated: refreshSuccess
      });
    } else {
      console.error('❌ Error del API de personalización:', data);
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error('❌ Error actualizando personalización:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Error interno del servidor',
      details: error.message 
    });
  }
});

// GET /api/personalization - Obtener personalización actual
router.get('/personalization', requireAuthAPI, async (req, res) => {
  try {
    const response = await fetch(process.env.API_BASE_URL,
      {
        headers: {
          'Authorization': `Bearer ${req.session.user.idToken}`
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      res.json(data);
    } else {
      const errorData = await response.json();
      res.status(response.status).json(errorData);
    }
  } catch (error) {
    console.error('❌ Error obteniendo personalización:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'Error interno del servidor' 
    });
  }
});
router.post('/perfil/branding', requireAuthAPI, upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.body.field) {
      req.flash('error', 'Debes adjuntar un archivo y especificar el campo destino');
      return res.redirect('/perfil?branding=error');
    }

    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });
    formData.append('field', req.body.field);

    const response = await fetch(`${process.env.API_BASE_URL}/personalization/branding/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${req.session.user.idToken}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    const result = await response.json();

    if (!response.ok || !result.ok) {
      console.error('Error subiendo branding:', result);
      req.flash('error', result.error || 'No se pudo actualizar el branding');
      return res.redirect('/perfil?branding=error');
    }

    if (!req.session.personalization) {
      req.session.personalization = {};
    }
    req.session.personalization[req.body.field] = result.url;

    req.session.save((err) => {
      if (err) {
        console.error('Error guardando sesión tras branding:', err);
      }
      res.redirect('/perfil?branding=ok');
    });
  } catch (error) {
    console.error('Error en /perfil/branding:', error);
    req.flash('error', 'Error interno al subir el branding');
    res.redirect('/perfil?branding=error');
  }
});
module.exports = router;