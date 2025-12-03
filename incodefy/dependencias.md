
# Mapa de Dependencias del Proyecto

## 1. Dependencias de Archivos .js (require)

- **server.js**
  - → `express`
  - → `path`
  - → `./db`
  - → `node-fetch`
  - → `./i18n`
  - → `i18next-http-middleware`
  - → `cookie-parser`
  - → `express-session`
  - → `connect-flash`
  - → `./middleware/themeMiddleware`
  - → `./middleware/requireAuth`
  - → `./middleware/personalization`
  - → `./middleware/setLanguage`
  - → `./middleware/checkPermission`
  - → `./routes/auth`
  - → `./routes/box`
  - → `./routes/detalle_box`
  - → `./routes/consultas`
  - → `./routes/dashboard`
  - → `./routes/notificaciones`
  - → `./routes/calendario`
  - → `./routes/admin`

- **middleware/apiClient.js**
  - → `../apiClient`

- **middleware/auth.js**
  - → `@aws-sdk/client-cognito-identity-provider`

- **middleware/checkPermission.js**
  - → (ninguna)

- **middleware/personalization.js**
  - → `node-fetch`

- **middleware/requireAuth.js**
  - → (ninguna)

- **middleware/setLanguage.js**
  - → (ninguna)

- **middleware/themeMiddleware.js**
  - → `fs`
  - → `path`

- **routes/admin.js**
  - → `express`
  - → `../middleware/checkPermission`

- **routes/api.js**
  - → `express`
  - → `node-fetch`
  - → `./auth`

- **routes/auth.js**
  - → `dotenv`
  - → `express`
  - → `@aws-sdk/client-cognito-identity-provider`
  - → `node-fetch`
  - → `../db`
  - → `../middleware/requireAuth`

- **routes/box.js**
  - → `express`
  - → `../middleware/requireAuth`
  - → `../middleware/apiClient`
  - → `../middleware/checkPermission`

- **routes/calendario.js**
  - → `express`
  - → `../middleware/requireAuth`
  - → `../middleware/apiClient`
  - → `../middleware/checkPermission`

- **routes/consultas.js**
  - → `express`
  - → `../middleware/requireAuth`
  - → `../middleware/apiClient`
  - → `../middleware/checkPermission`

- **routes/dashboard.js**
  - → `express`
  - → `../middleware/requireAuth`
  - → `../middleware/apiClient`
  - → `../middleware/checkPermission`

- **routes/detalle_box.js**
  - → `express`
  - → `../middleware/requireAuth`
  - → `../middleware/apiClient`
  - → `../middleware/checkPermission`

- **routes/notificaciones.js**
  - → `express`
  - → `../middleware/requireAuth`
  - → `../middleware/apiClient`
  - → `../middleware/checkPermission`

## 2. Uso de Middlewares

- **`server.js` (globales)**
  - `express.json()`
  - `express.urlencoded()`
  - `cookieParser()`
  - `express.static()`
  - `session()`
  - `themeMiddleware`
  - `i18nextHttpMiddleware.handle()`
  - `flash()`
  - `personalizationMiddleware`
  - `setLanguage`

- **Rutas específicas**
  - `requireAuth`: Usado en `server.js` para proteger la mayoría de las rutas.
  - `checkPermission`: Usado en `server.js` y en los archivos de rutas para control de acceso más granular.
  - `attachApiClient`: Usado en los archivos de rutas que necesitan interactuar con la API.

## 3. Rutas y Vistas (res.render)

- `routes/admin.js` → `admin-rotations.ejs`
- `routes/auth.js` → `login.ejs`
- `routes/box.js` → `box.ejs`
- `routes/calendario.js` → `calendario_agenda.ejs`
- `routes/consultas.js` → `consultas_en_curso.ejs`
- `routes/dashboard.js` → `dashboard.ejs`
- `routes/detalle_box.js` → `detalle_box.ejs`
- `routes/notificaciones.js` → `historial_notificaciones.ejs`
- `server.js`
  - → `agenda.ejs`
  - → `importar.ejs` (No existe)
  - → `exportar.ejs` (No existe)
  - → `calendario-box.ejs` (No existe)
  - → `calendario-medico.ejs` (No existe)
  - → `perfil.ejs`
  - → `error.ejs`

