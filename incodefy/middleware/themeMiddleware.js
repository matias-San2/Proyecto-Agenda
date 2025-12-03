const fs = require('fs');
const path = require('path');

/**
 * Middleware para cargar las traducciones basadas en el tema y el idioma.
 *
 * Determina el tema (themeKey) y el idioma (lang) desde la sesión del usuario,
 * con 'hospital' y 'es' como valores predeterminados.
 *
 * Construye la ruta al archivo JSON correspondiente (ej: config/themes/hospital/es.json).
 *
 * Si el archivo no se encuentra, utiliza el archivo de fallback 'config/themes/hospital/es.json'
 * para garantizar que la aplicación siempre tenga un conjunto de traducciones.
 *
 * Inyecta en `res.locals` para que estén disponibles en todas las vistas EJS:
 *   - `t`: Una función helper para obtener textos. Ej: t('profile.title').
 *   - `themeKey`: El tema que se está utilizando.
 *   - `lang`: El idioma que se está utilizando.
 */
const themeMiddleware = (req, res, next) => {
  // Sincronizar personalización desde el objeto de usuario si existe
  if (req.session.user && req.session.user.personalization) {
    req.session.personalization = req.session.user.personalization;
  }

    // Determina el tema y el idioma desde la sesión, con valores por defecto.
  // Carga la configuración global de la empresa para obtener el tema.
  const configPath = path.join(__dirname, '..', 'config', 'empresaConfigs.json');
  const empresaConfigs = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  // Determina el tema tomando en cuenta:
  // 1) Preferencia guardada en la sesión (admins pueden forzarlo).
  // 2) Personalización del usuario (sincronizada desde Cognito/API).
  // 3) Configuración por empresa.
  // 4) Fallback por defecto (hospital).
  const sessionThemeKey = req.session.themeKey;
  const personalizationThemeKey =
    (req.session.personalization && req.session.personalization.themeKey) ||
    (req.session.user &&
      req.session.user.personalization &&
      req.session.user.personalization.themeKey);
  const empresaId = req.session.user && req.session.user.empresaId;
  const empresaThemeKey =
    (empresaId && empresaConfigs[empresaId] && empresaConfigs[empresaId].themeKey) ||
    null;

  const themeKey =
    sessionThemeKey ||
    personalizationThemeKey ||
    empresaThemeKey ||
    'hospital';
  const lang = req.session.lang || (req.session.personalization && req.session.personalization['locale.language']) || 'es';

  let translations;
  let effectiveThemeKey = themeKey;
  let effectiveLang = lang;

  // Construye la ruta al archivo de traducción principal.
  const primaryPath = path.join(__dirname, '..', 'config', 'themes', themeKey, `${lang}.json`);

  try {
    // Intenta cargar el archivo de traducción principal.
    const fileContent = fs.readFileSync(primaryPath, 'utf8');
    translations = JSON.parse(fileContent);
  } catch (error) {
    // Si falla (ej: el archivo no existe), usa el fallback.
    console.warn(`ADVERTENCIA: No se encontró el archivo de traducción para theme='${themeKey}' y lang='${lang}'. Usando fallback 'hospital/es.json'.`);
    
    effectiveThemeKey = 'hospital';
    effectiveLang = 'es';
    const fallbackPath = path.join(__dirname, '..', 'config', 'themes', effectiveThemeKey, `${effectiveLang}.json`);

    try {
      const fallbackContent = fs.readFileSync(fallbackPath, 'utf8');
      translations = JSON.parse(fallbackContent);
    } catch (fallbackError) {
      // Si incluso el fallback falla, es un error crítico.
      console.error(`ERROR CRÍTICO: No se pudo cargar el archivo de traducción de fallback en '${fallbackPath}'.`, fallbackError);
      // Proporciona un objeto vacío para evitar que la app se caiga.
      translations = {};
    }
  }

  // Inyecta la función de traducción `t` y las variables en las vistas.
  // El helper `t` puede resolver claves anidadas (ej: 'profile.title').
  res.locals.t = (key) => {
    if (!key || typeof key !== 'string') {
      return key || '';
    }
    return key.split('.').reduce((acc, currentKey) => {
      if (acc && acc[currentKey] !== undefined) {
        return acc[currentKey];
      }
      return undefined;
    }, translations) || key;
  };

  res.locals.themeKey = effectiveThemeKey;
  res.locals.lang = effectiveLang;

  next();
};

module.exports = themeMiddleware;
