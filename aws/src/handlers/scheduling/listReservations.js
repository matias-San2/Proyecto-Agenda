const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SCHEDULES_TABLE = process.env.SCHEDULES_TABLE;

module.exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const claims =
      event.requestContext?.authorizer?.jwt?.claims ||
      event.requestContext?.authorizer?.claims ||
      {};
    const empresaId = claims["custom:empresaId"] || qs.empresaId;
    const date = qs.date; // YYYY-MM-DD
    const resourceId = qs.resourceId || null;

    if (!empresaId || !date) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "empresaId y date (YYYY-MM-DD) son requeridos" })
      };
    }

    let items = [];

    if (resourceId) {
      const resp = await ddb.send(
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
      items = resp.Items || [];
    } else {
      const resp = await ddb.send(
        new QueryCommand({
          TableName: SCHEDULES_TABLE,
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `ORG#${empresaId}#DATE#${date}`,
            ":sk": "RESOURCE#"
          }
        })
      );
      items = resp.Items || [];
    }

    return { statusCode: 200, body: JSON.stringify(items) };
  } catch (err) {
    console.error("Error en listReservations:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error listando reservas", error: err.message })
    };
  }
};
