const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");
let saveNotification = async () => {};
try {
  saveNotification = require("./notifications").saveNotification;
} catch (e) {
  console.warn("⚠️ No se pudo cargar notifications helper en createResource:", e.message);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const RESOURCES_TABLE = process.env.RESOURCES_TABLE;

module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const claims =
      event.requestContext?.authorizer?.jwt?.claims ||
      event.requestContext?.authorizer?.claims ||
      {};
    const empresaId = claims["custom:empresaId"] || body.empresaId;

    if (!empresaId) {
      return { statusCode: 400, body: JSON.stringify({ message: "empresaId es requerido" }) };
    }

    const resourceId = body.resourceId || randomUUID();
    const item = {
      PK: `ORG#${empresaId}`,
      SK: `RESOURCE#${resourceId}`,
      empresaId,
      resourceId,
      type: body.type,
      name: body.name,
      location: body.location || null,
      capacity: body.capacity || null,
      rules: body.rules || {},
      tags: body.tags || [],
      GSI1PK: `TYPE#${body.type || "unknown"}#ORG#${empresaId}`,
      GSI1SK: body.name || resourceId
    };

    await ddb.send(new PutCommand({ TableName: RESOURCES_TABLE, Item: item }));

    try {
      await saveNotification({
        empresaId,
        type: "resource_created",
        userEmail: claims.email || claims["cognito:username"],
        message: `Recurso creado: ${item.name || item.resourceId}`,
        detail: item
      });
    } catch (notifyErr) {
      console.warn("⚠️ No se pudo registrar notificación de recurso:", notifyErr.message);
    }

    return { statusCode: 201, body: JSON.stringify(item) };
  } catch (err) {
    console.error("Error en createResource:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error creando recurso", error: err.message })
    };
  }
};
