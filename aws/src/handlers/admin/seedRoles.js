const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const fs = require('fs');
const path = require('path');

const permissionsPath = path.join(__dirname, '../../config/permissions.json');

const response = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

module.exports.seedRoles = async () => {
  try {
    if (!fs.existsSync(permissionsPath)) {
      return response(500, { ok: false, error: 'permissions.json no existe' });
    }

    const permissionsData = JSON.parse(fs.readFileSync(permissionsPath, 'utf-8'));
    const predefinedRoles = permissionsData.PREDEFINED_ROLES || {};

    if (!process.env.ROLES_BASE_TABLE) {
      return response(500, { ok: false, error: 'ROLES_BASE_TABLE no configurada' });
    }

    const dynamo = new DynamoDBClient({});
    const inserted = [];

    for (const [roleKey, perms] of Object.entries(predefinedRoles)) {
      const existing = await dynamo.send(new GetItemCommand({
        TableName: process.env.ROLES_BASE_TABLE,
        Key: { role_key: { S: roleKey } }
      }));

      if (!existing.Item) {
        await dynamo.send(new PutItemCommand({
          TableName: process.env.ROLES_BASE_TABLE,
          Item: {
            role_key: { S: roleKey },
            role: { S: roleKey },
            empresaId: { S: 'global' },
            permissions: { SS: perms }
          }
        }));
        inserted.push(roleKey);
      }
    }

    return response(200, { ok: true, inserted });
  } catch (error) {
    console.error('Error en seedRoles:', error);
    return response(500, { ok: false, error: error.message });
  }
};

module.exports.run = async () => {
  return module.exports.seedRoles();
};
