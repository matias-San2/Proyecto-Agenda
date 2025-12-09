const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const RESOURCES_TABLE = process.env.RESOURCES_TABLE;

module.exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const claims =
      event.requestContext?.authorizer?.jwt?.claims ||
      event.requestContext?.authorizer?.claims ||
      {};
    const empresaId = claims["custom:empresaId"] || qs.empresaId;

    if (!empresaId) {
      return { statusCode: 400, body: JSON.stringify({ message: "empresaId es requerido" }) };
    }

    const params = {
      TableName: RESOURCES_TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": `ORG#${empresaId}`,
        ":sk": "RESOURCE#"
      }
    };

    const result = await ddb.send(new QueryCommand(params));
    return { statusCode: 200, body: JSON.stringify(result.Items || []) };
  } catch (err) {
    console.error("Error en listResources:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error listando recursos", error: err.message })
    };
  }
};
