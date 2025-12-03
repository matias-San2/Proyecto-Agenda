// scripts/run-seed.js
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

(async () => {
  const client = new LambdaClient({ region: process.env.AWS_REGION || "us-east-1" });

  // Nombre EXACTO de la función Lambda
  const service = process.env.SERVICE_NAME || "aws-cognito-jwt-login";
  const stage = process.env.STAGE || "dev";

  const funcName = `${service}-${stage}-seedRoles`;

  try {
    console.log(`Running seedRoles on Lambda: ${funcName}`);

    const command = new InvokeCommand({
      FunctionName: funcName,
      InvocationType: "RequestResponse"
    });

    const result = await client.send(command);
    console.log("seedRoles executed successfully.");
    console.log("Lambda Output:", Buffer.from(result.Payload).toString());
  } catch (err) {
    console.error("Error running seedRoles:", err);
  }
})();
