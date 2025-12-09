const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { hasConflict } = require("./validation");
let saveNotification = async () => {};
try {
  saveNotification = require("./notifications").saveNotification;
} catch (e) {
  console.warn("⚠️ No se pudo cargar notifications helper, se omite auditoría:", e.message);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const RESOURCES_TABLE = process.env.RESOURCES_TABLE;
const SCHEDULES_TABLE = process.env.SCHEDULES_TABLE;

function pad(n) {
  return n.toString().padStart(2, "0");
}

function getLocalDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalTimeString(date) {
  return `${getLocalDateKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const claims =
      event.requestContext?.authorizer?.jwt?.claims ||
      event.requestContext?.authorizer?.claims ||
      {};
    const empresaId = claims["custom:empresaId"] || body.empresaId;
    const userEmail = claims.email || claims["cognito:username"];

    if (!empresaId) {
      return { statusCode: 400, body: JSON.stringify({ message: "empresaId requerido" }) };
    }

    const { resourceId, start, end, durationMinutes, bufferMinutes, title, metadata } = body;
    if (!resourceId || !start || (!end && !durationMinutes)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "resourceId, start y end o durationMinutes son requeridos" })
      };
    }

    const startDate = new Date((start || "").replace("Z", ""));
    const finalEndDate = end ? new Date((end || "").replace("Z", "")) : new Date(startDate.getTime() + durationMinutes * 60 * 1000);
    const dateKey = getLocalDateKey(startDate);

    const resourceResp = await ddb.send(
      new GetCommand({
        TableName: RESOURCES_TABLE,
        Key: { PK: `ORG#${empresaId}`, SK: `RESOURCE#${resourceId}` }
      })
    );
    if (!resourceResp.Item) {
      return { statusCode: 404, body: JSON.stringify({ message: "Recurso no encontrado" }) };
    }

    const rules = resourceResp.Item.rules || {};
    const effectiveBuffer = bufferMinutes != null ? bufferMinutes : rules.bufferMinutes || 0;

    // TODO: validar horarios según rules.hoursByDay si se requiere

    const schedulesResp = await ddb.send(
      new QueryCommand({
        TableName: SCHEDULES_TABLE,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk AND begins_with(GSI2SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `RESOURCE#${resourceId}#DATE#${dateKey}`,
          ":sk": "TS#"
        }
      })
    );
    const existing = (schedulesResp.Items || []).filter((r) => r.status !== "cancelled");

    if (!rules.allowOverbooking && hasConflict(existing, startDate, finalEndDate, effectiveBuffer)) {
      return { statusCode: 409, body: JSON.stringify({ message: "Conflicto de horario para este recurso" }) };
    }

    const startISO = toLocalTimeString(startDate);
    const endISO = toLocalTimeString(finalEndDate);

    const item = {
      PK: `RESOURCE#${resourceId}`,
      SK: `TS#${startISO.slice(0, 16)}`,
      empresaId,
      resourceId,
      start: startISO,
      end: endISO,
      durationMinutes: Math.round((finalEndDate - startDate) / 60000),
      bufferMinutes: effectiveBuffer,
      status: "booked",
      title: title || null,
      metadata: metadata || {},
      description: metadata?.description || null,
      createdBy: userEmail || null,
      createdAt: new Date().toISOString(),
      GSI1PK: `ORG#${empresaId}#DATE#${dateKey}`,
      GSI1SK: `RESOURCE#${resourceId}#TS#${startISO.slice(0, 16)}`,
      GSI2PK: `RESOURCE#${resourceId}#DATE#${dateKey}`,
      GSI2SK: `TS#${startISO.slice(0, 16)}`
    };

    await ddb.send(new PutCommand({ TableName: SCHEDULES_TABLE, Item: item }));

    // Registrar en notificaciones (auditoría)
    try {
      await saveNotification({
        empresaId,
        type: "reservation_created",
        userEmail,
        message: `Reserva creada para ${resourceId} el ${dateKey} ${startISO.slice(11, 16)}-${endISO.slice(11, 16)}`,
        detail: [
          {
            fecha: dateKey,
            horaInicio: startISO.slice(11, 16),
            horaFin: endISO.slice(11, 16),
            box: resourceId,
            medico: metadata?.trabajadorNombre || metadata?.trabajadorId || userEmail || "-",
            estado: "creada",
            tipoconsulta: metadata?.tipo || "agenda",
          },
        ],
      });
    } catch (notifyErr) {
      console.warn("⚠️ No se pudo registrar notificación de auditoría:", notifyErr.message);
    }

    return { statusCode: 201, body: JSON.stringify(item) };
  } catch (err) {
    console.error("Error en createReservation:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error creando reserva", error: err.message })
    };
  }
};
