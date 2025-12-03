const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminGetUserCommand, AdminUpdateUserAttributesCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multipart = require('lambda-multipart-parser');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const config = require('../../config/config');
const permissionsConfig = require('../../config/permissions.json');

const cognitoClient = new CognitoIdentityProviderClient({});
const dynamoDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

const ADMIN_PERMISSIONS = permissionsConfig.PREDEFINED_ROLES?.admin || ['admin.users'];
const GESTOR_PERMISSIONS = permissionsConfig.PREDEFINED_ROLES?.gestor || [];
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[\W_])[A-Za-z\d\W_]{8,}$/;

const response = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body)
});

const mapIndustryToThemeKey = (industry) => {
  if (!industry) return config.personalization.parameters.themeKey.default;
  const normalized = industry.toLowerCase();
  if (normalized === 'deportes') return 'deporte';
  return normalized;
};

const buildDefaultPersonalization = (themeKey) => {
  const defaults = {};
  const paramsConfig = config.personalization.parameters;
  Object.entries(paramsConfig).forEach(([key, cfg]) => {
    defaults[key] = cfg.default;
  });
  defaults.themeKey = themeKey || paramsConfig.themeKey.default;
  return defaults;
};

const uploadAsset = async ({ file, empresaId, type }) => {
  if (!process.env.BRANDING_BUCKET || !file) return null;
  const buffer = getFileBuffer(file);
  if (!buffer.length) return null;
  const cleanName = file.filename ? file.filename.replace(/\s+/g, '-') : `${type}-${Date.now()}.bin`;
  const key = `${empresaId}/branding/${type}-${cleanName}`;

  await s3Client.send(new PutObjectCommand({
    Bucket: process.env.BRANDING_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: file.contentType || 'application/octet-stream'
  }));

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  return `https://${process.env.BRANDING_BUCKET}.s3.${region}.amazonaws.com/${key}`;
};

const savePersonalizationDefaults = async (userSub, personalization) => {
  const puts = Object.entries(personalization).map(([key, value]) =>
    dynamoDocClient.send(new PutCommand({
      TableName: process.env.PARAMETERS_TABLE,
      Item: {
        user_sub: userSub,
        parameter_key: key,
        parameter_value: value
      }
    }))
  );

  await Promise.all(puts);
};

const assignRole = async (email, role, permissions, empresaId) => {
  await dynamoDocClient.send(new PutCommand({
    TableName: process.env.USER_ROLES_TABLE,
    Item: {
      user_email: email,
      role,
      permissions,
      empresaId,
      assigned_at: new Date().toISOString()
    }
  }));
};

module.exports.createAdmin = async (event) => {
  try {
    const parsed = await multipart.parse(event, true);
    const {
      fullName = '',
      email = '',
      password = '',
      passwordConfirm = '',
      companyName = '',
      companyId = '',
      industry = 'hospital'
    } = parsed || {};

    const profilePhoto = (parsed?.files || []).find((file) => file.fieldname === 'profilePhoto');
    const companyLogo = (parsed?.files || []).find((file) => file.fieldname === 'companyLogo');

    const trimmed = {
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      companyName: companyName.trim(),
      companyId: companyId.trim(),
      industry: industry.trim()
    };

    const validationErrors = [];
    if (!trimmed.fullName) validationErrors.push('El nombre completo es obligatorio.');
    if (!trimmed.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email)) {
      validationErrors.push('Debes ingresar un correo válido.');
    }
    if (!password) {
      validationErrors.push('La contraseña es obligatoria.');
    } else {
      if (password.includes(' ')) validationErrors.push('La contraseña no puede contener espacios.');
      if (!PASSWORD_REGEX.test(password)) validationErrors.push('La contraseña no cumple los requisitos mínimos.');
    }
    if (!passwordConfirm || password !== passwordConfirm) {
      validationErrors.push('Las contraseñas deben coincidir.');
    }
    if (!trimmed.companyName) validationErrors.push('El nombre de la empresa es obligatorio.');
    if (!trimmed.companyId) validationErrors.push('El RUT / razón social es obligatorio.');
    if (!trimmed.industry) validationErrors.push('El rubro de la empresa es obligatorio.');

    if (validationErrors.length) {
      return response(400, { ok: false, error: validationErrors.join(' ') });
    }

    const empresaId = `emp-${uuidv4()}`;
    const themeKey = mapIndustryToThemeKey(trimmed.industry);

    const createUserResult = await cognitoClient.send(new AdminCreateUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: trimmed.email,
      UserAttributes: [
        { Name: 'email', Value: trimmed.email },
        { Name: 'name', Value: trimmed.fullName },
        { Name: 'email_verified', Value: 'true' }
      ],
      DesiredDeliveryMediums: [],
      MessageAction: 'SUPPRESS'
    }));

    await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: trimmed.email,
      Password: password,
      Permanent: true
    }));

    await cognitoClient.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: trimmed.email,
      UserAttributes: [
        { Name: 'custom:empresaId', Value: empresaId }
      ]
    }));

    const adminUser = await cognitoClient.send(new AdminGetUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: trimmed.email
    }));
    const subAttr = adminUser?.UserAttributes?.find((attr) => attr.Name === 'sub');
    const userSub = subAttr?.Value || createUserResult?.User?.Username || trimmed.email;

    await dynamoDocClient.send(new PutCommand({
      TableName: process.env.DB_CATALOGO,
      Item: {
        PK: `EMPRESA#${empresaId}`,
        SK: 'METADATA',
        empresaId,
        nombre: trimmed.companyName,
        rut: trimmed.companyId,
        industry: trimmed.industry,
        ownerEmail: trimmed.email,
        createdAt: new Date().toISOString()
      }
    }));

    await assignRole(trimmed.email, 'admin', ADMIN_PERMISSIONS, empresaId);
    await assignRole(trimmed.email, 'gestor', GESTOR_PERMISSIONS, empresaId);

    const personalization = buildDefaultPersonalization(themeKey);

    if (profilePhoto) {
      const profileUrl = await uploadAsset({ file: profilePhoto, empresaId, type: 'profile-photo' });
      if (profileUrl) {
        personalization['branding.profile_photo'] = profileUrl;
      }
    }

    if (companyLogo) {
      const logoUrl = await uploadAsset({ file: companyLogo, empresaId, type: 'logo' });
      if (logoUrl) {
        personalization['branding.logo'] = logoUrl;
      }
    }

    await savePersonalizationDefaults(userSub, personalization);

    return response(200, {
      ok: true,
      empresaId,
      user: {
        sub: userSub,
        email: trimmed.email
      },
      assignedRoles: ['admin', 'gestor']
    });
  } catch (error) {
    console.error('❌ Error en createAdmin onboarding:', error);
    return response(500, { ok: false, error: 'Error interno al crear el administrador' });
  }
};

function getFileBuffer(file) {
  if (!file || !file.content) return Buffer.alloc(0);
  if (Buffer.isBuffer(file.content)) return file.content;
  if (typeof file.content === 'string') return Buffer.from(file.content, 'base64');
  return Buffer.from(file.content);
}
