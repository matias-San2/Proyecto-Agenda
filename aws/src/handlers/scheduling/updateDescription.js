const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SCHEDULES_TABLE = process.env.SCHEDULES_TABLE;

module.exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { PK, SK, description } = body;
    if (!PK || !SK) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "PK y SK son requeridos" })
      };
    }

    await ddb.send(
      new UpdateCommand({
        TableName: SCHEDULES_TABLE,
        Key: { PK, SK },
        UpdateExpression: "SET description = :d",
        ExpressionAttributeValues: {
          ":d": description || ""
        }
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };
  } catch (err) {
    console.error("Error en updateDescription:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error actualizando descripción", error: err.message })
    };
  }
};
