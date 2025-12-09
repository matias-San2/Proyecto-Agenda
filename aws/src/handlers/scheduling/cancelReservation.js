const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
let saveNotification = async () => {};
try {
  saveNotification = require("./notifications").saveNotification;
} catch (e) {
  console.warn("⚠️ No se pudo cargar notifications helper en cancelReservation:", e.message);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SCHEDULES_TABLE = process.env.SCHEDULES_TABLE;

module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { PK, SK } = body;
    const claims =
      event.requestContext?.authorizer?.jwt?.claims ||
      event.requestContext?.authorizer?.claims ||
      {};
    const userEmail = claims.email || claims["cognito:username"];
    const empresaId = claims["custom:empresaId"] || body.empresaId;

    if (!PK || !SK) {
      return { statusCode: 400, body: JSON.stringify({ message: "PK y SK son requeridos" }) };
    }

    // Obtener para metadata y empresaId
    const existing = await ddb.send(
      new GetCommand({
        TableName: SCHEDULES_TABLE,
        Key: { PK, SK }
      })
    );

    if (!existing.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: "Reserva no encontrada" }) };
    }

    await ddb.send(
      new UpdateCommand({
        TableName: SCHEDULES_TABLE,
        Key: { PK, SK },
        UpdateExpression: "SET #s = :c, cancelledAt = :now, cancelledBy = :u",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":c": "cancelled",
          ":now": new Date().toISOString(),
          ":u": userEmail || "system"
        }
      })
    );

    try {
      await saveNotification({
        empresaId: empresaId || existing.Item.empresaId,
        type: "reservation_cancelled",
        userEmail,
        message: `Reserva cancelada ${PK}/${SK}`,
        detail: existing.Item
      });
    } catch (notifyErr) {
      console.warn("⚠️ No se pudo registrar notificación de cancelación:", notifyErr.message);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("Error en cancelReservation:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error cancelando reserva", error: err.message })
    };
  }
};
