// aws/scripts/seed.js
const { DynamoDB } = require("@aws-sdk/client-dynamodb");
const { marshall } = require("@aws-sdk/util-dynamodb");
// --- CONFIGURACIÓN --- // 
const REGION = "us-east-1";
 // Confirma que esta es tu región 
 const USER_ROLES_TABLE = "aws-cognito-jwt-login-dev-user-roles"; 
 // ¡Verifica que este sea el nombre exacto de tu tabla!

const SUPER_ADMIN_USER = { user_email: "admin@incodefy.com", // El email de tu usuario en Cognito 
                            role: "admin",
                            empresaId: "HOSPITAL_01", // El ID de tu primera "empresa" 
                            assigned_at: new Date().toISOString(),
                            permissions: [ "dashboard.read", "dashboard.write", "agenda.read", "agenda.write", "box.read", "box.write", "box.detalle.read", "box.detalle.write", "data.import", "data.export", "medicos.read", "notificaciones.read", "notificaciones.historial", "admin.users" ] }; // --------------------

const dynamoDb = new DynamoDB({ region: REGION });

async function seedDatabase() { console.log(`Intentando sembrar usuario en: ${USER_ROLES_TABLE}`);

const params = {
    TableName: USER_ROLES_TABLE,
    Item: marshall(SUPER_ADMIN_USER)
};
try {
    await dynamoDb.putItem(params);
    console.log("✅ ¡Éxito! Super-admin creado/actualizado.");
} catch (err) {
    console.error("❌ Error al sembrar la base de datos:", err);
}
}

seedDatabase();