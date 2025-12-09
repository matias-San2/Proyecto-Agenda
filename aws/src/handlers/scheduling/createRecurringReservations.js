const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
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

const START_HOUR_BUFFER = 0; // no shift; keep as placeholder for future tz adjustments

function parseWeekday(val) {
  // Accept 0-6 (Sun-Sat) or 1-7 (Mon-Sun). Normalize to 0-6
  if (val >= 1 && val <= 7) return val % 7;
  return val; // assume 0-6 already
}

function combineDateTime(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}`);
}

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

async function putReservation(item) {
  await ddb.send(new PutCommand({ TableName: SCHEDULES_TABLE, Item: item }));
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

    const { resourceId, periodStart, periodEnd, days = [], metadata = {}, title } = body;
    if (!resourceId || !periodStart || !periodEnd || !days.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "resourceId, periodStart, periodEnd y days son requeridos"
        })
      };
    }

    const resource = await getResource(empresaId, resourceId);
    if (!resource) {
      return { statusCode: 404, body: JSON.stringify({ message: "Recurso no encontrado" }) };
    }

    const rules = resource.rules || {};

    const startDate = new Date(`${periodStart}T00:00:00`);
    const endDate = new Date(`${periodEnd}T23:59:59`);
    if (isNaN(startDate) || isNaN(endDate)) {
      return { statusCode: 400, body: JSON.stringify({ message: "Fechas inválidas" }) };
    }

    const toCreate = [];
    const conflicts = [];

    // Precompute days by weekday
    const dayConfigs = days.map((d) => ({
      weekday: parseWeekday(d.weekday),
      startTime: d.startTime,
      endTime: d.endTime,
      bufferMinutes: d.bufferMinutes != null ? d.bufferMinutes : rules.bufferMinutes || 0
    }));

    // Iterate each day in range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const weekday = d.getDay(); // 0=Sun
      const config = dayConfigs.find((c) => c.weekday === weekday);
      if (!config) continue;

      if (!config.startTime || !config.endTime) {
        conflicts.push({ date: dateISO(d), reason: "Falta startTime/endTime" });
        continue;
      }

      const dateKey = localDateKey(d);
      const startDt = combineDateTime(dateKey, config.startTime);
      const endDt = combineDateTime(dateKey, config.endTime);

      const existing = await getReservationsForDay(resourceId, dateKey);
      const filtered = existing.filter((r) => r.status !== "cancelled");

      if (!rules.allowOverbooking && hasConflict(filtered, startDt, endDt, config.bufferMinutes)) {
        conflicts.push({ date: dateKey, start: startDt.toISOString(), end: endDt.toISOString() });
        continue;
      }

      // Guardamos en local-time string (sin Z) para evitar desfase horario
      const startISO = `${dateKey}T${config.startTime}`;
      const endISO = `${dateKey}T${config.endTime}`;

      const item = {
        PK: `RESOURCE#${resourceId}`,
        SK: `TS#${startISO.slice(0, 16)}`,
        empresaId,
        resourceId,
        start: startISO,
        end: endISO,
        durationMinutes: Math.round((endDt - startDt) / 60000),
        bufferMinutes: config.bufferMinutes || 0,
        status: body.status || "booked",
        title: (body.status === "blocked" ? "Bloqueo" : (title || resource.name || resourceId)),
        metadata: metadata || {},
        description: metadata?.description || null,
        createdBy: userEmail || null,
        createdAt: new Date().toISOString(),
        GSI1PK: `ORG#${empresaId}#DATE#${dateKey}`,
        GSI1SK: `RESOURCE#${resourceId}#TS#${startISO.slice(0, 16)}`,
        GSI2PK: `RESOURCE#${resourceId}#DATE#${dateKey}`,
        GSI2SK: `TS#${startISO.slice(0, 16)}`
      };

      toCreate.push(item);
    }

    // Si hay conflictos y no hay confirmación explícita, no crear nada
    if (conflicts.length && !body.confirmIgnoreConflicts) {
      return {
        statusCode: 409,
        body: JSON.stringify({
          message: "Conflictos detectados. Confirma si deseas crear el resto.",
          conflicts
        })
      };
    }

    const created = [];
    for (const item of toCreate) {
      await putReservation(item);
      created.push(item);
    }

    // Notificación de auditoría con resumen
    try {
      if (created.length > 0 || conflicts.length > 0) {
        const notifType = body.status === "blocked" ? "resource_blocked" : "recurring_created";
        await saveNotification({
          empresaId,
          type: notifType,
          userEmail,
          message: `${notifType === "resource_blocked" ? "Bloqueo" : "Reservas recurrentes"} para ${resourceId}: creadas ${created.length}, conflictos ${conflicts.length}`,
          detail: created.map((c) => ({
            fecha: c.start.slice(0, 10),
            horaInicio: c.start.slice(11, 16),
            horaFin: c.end.slice(11, 16),
            box: c.resourceId,
            estado: c.status,
            description: c.description || null
          })),
        });
      }
    } catch (notifyErr) {
      console.warn("⚠️ No se pudo registrar notificación recurrente:", notifyErr.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ created, conflicts })
    };
  } catch (err) {
    console.error("Error en createRecurringReservations:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error creando reservas recurrentes", error: err.message })
    };
  }
};
