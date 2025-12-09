const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { hasConflict } = require("./validation");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const RESOURCES_TABLE = process.env.RESOURCES_TABLE;
const SCHEDULES_TABLE = process.env.SCHEDULES_TABLE;

function getDayKey(dateStr) {
  const day = new Date(dateStr + "T00:00:00").getDay(); // local day
  return ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][day];
}

function parseRanges(hoursByDay, dayKey) {
  const ranges = hoursByDay?.[dayKey] || [];
  return ranges
    .map((h) => h.split("-"))
    .filter((parts) => parts.length === 2);
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + (m || 0);
}

function toDateLocal(dateStr, minutesFromMidnight) {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  dt.setMinutes(minutesFromMidnight);
  return dt;
}

module.exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const claims =
      event.requestContext?.authorizer?.jwt?.claims ||
      event.requestContext?.authorizer?.claims ||
      {};
    const empresaId = claims["custom:empresaId"] || qs.empresaId;
    const resourceId = qs.resourceId;
    const date = qs.date; // YYYY-MM-DD
    const durationMinutes = qs.durationMinutes ? parseInt(qs.durationMinutes, 10) : null;
    const bufferMinutes = qs.bufferMinutes ? parseInt(qs.bufferMinutes, 10) : null;

    if (!empresaId || !resourceId || !date) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "empresaId, resourceId y date son requeridos" })
      };
    }

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
    const slotDuration = durationMinutes || rules.baseDurationMinutes || 60;
    const slotBuffer = bufferMinutes != null ? bufferMinutes : rules.bufferMinutes || 0;
    const dayKey = getDayKey(date);
    const ranges = parseRanges(rules.hoursByDay || {}, dayKey);

    if (!ranges.length) {
      return { statusCode: 200, body: JSON.stringify({ slots: [], reason: "Sin horario para el día" }) };
    }

    const schedulesResp = await ddb.send(
      new QueryCommand({
        TableName: SCHEDULES_TABLE,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk AND begins_with(GSI2SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `RESOURCE#${resourceId}#DATE#${date}`,
          ":sk": "TS#"
        }
      })
    );
    const existing = (schedulesResp.Items || []).filter((r) => r.status !== "cancelled");

    const slots = [];

    for (const [startStr, endStr] of ranges) {
      const rangeStart = toMinutes(startStr);
      const rangeEnd = toMinutes(endStr);
      let cursor = rangeStart;

      while (cursor + slotDuration <= rangeEnd) {
        const slotStart = toDateLocal(date, cursor);
        const slotEnd = toDateLocal(date, cursor + slotDuration);

        if (!hasConflict(existing, slotStart, slotEnd, slotBuffer)) {
          slots.push({
            start: slotStart.toISOString().replace("Z", ""),
            end: slotEnd.toISOString().replace("Z", ""),
            durationMinutes: slotDuration,
            bufferMinutes: slotBuffer
          });
        }

        cursor += slotDuration + slotBuffer;
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ slots })
    };
  } catch (err) {
    console.error("Error en listTimeslots:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error obteniendo timeslots", error: err.message })
    };
  }
};
