const { CognitoIdentityProviderClient, ListUsersCommand, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient, QueryCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { ensureAdminAccess } = require('../personalization/personalization');

const response = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

module.exports.deleteTenant = async (event) => {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  if (!claims.email || !claims.sub) {
    return response(401, { ok: false, error: 'Usuario no autenticado' });
  }

  const hasAdminAccess = await (ensureAdminAccess ? ensureAdminAccess(claims.email) : Promise.resolve(false));
  if (!hasAdminAccess) {
    return response(403, { ok: false, error: 'Solo superadministradores pueden eliminar un tenant' });
  }

  const bodyEmpresaId = (() => {
    if (!event?.body) return undefined;
    try {
      const parsed = JSON.parse(event.body);
      return parsed?.empresaId;
    } catch (err) {
      return undefined;
    }
  })();

  const empresaId =
    event?.pathParameters?.empresaId ||
    event?.queryStringParameters?.empresaId ||
    bodyEmpresaId;

  if (!empresaId) {
    return response(400, { ok: false, error: 'Debe incluir empresaId' });
  }

  const cognito = new CognitoIdentityProviderClient({});
  const users = [];
  let nextToken;

  do {
    const listResponse = await cognito.send(new ListUsersCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Filter: `custom:empresaId = "${empresaId}"`,
      PaginationToken: nextToken
    }));

    if (listResponse?.Users?.length) {
      users.push(...listResponse.Users);
    }
    nextToken = listResponse?.PaginationToken;
  } while (nextToken);

  for (const user of users) {
    const username = user?.Username;
    if (!username) continue;
    try {
      await cognito.send(new AdminDeleteUserCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: username
      }));
      console.log(`[deleteTenant] Usuario eliminado: ${username}`);
    } catch (error) {
      console.error(`[deleteTenant] Error eliminando usuario ${username}:`, error);
    }
  }

  const dynamo = new DynamoDBClient({});

  const rolesQuery = await dynamo.send(new QueryCommand({
    TableName: process.env.USER_ROLES_TABLE,
    IndexName: 'empresaId-index',
    KeyConditionExpression: 'empresaId = :eid',
    ExpressionAttributeValues: {
      ':eid': { S: empresaId }
    }
  }));

  for (const item of rolesQuery?.Items || []) {
    const userEmail = item?.user_email?.S;
    if (!userEmail) continue;
    try {
      await dynamo.send(new DeleteItemCommand({
        TableName: process.env.USER_ROLES_TABLE,
        Key: {
          user_email: { S: userEmail }
        }
      }));
      console.log(`[deleteTenant] Rol eliminado: ${userEmail}`);
    } catch (error) {
      console.error(`[deleteTenant] Error eliminando rol ${userEmail}:`, error);
    }
  }

  const paramsQuery = await dynamo.send(new QueryCommand({
    TableName: process.env.PARAMETERS_TABLE,
    IndexName: 'empresaId-index',
    KeyConditionExpression: 'empresaId = :eid',
    ExpressionAttributeValues: {
      ':eid': { S: empresaId }
    }
  }));

  for (const item of paramsQuery?.Items || []) {
    const userSub = item?.user_sub?.S;
    const parameterKey = item?.parameter_key?.S;
    if (!userSub || !parameterKey) continue;
    try {
      await dynamo.send(new DeleteItemCommand({
        TableName: process.env.PARAMETERS_TABLE,
        Key: {
          user_sub: { S: userSub },
          parameter_key: { S: parameterKey }
        }
      }));
      console.log(`[deleteTenant] Parámetro eliminado: ${parameterKey}`);
    } catch (error) {
      console.error(`[deleteTenant] Error eliminando parámetro ${parameterKey}:`, error);
    }
  }

  const s3 = new S3Client({});
  const bucket = process.env.BRANDING_BUCKET;
  const prefix = `${empresaId}/branding/`;

  if (bucket) {
    let continuationToken;
    do {
      const listResult = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      }));

      const objects = listResult?.Contents || [];
      if (objects.length) {
        await s3.send(new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.map((obj) => ({ Key: obj.Key }))
          }
        }));

        objects.forEach((obj) => {
          if (obj.Key) {
            console.log(`[deleteTenant] Archivo eliminado: ${obj.Key}`);
          }
        });
      }

      continuationToken = listResult?.NextContinuationToken;
    } while (continuationToken);
  }

  const catalogTable = process.env.DB_CATALOGO_TABLE || process.env.DB_CATALOGO;
  if (catalogTable) {
    const catalogPk = `EMPRESA#${empresaId}`;
    let lastEvaluatedKey;
    do {
      const catalogQuery = await dynamo.send(new QueryCommand({
        TableName: catalogTable,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: catalogPk }
        },
        ExclusiveStartKey: lastEvaluatedKey
      }));

      for (const item of catalogQuery?.Items || []) {
        const pk = item?.PK?.S;
        const sk = item?.SK?.S;
        if (!pk || !sk) continue;

        try {
          await dynamo.send(new DeleteItemCommand({
            TableName: catalogTable,
            Key: {
              PK: { S: pk },
              SK: { S: sk }
            }
          }));
          console.log(`[deleteTenant] Catálogo eliminado: ${pk} / ${sk}`);
        } catch (error) {
          console.error(`[deleteTenant] Error eliminando catálogo ${pk} / ${sk}:`, error);
        }
      }

      lastEvaluatedKey = catalogQuery?.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  }

  return response(200, { ok: true, message: 'deleteTenant() placeholder' });
};