## 4. Vistas y Variables

- **admin-rotations.ejs** → `t`, `theme`, `tr`
- **agenda.ejs** → `i18n.language`, `t`, `personalization`, `canViewAgenda`, `canImport`, `canExport`
- **box.ejs** → `i18n.language`, `t`, `personalization`, `canWrite`, `canViewDetail`, `pasillo_box_map`
- **calendario_agenda.ejs** → `i18n.language`, `t`, `tipo`, `config`, `pasillos`, `boxes`, `especialidades`, `medicos`, `horas`, `dias`
- **consultas_en_curso.ejs** → `i18n.language`, `t`, `personalization`
- **dashboard.ejs** → `i18n.language`, `t`, `personalization`
- **detalle_box.ejs** → `i18n.language`, `t`, `personalization`, `box_id`, `nombre`, `idpasillo`, `estado`, `instrumentos`
- **error.ejs** → `i18n.language`, `t`, `error`, `message`
- **footer.ejs** → `t`
- **historial_notificaciones.ejs** → `i18n.language`, `t`, `personalization`
- **login.ejs** → `i18n.language`, `t`, `error_msg`, `form_data`, `form_errors`
- **navbar.ejs** → `user`, `currentPath`, `t`
- **perfil.ejs** → `lng`, `t`, `personalization`, `user`
- **partials/personalization-styles.ejs** → `locals.personalization`

## 5. Interacción con apiClient

- `middleware/apiClient.js`: Define el middleware `attachApiClient`.
- `routes/box.js`: Usa `req.apiClient` para obtener datos de boxes, pasillos y agendas.
- `routes/calendario.js`: Usa `req.apiClient` para gestionar la agenda.
- `routes/consultas.js`: Usa `req.apiClient` para obtener y actualizar consultas.
- `routes/dashboard.js`: Usa `req.apiClient` para obtener datos para los KPIs y gráficos.
- `routes/detalle_box.js`: Usa `req.apiClient` para obtener detalles de un box y su agenda.
- `routes/notificaciones.js`: Usa `req.apiClient` para obtener notificaciones.
- `admin-rotations.ejs`: Usa `apiClient.js` en el lado del cliente.

## 6. Definición de Sesión

- **server.js**:
  - Configura `express-session` con `secret`, `resave`, `saveUninitialized`, y `cookie`.
  - `req.session.user` es creado/actualizado en `routes/auth.js` durante el login.
  - `req.session.language` es manejado en `routes/auth.js` y `middleware/setLanguage.js`.

## 7. Manejo de Autenticación

- **`server.js`**: Aplica el middleware `requireAuth` a rutas protegidas.
- **`middleware/requireAuth.js`**: Verifica si `req.session.user` existe.
- **`middleware/checkPermission.js`**: Verifica los permisos del usuario en `req.session.user.permissions`.
- **`middleware/auth.js`**: Contiene lógica para refrescar tokens de Cognito.
- **`routes/auth.js`**:
  - Maneja el flujo de login con `USER_PASSWORD_AUTH` de Cognito.
  - Obtiene información del usuario y tokens.
  - Obtiene permisos y personalización de la API.
  - Destruye la sesión en el logout.

## 8. Uso de res.locals

- **`server.js`**:
  - `res.locals.t`: Expone la función de traducción de i18next.
  - `res.locals.lng`, `res.locals.language`, `res.locals.i18n`: Expone el idioma actual.
  - `res.locals.error_msg`, `res.locals.success_msg`: Expone mensajes flash.
  - `res.locals.user`: Expone el objeto de usuario de la sesión.
- **`middleware/personalization.js`**:
  - `res.locals.personalization`: Almacena la configuración de personalización del usuario.
- **`middleware/setLanguage.js`**:
  - `res.locals.lng`: Actualiza el idioma en `res.locals`.
- **`middleware/themeMiddleware.js`**:
  - `res.locals.themeKey`: La clave del tema actual.
  - `res.locals.theme`: El objeto de configuración del tema.
  - `res.locals.tr`: Helper de traducción para el tema.
