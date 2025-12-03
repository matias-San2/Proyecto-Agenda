
[GET] /
- archivo: server.js
- middlewares: personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: N/A (redirección)
- variables enviadas: {}
- llamadas API: N/A

[GET] /login
- archivo: routes/auth.js
- middlewares: personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: login.ejs
- variables enviadas: { error_msg, form_errors, form_data }
- llamadas API: N/A

[POST] /login
- archivo: routes/auth.js
- middlewares: personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: login.ejs (en caso de error)
- variables enviadas: { error_msg, form_errors, form_data }
- llamadas API: 
  - cognitoClient.send(InitiateAuthCommand)
  - cognitoClient.send(GetUserCommand)
  - fetch(PERMISSIONS_URL)
  - fetch(PERSONALIZATION_URL)

[GET] /logout
- archivo: routes/auth.js
- middlewares: personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: N/A (redirección)
- variables enviadas: {}
- llamadas API: N/A

[GET] /profile
- archivo: routes/auth.js
- middlewares: personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: N/A

[GET] /agenda
- archivo: server.js
- middlewares: requireAuth, checkPermission('agenda.read'), personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: agenda.ejs
- variables enviadas: { currentPath, canViewAgenda, canWriteAgenda, canImport, canExport, personalization, idToken }
- llamadas API: N/A

[GET] /importar
- archivo: server.js
- middlewares: requireAuth, checkPermission('data.import'), personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: importar.ejs
- variables enviadas: { currentPath }
- llamadas API: N/A

[GET] /exportar
- archivo: server.js
- middlewares: requireAuth, checkPermission('data.export'), personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: exportar.ejs
- variables enviadas: { currentPath }
- llamadas API: N/A

[GET] /calendario/box
- archivo: server.js
- middlewares: requireAuth, checkPermission('agenda.read'), personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: calendario-box.ejs
- variables enviadas: { currentPath, canEdit }
- llamadas API: N/A

[GET] /calendario/medico
- archivo: server.js
- middlewares: requireAuth, checkPermission('agenda.read'), personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: calendario-medico.ejs
- variables enviadas: { currentPath, canEdit }
- llamadas API: N/A

[GET] /box
- archivo: routes/box.js
- middlewares: requireAuth, attachApiClient, checkPermission('box.read'), personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: box.ejs
- variables enviadas: { pasillo_box_map, personalization, currentPath, canWrite, canViewDetail }
- llamadas API: 
  - req.apiClient.obtenerPasillos()
  - req.apiClient.obtenerBoxes()
  - req.apiClient.obtenerAgendaPorFecha()

[GET] /estado-boxes
- archivo: routes/box.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.obtenerBoxes()
  - req.apiClient.obtenerAgendaPorFecha()

[GET] /box/:id
- archivo: routes/detalle_box.js
- middlewares: requireAuth, attachApiClient, checkPermission('box.detalle.read'), personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: detalle_box.ejs
- variables enviadas: { currentPath, canEdit, personalization, nombre, idpasillo, pasillo_nombre, box_id, estado, instrumentos }
- llamadas API: 
  - req.apiClient.obtenerBoxYPasillo()
  - req.apiClient.obtenerInstrumentosPorBox()

[GET] /api/box-info
- archivo: routes/detalle_box.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.obtenerAgendaPorBoxYFecha()

[GET] /en-curso
- archivo: routes/consultas.js
- middlewares: requireAuth, attachApiClient, checkPermission('box.write'), personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: consultas_en_curso.ejs
- variables enviadas: { currentPath, personalization, t, i18n }
- llamadas API: N/A

[GET] /consultas/en-curso/api
- archivo: routes/consultas.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.obtenerConsultasEnCurso()

[POST] /consultas/en-curso/toggle
- archivo: routes/consultas.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.actualizarEstadoAgenda()

[GET] /dashboard
- archivo: routes/dashboard.js
- middlewares: requireAuth, attachApiClient, checkPermission('dashboard.read'), personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: dashboard.ejs
- variables enviadas: { currentPath, personalization, user }
- llamadas API: N/A

[GET] /dashboard/filtros-iniciales
- archivo: routes/dashboard.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.obtenerEspecialidades()
  - req.apiClient.obtenerBoxes()

[POST] /dashboard/datos
- archivo: routes/dashboard.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.obtenerTotalConsultas()
  - req.apiClient.obtenerBoxes()
  - req.apiClient.obtenerEspecialidadMasDemandada()
  - req.apiClient.obtenerConsultasPorEspecialidad()
  - req.apiClient.obtenerConsultasPorDia()
  - req.apiClient.obtenerRendimientoMedicos()

[GET] /historial-notificaciones
- archivo: routes/notificaciones.js
- middlewares: requireAuth, attachApiClient, checkPermission('notificaciones.historial'), personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: historial_notificaciones.ejs
- variables enviadas: { currentPath, personalization, user }
- llamadas API: N/A

[GET] /notificaciones-usuario
- archivo: routes/notificaciones.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.obtenerNotificaciones()

[GET] /agenda/calendario/:tipo
- archivo: routes/calendario.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: calendario_agenda.ejs
- variables enviadas: { currentPath, tipo, horas, dias, config, medicos, boxes, pasillos, especialidades, personalization, user }
- llamadas API: 
  - req.apiClient.obtenerPasillos()
  - req.apiClient.obtenerBoxes()
  - req.apiClient.obtenerEspecialidades()
  - req.apiClient.obtenerMedicos()

[GET] /agenda/obtener-agendamientos
- archivo: routes/calendario.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.obtenerAgendaPorBox()
  - req.apiClient.obtenerAgendaPorMedico()

[POST] /agenda/guardar-agenda
- archivo: routes/calendario.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.verificarConflictoBox()
  - req.apiClient.verificarConflictoMedico()
  - req.apiClient.obtenerEstadoNoAtendido()
  - req.apiClient.insertarAgenda()

[POST] /agenda/eliminar-agenda-medico
- archivo: routes/calendario.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.obtenerAgendaPorMedico()
  - req.apiClient.eliminarAgenda()

[POST] /agenda/eliminar-agenda-box
- archivo: routes/calendario.js
- middlewares: requireAuth, attachApiClient, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - req.apiClient.obtenerAgendaPorBox()
  - req.apiClient.eliminarAgenda()

[GET] /admin/rotaciones
- archivo: routes/admin.js
- middlewares: requireAuth, checkPermission('admin.users'), personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: admin-rotations.ejs
- variables enviadas: { title, currentPath }
- llamadas API: N/A

[GET] /perfil
- archivo: server.js
- middlewares: requireAuth, personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: perfil.ejs
- variables enviadas: { currentPath, personalization, idToken, language }
- llamadas API: N/A

[POST] /api/personalization
- archivo: server.js
- middlewares: requireAuth, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - fetch(API_BASE_URL/personalization)

[POST] /api/refresh-personalization
- archivo: server.js
- middlewares: requireAuth, personalizationMiddleware, setLanguage
- función: async (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: 
  - refreshUserPersonalization()

[GET] /test
- archivo: server.js
- middlewares: personalizationMiddleware, setLanguage
- función: (req, res)
- vista renderizada: N/A (respuesta JSON)
- variables enviadas: {}
- llamadas API: N/A
