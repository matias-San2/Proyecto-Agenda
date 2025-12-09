const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.DB_NOTIFICACION;

/**
 * Guarda una notificación de auditoría en DynamoDB.
 * Pensada para agenda y recursos.
 */
async function saveNotification({ empresaId, type, message, detail, userEmail }) {
  if (!TABLE) {
    console.warn("⚠️ DB_NOTIFICACION no definido, se omite notificación.");
    return;
  }

  const ts = new Date().toISOString();
  const id = `NOTI#${Date.now()}`;

  const item = {
    PK: `ORG#${empresaId || "default"}`,
    SK: id,
    GSI1PK: `TYPE#${type}`,
    GSI1SK: ts,
    id,
    tipo: "audit",
    descripcion: message,
    detalle: detail || null,
    fecha: ts,
    userEmail: userEmail || null
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE,
      Item: item
    })
  );

  console.log(`[notifications] Guardada notificación audit en ${TABLE}`, { id, type, empresaId, ts });
  return item;
}

module.exports = { saveNotification };
