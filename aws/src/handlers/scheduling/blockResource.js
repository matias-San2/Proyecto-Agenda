const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { hasConflict } = require("./validation");
let saveNotification = async () => {};
try {
  saveNotification = require("./notifications").saveNotification;
} catch (e) {
  console.warn("⚠️ No se pudo cargar notifications helper en blockResource:", e.message);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const RESOURCES_TABLE = process.env.RESOURCES_TABLE;
const SCHEDULES_TABLE = process.env.SCHEDULES_TABLE;

function pad(n) {
  return n.toString().padStart(2, "0");
}
function localDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function getResource(empresaId, resourceId) {
  const res = await ddb.send(
    new GetCommand({
      TableName: RESOURCES_TABLE,
      Key: { PK: `ORG#${empresaId}`, SK: `RESOURCE#${resourceId}` }
    })
  );
  return res.Item;
}

async function getReservationsForDay(resourceId, dateKey) {
  const resp = await ddb.send(
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
  return resp.Items || [];
}

module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const claims =
      event.requestContext?.authorizer?.jwt?.claims ||
      event.requestContext?.authorizer?.claims ||
      {};
    const empresaId = claims["custom:empresaId"] || body.empresaId;
    const resourceId = body.resourceId;
    const start = body.start;
    const end = body.end;
    const description = body.description || "";
    const confirmIgnoreConflicts = body.confirmIgnoreConflicts || false;

    if (!empresaId || !resourceId || !start || !end) {
      return { statusCode: 400, body: JSON.stringify({ message: "empresaId, resourceId, start y end son requeridos" }) };
    }

    const res = await getResource(empresaId, resourceId);
    if (!res) {
      return { statusCode: 404, body: JSON.stringify({ message: "Recurso no encontrado" }) };
    }

    const startDt = new Date((start || "").replace("Z", ""));
    const endDt = new Date((end || "").replace("Z", ""));
    if (isNaN(startDt) || isNaN(endDt) || endDt <= startDt) {
      return { statusCode: 400, body: JSON.stringify({ message: "Rango de fechas inválido" }) };
    }

    const dayKeys = [];
    const cursor = new Date(startDt);
    while (cursor <= endDt) {
      dayKeys.push(localDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const toCreate = [];
    const conflicts = [];

    for (let i = 0; i < dayKeys.length; i++) {
      const day = dayKeys[i];
      const isFirst = i === 0;
      const isLast = i === dayKeys.length - 1;
      const startTime = isFirst ? `${pad(startDt.getHours())}:${pad(startDt.getMinutes())}` : "00:00";
      const endTime = isLast ? `${pad(endDt.getHours())}:${pad(endDt.getMinutes())}` : "23:59";

      const startBlock = new Date(`${day}T${startTime}`);
      const endBlock = new Date(`${day}T${endTime}`);

      const existing = await getReservationsForDay(resourceId, day);
      const filtered = existing.filter((r) => r.status !== "cancelled");

      if (hasConflict(filtered, startBlock, endBlock, 0)) {
        conflicts.push({ date: day, start: startBlock.toISOString(), end: endBlock.toISOString() });
        continue;
      }

      const startISO = `${day}T${startTime}`;
      const endISO = `${day}T${endTime}`;

      toCreate.push({
        PK: `RESOURCE#${resourceId}`,
        SK: `TS#${startISO.slice(0, 16)}`,
        empresaId,
        resourceId,
        start: startISO,
        end: endISO,
        durationMinutes: Math.round((endBlock - startBlock) / 60000),
        bufferMinutes: 0,
        status: "blocked",
        title: "Bloqueo",
        metadata: { description, bloqueado: true },
        description,
        createdBy: claims.email || claims["cognito:username"] || null,
        createdAt: new Date().toISOString(),
        GSI1PK: `ORG#${empresaId}#DATE#${day}`,
        GSI1SK: `RESOURCE#${resourceId}#TS#${startISO.slice(0, 16)}`,
        GSI2PK: `RESOURCE#${resourceId}#DATE#${day}`,
        GSI2SK: `TS#${startISO.slice(0, 16)}`
      });
    }

    if (conflicts.length && !confirmIgnoreConflicts) {
      return { statusCode: 409, body: JSON.stringify({ message: "Conflictos detectados", conflicts }) };
    }

    const created = [];
    for (const item of toCreate) {
      await ddb.send(new PutCommand({ TableName: SCHEDULES_TABLE, Item: item }));
      created.push(item);
    }

    try {
      await saveNotification({
        empresaId,
        type: "resource_blocked",
        userEmail: claims.email || claims["cognito:username"],
        message: `Recurso bloqueado: ${resourceId} (${localDateKey(startDt)} - ${localDateKey(endDt)})`,
        detail: created
      });
    } catch (notifyErr) {
      console.warn("⚠️ No se pudo registrar notificación de bloqueo:", notifyErr.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ created, conflicts })
    };
  } catch (err) {
    console.error("Error en blockResource:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Error bloqueando recurso", error: err.message }) };
  }
};
