// src/handlers/personalization.js
const config = require('../../config/config');
const path = require('path');

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const multipart = require('lambda-multipart-parser');

const { wasAlreadyProcessed, markAsProcessed } = require("../../utils/idempotency");

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const snsClient = new SNSClient({});
const s3Client = new S3Client({});

// Parámetros disponibles para personalización
const PERSONALIZATION_PARAMETERS = config.personalization.parameters;

// Parámetros globales (por defecto)
const getGlobalParameters = () => {
  const params = config.personalization.parameters;
  return Object.fromEntries(
    Object.entries(params).map(([key, cfg]) => [key, cfg.default])
  );
};

const { retryWithJitter } = require("../../utils/retry");
const { createCircuitBreaker } = require("../../utils/circuitBreaker");

const snsBreaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 15000 });

// Publicar eventos a SNS
async function publishPersonalizationEvent(eventType, data) {
  const eventId = `${eventType}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  try {
    const message = {
      eventId,
      eventType,
      timestamp: new Date().toISOString(),
      data
    };

    if (!snsBreaker.shouldAllow()) {
      console.warn("⚠️ Circuit breaker abierto para SNS, evento no enviado:", eventType);
      throw new Error("CircuitBreakerOpen");
    }

    await retryWithJitter(
      async () => {
        await snsClient.send(new PublishCommand({
          TopicArn: process.env.PERSONALIZATION_TOPIC_ARN,
          Message: JSON.stringify(message),
          Subject: `Personalization Event: ${eventType}`
        }));
        snsBreaker.reportSuccess();
      },
      { maxAttempts: 3, baseDelayMs: 400 }
    );

    console.log(`📨 Evento SNS publicado correctamente: ${eventType}`);
    return true;

  } catch (error) {
    snsBreaker.reportFailure();
    console.error(`❌ Error publicando evento SNS (${eventType}):`, error.message);
    return false;
  }
}

/**
 * GET /personalization
 * Obtener parámetros globales y específicos del usuario
 */
module.exports.getPersonalization = async (event) => {
  try {
    const userSub = event.requestContext?.authorizer?.jwt?.claims?.sub;
    const userEmail = event.requestContext?.authorizer?.jwt?.claims?.email;
    
    if (!userSub) {
      return response(401, { ok: false, error: "Usuario no autenticado" });
    }

    const result = await docClient.send(new QueryCommand({
      TableName: process.env.PARAMETERS_TABLE,
      KeyConditionExpression: "user_sub = :userSub",
      ExpressionAttributeValues: { ":userSub": userSub }
    }));

    const userParameters = {};
    (result.Items || []).forEach(item => {
      userParameters[item.parameter_key] = item.parameter_value;
    });

    const globalParameters = getGlobalParameters();
    const finalParameters = { ...globalParameters, ...userParameters };

    Object.entries(PERSONALIZATION_PARAMETERS).forEach(([key, config]) => {
      if (!(key in finalParameters)) {
        finalParameters[key] = config.default;
      }
    });

    const colorVariants = config.personalization.generateColorVariants(finalParameters['theme.primary_color']);
    finalParameters['theme.primary_color_light'] = colorVariants.light;
    finalParameters['theme.primary_color_dark'] = colorVariants.dark;

    await publishPersonalizationEvent('PERSONALIZATION_REQUESTED', {
      userSub,
      userEmail,
      parametersCount: Object.keys(userParameters).length
    });

    return response(200, {
      ok: true,
      user_sub: userSub,
      email: userEmail,
      global_parameters: globalParameters,
      user_parameters: userParameters,
      final_parameters: finalParameters,
      available_parameters: PERSONALIZATION_PARAMETERS
    });

  } catch (err) {
    console.error("Error obteniendo personalización:", err);
    return response(500, { 
      ok: false, 
      error: "Error interno del servidor",
      details: err.message 
    });
  }
};

const dynamoBreaker = createCircuitBreaker({ failureThreshold: 3, cooldownMs: 20000 });
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg'];
const CONTENT_TYPE_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};
/**
 * POST /personalization/branding/upload
 * Permite a un administrador subir logos/íconos por empresa.
 */
module.exports.uploadBrandingAsset = async (event) => {
  try {
    if (!process.env.BRANDING_BUCKET) {
      return response(500, { ok: false, error: "Bucket de branding no configurado" });
    }

    const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
    const userEmail = claims.email;
    const userSub = claims.sub;

    if (!userSub) {
      return response(401, { ok: false, error: "Usuario no autenticado" });
    }

    if (!(await ensureAdminAccess(userEmail))) {
      return response(403, { ok: false, error: "Solo administradores pueden actualizar el branding" });
    }

    const parsed = await multipart.parse(event, true);
    const { files = [], ...fields } = parsed || {};
    const file = files[0];
    const brandingField = (fields?.field || '').toString().trim();

    if (!file) {
      return response(400, { ok: false, error: "Debes adjuntar un archivo" });
    }
    if (!brandingField) {
      return response(400, { ok: false, error: "Debes indicar el campo destino (field)" });
    }

    const fileValidation = validateUploadFile(file);
    if (fileValidation) {
      return response(400, { ok: false, error: fileValidation });
    }

    const empresaId = await resolveEmpresaId({ claims, fields });
    if (!empresaId) {
      return response(400, { ok: false, error: "No se pudo determinar el empresaId" });
    }

    const extension = path.extname(file.filename || '').toLowerCase();
    const fileBuffer = getFileBuffer(file);
    const normalizedName = normalizeName(brandingField).replace(/\./g, '-') || 'branding-asset';
    const objectKey = `${empresaId}/branding/${normalizedName}${extension}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.BRANDING_BUCKET,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: file.contentType || CONTENT_TYPE_BY_EXTENSION[extension] || 'application/octet-stream'
    }));

    const assetUrl = buildFileUrl(objectKey);

    await docClient.send(new PutCommand({
      TableName: process.env.PARAMETERS_TABLE,
      Item: {
        user_sub: empresaId,
        parameter_key: brandingField,
        parameter_value: assetUrl,
        updated_at: new Date().toISOString(),
        updated_by: userEmail || userSub
      }
    }));

    return response(200, { ok: true, url: assetUrl });
  } catch (error) {
    console.error("[Personalization] Error en uploadBrandingAsset:", error);
    return response(500, {
      ok: false,
      error: "Error interno del servidor",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /personalization
 * Establecer parámetros específicos del usuario
 */
module.exports.setPersonalization = async (event) => {
  try {
    const userSub = event.requestContext?.authorizer?.jwt?.claims?.sub;
    const userEmail = event.requestContext?.authorizer?.jwt?.claims?.email;
    
    if (!userSub) {
      return response(401, { ok: false, error: "Usuario no autenticado" });
    }

    const { parameters } = JSON.parse(event.body || "{}");

    if (!parameters || typeof parameters !== 'object') {
      return response(400, { 
        ok: false, 
        error: "parameters es obligatorio y debe ser un objeto" 
      });
    }

    const paramsHash = require('crypto')
      .createHash('sha256')
      .update(JSON.stringify(parameters))
      .digest('hex')
      .substring(0, 16);

    const timestamp = new Date().toISOString();
    const idempotencyKey = `setPersonalization-${userSub}-${paramsHash}-${timestamp}`;
    
    if (await wasAlreadyProcessed(idempotencyKey)) {
      console.log(`[Personalization] ⏭️ Actualización ya procesada: ${idempotencyKey}`);
      
      // Retornar el estado actual
      const currentState = await module.exports.getPersonalization(event);
      return response(200, {
        ok: true,
        message: "Parámetros ya estaban actualizados",
        final_parameters: JSON.parse(currentState.body).final_parameters,
        already_processed: true,
        idempotencyKey: idempotencyKey
      });
    }

    const validParameters = {};
    const errors = [];
    
    for (const [key, value] of Object.entries(parameters)) {
      if (PERSONALIZATION_PARAMETERS[key]) {
        if (validateParameter(key, value)) {
          validParameters[key] = value;
        } else {
          errors.push(`Valor inválido para ${key}: ${value}`);
        }
      } else {
        errors.push(`Parámetro no permitido: ${key}`);
      }
    }

    if (errors.length > 0) {
      return response(400, { ok: false, errors });
    }

    const previousResult = await retryWithJitter(
      async () => {
        if (!dynamoBreaker.shouldAllow()) {
          throw new Error("CircuitBreakerOpen");
        }
        const res = await docClient.send(new QueryCommand({
          TableName: process.env.PARAMETERS_TABLE,
          KeyConditionExpression: "user_sub = :userSub",
          ExpressionAttributeValues: { ":userSub": userSub }
        }));
        dynamoBreaker.reportSuccess();
        return res;
      },
      { maxAttempts: 3, baseDelayMs: 300 }
    );

    const previousValues = {};
    (previousResult.Items || []).forEach(item => {
      previousValues[item.parameter_key] = item.parameter_value;
    });

    const savedParameters = [];

    for (const [key, value] of Object.entries(validParameters)) {
      if (!dynamoBreaker.shouldAllow()) {
        console.warn("⚠️ Circuit breaker abierto (DynamoDB), escritura omitida temporalmente.");
        throw new Error("CircuitBreakerOpen");
      }

      await retryWithJitter(
        async () => {
          await docClient.send(new PutCommand({
            TableName: process.env.PARAMETERS_TABLE,
            Item: {
              user_sub: userSub,
              parameter_key: key,
              parameter_value: value,
              updated_at: timestamp,
              email: userEmail
            }
          }));
          dynamoBreaker.reportSuccess();
        },
        { maxAttempts: 3, baseDelayMs: 300 }
      );

      savedParameters.push({
        key,
        value,
        previousValue: previousValues[key] || null
      });
    }

    await markAsProcessed(idempotencyKey);

    await publishPersonalizationEvent('PERSONALIZATION_UPDATED', {
      userSub,
      userEmail,
      updatedParameters: savedParameters,
      timestamp,
      idempotencyKey
    });

    const updatedResult = await module.exports.getPersonalization(event);
    const finalParameters = JSON.parse(updatedResult.body).final_parameters;

    return response(200, {
      ok: true,
      message: "Parámetros de personalización actualizados",
      saved_parameters: savedParameters,
      final_parameters: finalParameters
    });

  } catch (err) {
    console.error("Error en setPersonalization:", err);
    return response(500, { 
      ok: false, 
      error: "Error interno del servidor",
      details: err.message
    });
  }
};

/**
 * Validación de valor del parámetro
 */
function validateParameter(key, value) {
  const config = PERSONALIZATION_PARAMETERS[key];
  if (!config) return false;
  
  switch (config.type) {
    case 'select':
    case 'color':
      return config.options.includes(value);
    case 'number':
      const num = Number(value);
      return !isNaN(num) && num >= config.min && num <= config.max;
    default:
      return true;
  }
}

async function ensureAdminAccess(userEmail) {
  if (!userEmail || !process.env.USER_ROLES_TABLE) return false;
  try {
    const data = await retryWithJitter(
      async () => {
        if (!dynamoBreaker.shouldAllow()) {
          throw new Error("CircuitBreakerOpen");
        }
        const res = await docClient.send(new GetCommand({
          TableName: process.env.USER_ROLES_TABLE,
          Key: { user_email: userEmail }
        }));
        dynamoBreaker.reportSuccess();
        return res;
      },
      { maxAttempts: 3, baseDelayMs: 200 }
    );
    const permissions = data.Item?.permissions || [];
    return permissions.includes("admin.users");
  } catch (err) {
    dynamoBreaker.reportFailure();
    console.error("[Personalization] No se pudo verificar permisos de administrador:", err);
    return false;
  }
}

async function resolveEmpresaId({ claims = {}, fields = {} }) {
  const directCandidates = [
    fields.empresaId,
    fields.companyId,
    claims['custom:empresaId'],
    claims['empresaId'],
    claims['custom:companyId'],
    claims['companyId']
  ].filter(Boolean);

  if (directCandidates.length > 0) {
    return directCandidates[0];
  }

  if (!claims.sub) {
    return null;
  }

  try {
    const personalizationMap = await loadPersonalizationMap(claims.sub);
    const possibleKeys = [
      'empresa.id',
      'company.id',
      'organization.id',
      'personalization.empresa.id'
    ];

    for (const key of possibleKeys) {
      if (personalizationMap[key]) {
        return personalizationMap[key];
      }
    }
  } catch (err) {
    console.warn("[Personalization] No se pudo obtener empresaId desde personalization:", err.message);
  }

  return claims.sub || null;

}

async function loadPersonalizationMap(userSub) {
  if (!userSub) return {};

  const result = await retryWithJitter(
    async () => {
      if (!dynamoBreaker.shouldAllow()) {
        throw new Error("CircuitBreakerOpen");
      }
      const res = await docClient.send(new QueryCommand({
        TableName: process.env.PARAMETERS_TABLE,
        KeyConditionExpression: "user_sub = :userSub",
        ExpressionAttributeValues: { ":userSub": userSub }
      }));
      dynamoBreaker.reportSuccess();
      return res;
    },
    { maxAttempts: 3, baseDelayMs: 200 }
  );

  const map = {};
  (result.Items || []).forEach(item => {
    map[item.parameter_key] = item.parameter_value;
  });
  return map;
}

function normalizeName(value, fallback = 'asset') {
  return (value || fallback)
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || fallback;
}

function buildFileUrl(objectKey) {
  const region = process.env.AWS_REGION || 'us-east-1';
  return `https://${process.env.BRANDING_BUCKET}.s3.${region}.amazonaws.com/${objectKey}`;
}

function validateUploadFile(file) {
  if (!file || !file.filename || !file.content) {
    return "Archivo inválido";
  }
  const extension = path.extname(file.filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return `Extensión no permitida. Solo se aceptan ${ALLOWED_EXTENSIONS.join(', ')}`;
  }
  const buffer = getFileBuffer(file);
  if (!buffer.length) {
    return "El archivo está vacío";
  }
  if (buffer.length > MAX_FILE_SIZE) {
    return "El archivo excede el límite de 2 MB";
  }
  return null;
}

function getFileBuffer(file) {
  if (!file || !file.content) return Buffer.alloc(0);
  if (Buffer.isBuffer(file.content)) {
    return file.content;
  }
  if (typeof file.content === 'string') {
    return Buffer.from(file.content, 'base64');
  }
  return Buffer.from(file.content);
}

/**
 * Respuesta HTTP estandarizada
 */
function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  };
}
