const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { CognitoIdentityProviderClient, InitiateAuthCommand } = require("@aws-sdk/client-cognito-identity-provider");
let saveNotification = async () => {};
try {
  saveNotification = require("./notifications").saveNotification;
} catch (e) {
  console.warn("⚠️ No se pudo cargar notifications helper en deleteResource:", e.message);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cognito = new CognitoIdentityProviderClient({});
const RESOURCES_TABLE = process.env.RESOURCES_TABLE;

async function validatePassword(username, password) {
  if (!process.env.USER_POOL_CLIENT_ID) {
    throw new Error("USER_POOL_CLIENT_ID no configurado");
  }
  const cmd = new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: process.env.USER_POOL_CLIENT_ID,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password
    }
  });
  await cognito.send(cmd);
  return true;
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
    const password = body.password;

    if (!empresaId || !resourceId) {
      return { statusCode: 400, body: JSON.stringify({ message: "empresaId y resourceId son requeridos" }) };
    }
    if (!password) {
      return { statusCode: 400, body: JSON.stringify({ message: "Se requiere contraseña para eliminar" }) };
    }

    try {
      const username = claims.email || claims["cognito:username"];
      await validatePassword(username, password);
    } catch (authErr) {
      console.warn("❌ Validación de contraseña falló:", authErr.message);
      return { statusCode: 401, body: JSON.stringify({ message: "Contraseña inválida" }) };
    }

    await ddb.send(
      new DeleteCommand({
        TableName: RESOURCES_TABLE,
        Key: { PK: `ORG#${empresaId}`, SK: `RESOURCE#${resourceId}` },
        ConditionExpression: "attribute_exists(PK)"
      })
    );

    try {
      await saveNotification({
        empresaId,
        type: "resource_deleted",
        userEmail: claims.email || claims["cognito:username"],
        message: `Recurso eliminado: ${resourceId}`,
        detail: { resourceId }
      });
    } catch (notifyErr) {
      console.warn("⚠️ No se pudo registrar notificación de eliminación:", notifyErr.message);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("Error en deleteResource:", err);
    return { statusCode: 500, body: JSON.stringify({ message: "Error eliminando recurso", error: err.message }) };
  }
};
