# ☁️ Terraform — Chaos Engine 

Infraestructura **serverless** para el motor de Chaos Engineering del sistema de agendamiento. Provisiona Lambda, API Gateway HTTP, DynamoDB, SNS y alarmas de CloudWatch con nombres parametrizados por proyecto/stage.

---

## 🏗️ Arquitectura generada
- **Lambda**: función Chaos Engine (zip en `../aws/src/handlers/chaos/engine.zip` por defecto) con variables `AWS_REGION`, `STAGE`, `PARAMETERS_TABLE` y rol IAM mínimo para acceder a la tabla.
- **API Gateway HTTP**: stage `<stage>` con `auto_deploy = true` y rutas:
  - `ANY /chaos`
  - `GET /chaos-latency`
  - `GET /chaos-failure`
  - `GET /health`
- **DynamoDB**: tabla de parámetros `<project>-<stage>-parameters` (hash `id`, modo PAY_PER_REQUEST).
- **SNS + Alarmas**: tópico `<project>-<stage>-chaos-alerts`, subscripción email, alarma de duración de Lambda (> umbral configurable) enviando a SNS.

### Dependencias y flujo
- API Gateway integra por proxy a la Lambda y tiene permiso explícito para invocarla.
- La Lambda consume DynamoDB usando política acotada a la tabla y expone el nombre vía variable de entorno.
- CloudWatch monitorea la duración de la Lambda y publica en SNS; el email definido recibe las alertas.

---

## 📁 Módulos
- `modules/dynamodb`: crea la tabla de parámetros (nombre parametrizable, tags heredadas).
- `modules/lambda`: rol IAM con permisos mínimos a la tabla, log group con retención, Lambda Chaos Engine con opcional concurrencia reservada.
- `modules/api`: API HTTP, integración proxy, rutas requeridas y stage con autodespliegue; permiso Lambda para API.
- `modules/monitoring`: SNS, subscripción email y alarma de duración de Lambda.
- `main.tf`: orquesta módulos, deriva nombres (`project_name` + `stage`) y tags comunes.

---

## ⚙️ Variables principales (ver `variables.tf`)
- `project_name` (string, default `hpp-chaos`): prefijo de nombres.
- `stage` (string, default `dev`): sufijo de nombres y stage de API.
- `region` (string, default `us-east-1`): región de despliegue.
- `lambda_package_path` (string, default `../aws/src/handlers/chaos/engine.zip`): zip de la Lambda.
- `lambda_handler` (string, default `engine.handler`), `lambda_runtime` (string, default `nodejs20.x`), `lambda_reserved_concurrency` (number|null), `lambda_log_retention_days` (number, default 14).
- `dynamodb_table_name` (string, default vacío): si se define, reemplaza el nombre derivado.
- `alerts_email` (**string, requerido**): email para suscripción SNS.
- `duration_alarm_threshold_ms` (number, default 4000): umbral de duración de la Lambda.
- `tags` (map(string), default `{}`): tags adicionales aplicadas a todos los recursos.

Ejemplo de variables vía CLI:
```bash
terraform plan \
  -var="alerts_email=tu@correo.com" \
  -var="stage=qa" \
  -var="lambda_package_path=../aws/src/handlers/chaos/engine.zip"
```

---

## 🚀 Ejecución
1) **Init**  
```bash
cd terraform
terraform init
```
2) **Plan** (requiere email):  
```bash
terraform plan -var="alerts_email=tu@correo.com"
```
3) **Apply**  
```bash
terraform apply -auto-approve -var="alerts_email=tu@correo.com"
```

Salidas útiles (`outputs.tf`):
- `api_endpoint`: URL base del HTTP API.
- `lambda_function_name`: nombre de la Lambda.
- `dynamodb_table_name` y `dynamodb_table_arn`.
- `sns_topic_arn`.

Pruebas rápidas (tras el apply):
```bash
curl "$api_endpoint/chaos"
curl "$api_endpoint/chaos-latency"
curl "$api_endpoint/chaos-failure"
curl "$api_endpoint/health"
```

---

## ✅ Buenas prácticas aplicadas
- **Módulos reutilizables** por recurso (API, Lambda, DynamoDB, monitoring).
- **Nombres parametrizados** (`project_name` + `stage`) y tags consistentes.
- **Principio de menor privilegio**: política IAM limitada a la tabla DynamoDB objetivo.
- **API Gateway con stage gestionado** y `auto_deploy` para evitar rutas sin publicar.
- **Observabilidad mínima**: log group con retención, alarma de duración y notificación vía SNS.
- **Variables explícitas** para paths, handler, runtime y umbrales, facilitando CI/CD y múltiples entornos.

---

## 🧹 Limpieza
```bash
terraform destroy -auto-approve -var="alerts_email=tu@correo.com"
```

