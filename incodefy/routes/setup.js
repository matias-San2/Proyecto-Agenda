const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[^\s]{8,}$/;

router.get('/setup', (req, res) => {
  let formData = {};
  const storedForm = req.flash('formData');

  if (storedForm && storedForm.length) {
    try {
      formData = JSON.parse(storedForm[0]) || {};
    } catch (err) {
      console.warn('⚠️ No se pudo parsear formData almacenado:', err.message);
    }
  }

  res.render('setup/init', {
    title: 'Configuración Inicial',
    error_msg: req.flash('error') || [],
    success_msg: req.flash('success') || [],
    form_data: formData
  });
});

router.post(
  '/setup/create-admin',
  upload.none(),
  async (req, res) => {
    try {
      const {
        fullName = '',
        email = '',
        password = '',
        passwordConfirm = '',
        companyName = '',
        companyId = '',
        industry = ''
      } = req.body || {};

      const trimmedData = {
        fullName: fullName.trim(),
        email: email.trim(),
        companyName: companyName.trim(),
        companyId: companyId.trim(),
        industry: (industry || 'general').trim() || 'general'
      };

      const preserveFormData = () => {
        req.flash('formData', JSON.stringify(trimmedData));
      };

      if (!trimmedData.fullName || !trimmedData.email || !password || !passwordConfirm || !trimmedData.companyName) {
        req.flash('error', 'Por favor completa todos los campos obligatorios.');
        preserveFormData();
        return res.redirect('/setup');
      }

      if (password !== passwordConfirm) {
        req.flash('error', 'Las contraseñas no coinciden.');
        preserveFormData();
        return res.redirect('/setup');
      }

      if (!passwordRegex.test(password)) {
        req.flash(
          'error',
          'La contraseña debe tener mínimo 8 caracteres, una mayúscula, un número, un carácter especial y no contener espacios.'
        );
        preserveFormData();
        return res.redirect('/setup');
      }

      const apiUrl = `${process.env.API_BASE_URL}/admin/onboarding/create-admin`;
      if (!process.env.API_BASE_URL) {
        req.flash('error', 'No se encuentra configurada la URL del backend.');
        preserveFormData();
        return res.redirect('/setup');
      }

      const formData = new FormData();
      formData.append('fullName', trimmedData.fullName);
      formData.append('email', trimmedData.email);
      formData.append('password', password);
      formData.append('passwordConfirm', passwordConfirm);
      formData.append('companyName', trimmedData.companyName);
      formData.append('companyId', trimmedData.companyId);
      formData.append('industry', trimmedData.industry);

      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: formData.getHeaders()
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        req.flash('error', data.error || 'No se pudo completar la configuración inicial.');
        preserveFormData();
        return res.redirect('/setup');
      }

      req.flash('success', 'Tu cuenta y empresa fueron creadas. Ahora inicia sesión.');
      return res.redirect('/login');
    } catch (error) {
      console.error('Error en /setup/create-admin:', error);
      req.flash('error', 'Error inesperado al crear la cuenta. Intenta nuevamente.');
      req.flash('formData', JSON.stringify({
        fullName: req.body?.fullName || '',
        email: req.body?.email || '',
        companyName: req.body?.companyName || '',
        companyId: req.body?.companyId || '',
        industry: req.body?.industry || ''
      }));
      return res.redirect('/setup');
    }
  }
);

module.exports = router;
