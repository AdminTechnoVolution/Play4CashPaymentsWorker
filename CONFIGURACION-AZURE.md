# Configurar P4C y su trabajador de pagos en Azure, paso a paso

Esta guía describe el código preparado. **No se creó ni se modificó ningún recurso de tu cuenta Azure. No se habilitaron pagos reales.**

Las plantillas `.env.example` están organizadas en **valores listos para copiar** y **tus datos**, que aparecen vacíos. Los interruptores de depósitos y retiros están en `true` para probar ambos en sandbox: completar primero API key, URL IPN y credenciales de payouts. Para arrancar antes de tener esas credenciales, poner ambos interruptores en `false` en API y worker; para probar solo depósitos, dejar retiros en `false` en ambos. No hay que copiar puertos locales ni inventar dominios de ejemplo.

## 1. Qué es cada carpeta y dónde se despliega

| Carpeta | Aplicación en Azure | Para qué sirve |
| --- | --- | --- |
| Play4CashApi | Tu App Service actual de API | Recibe solicitudes de jugadores y notificaciones de NOWPayments; guarda operaciones en MongoDB. |
| Play4CashPaymentsWorker | Un App Service nuevo, por ejemplo `p4c-payments-worker` | Lee operaciones guardadas y procesa pagos/conciliaciones en segundo plano. |
| Play4CashGateway | Tu aplicación pública actual del gateway | Conduce tráfico hacia la API y aporta evidencia geográfica confiable. |
| Play4CashPWA | Tu web actual de jugadores | Interfaz del jugador. |
| Play4CashAdmin | Tu web actual de administración | Revisión y aprobación de operaciones. |

Ahora **NO despliegas la carpeta Play4CashApi dos veces**. Al nuevo App Service subes únicamente Play4CashPaymentsWorker. Tiene su propio package.json, dependencias, código incluido y comando `npm start`. Ambos proyectos usan la misma base MongoDB; eso permite que uno guarde una solicitud y el otro la encuentre. No se llaman por una URL entre ellos.

Un App Service es la aplicación que ejecuta código. Un App Service Plan es la capacidad de servidores que la aloja. El nuevo App Service puede compartir un plan compatible existente si tiene capacidad; no es obligatorio crear otro plan. Revisa capacidad y precio antes de crearlo. El worker debe permanecer encendido mediante Always On; usa un plan que lo permita.

## 2. Qué significa configurar una variable

1. Entra a https://portal.azure.com y abre **App Services**.
2. Abre la aplicación correcta: por ejemplo, el App Service de la API.
3. Busca **Settings / Configuración → Environment variables / Variables de entorno**. Según la versión del portal puede aparecer en Configuration / Configuración → Application settings.
4. Añade el **nombre** y el **valor** de cada variable. Ejemplo: nombre `FINANCE_V2_ENABLED`, valor `true`.
5. Guarda/aplica cambios. Azure reinicia la aplicación cuando corresponde.

`.env.example` es solo una lista de referencia: Azure no lo lee automáticamente. Para Azure pega los valores en su panel; para ejecutar en tu computador copia el archivo como `.env` y complétalo. Nunca subas `.env` a Git.

Si ves `FINANCE_ADMIN_TOTP_SECRETS={}`, el nombre es `FINANCE_ADMIN_TOTP_SECRETS` y el valor es `{}`. No pegues el nombre dentro del valor ni pongas comillas simples alrededor de un JSON en Azure.

## 3. Preparar el acceso a MongoDB

1. Abre las variables del App Service **de la API** y localiza `MONGO_URI`.
2. Copia el valor completo al `MONGO_URI` **del worker**. Puede haber usuarios distintos con permisos adecuados, pero el nombre de la base debe ser el mismo.
3. Si todavía no tienes conexión: en MongoDB Atlas, abre tu clúster → Connect → Drivers y obtén la cadena. Sustituye usuario, contraseña y nombre de base con tus datos. Para MongoDB propio, solicita al administrador una conexión a un replica set.
4. Permite que la API y el worker accedan al servidor MongoDB desde sus redes/IPs de salida. No abrir acceso universal como solución por defecto.
5. El MongoDB debe permitir transacciones. Un servidor MongoDB independiente sin replica set no basta. No dar por hecho que cualquier servicio con protocolo MongoDB tiene las mismas garantías.

No crear una base vacía diferente para el worker. No copiar saldos manualmente. Los saldos antiguos son datos de prueba y no prueban respaldo real.

## 4. Crear y publicar únicamente el worker

Estos pasos se refieren a **App Service Linux, publicación de código Node.js**, no a un contenedor Docker.

1. En Azure crea una **Web App / Aplicación web**, llamada por ejemplo `p4c-payments-worker` (el nombre debe estar disponible).
2. Selecciona **Code / Código**, Linux, y una versión Node.js LTS compatible, 22 o superior. Usa la misma versión para compilar y ejecutar.
3. Selecciona región y App Service Plan. Puedes escoger un plan Linux compatible existente si dispone de capacidad; en caso contrario, revisa el coste de otro plan.
4. En las variables de esta aplicación añade las de **Play4CashPaymentsWorker/.env.example**, completando MongoDB y conservando los pagos en `false`.
5. En **Configuration / Configuración → General settings / Stack settings**, establece **Startup Command / Comando de inicio**: `npm start`.
6. Activa **Always On** en los ajustes generales y **HTTPS Only**. En **Health check / Comprobación de estado**, configura `/health`.
7. No configures manualmente `PORT` en Azure para esta modalidad: el código escucha el puerto que proporciona App Service. No necesitas un dominio personalizado para el worker.
8. Si hay autenticación de App Service o restricciones de red, asegúrate de que las comprobaciones de Azure puedan acceder a `/health`. Este endpoint solo devuelve estado, no permite enviar pagos.

### Preparar un paquete listo para subir

En una terminal Linux/macOS (o una máquina de CI Linux) dentro de la carpeta **Play4CashPaymentsWorker**:

```sh
npm ci
npm test
npm run package:azure
```

El último comando genera **deployment.zip** con código compilado y dependencias de producción. No incluye `.env` ni toma valores secretos de tu entorno para el paquete. No despliega por sí mismo. No empaquetes la carpeta padre P4C ni Play4CashApi. El script necesita acceso a npm y el programa `zip`.

Para cargar ese paquete con Azure CLI, primero instala la CLI e inicia sesión con `az login`. Después ejecuta desde esta misma carpeta, reemplazando los dos textos de ejemplo:

```sh
az webapp deploy --resource-group NOMBRE_DE_TU_GRUPO --name NOMBRE_DE_TU_APP_WORKER --src-path deployment.zip --type zip
```

El grupo y nombre se ven en **Overview / Información general** del nuevo App Service. Este comando publica en la aplicación indicada; revisa que sea el worker. El paquete ya incluye build/dependencias: deja `SCM_DO_BUILD_DURING_DEPLOYMENT=false` para ese flujo. No mezclar este paquete con un flujo que intenta recompilar en Azure.

Como alternativa puedes publicar desde un repositorio independiente con CI, ejecutando `npm ci`, `npm test` y la generación del paquete antes de desplegar. La carpeta está creada localmente; todavía debes publicarla en tu repositorio remoto si eliges esa alternativa.

### Comprobar el arranque

1. Abre **Log stream / Flujo de registros**. Debe aparecer `P4C payments worker started`.
2. Abre `https://NOMBRE_DE_TU_APP_WORKER.azurewebsites.net/health` usando el dominio exacto de Overview.
3. Debe responder `{"status":"ok"}`. Un 503 indica que la comprobación no puede acceder a MongoDB. Un fallo de arranque requiere revisar variables y conexión.
4. Esto demuestra arranque y acceso MongoDB, **no demuestra que NOWPayments esté configurado ni que puedas cobrar o retirar**.

No necesitas apuntar la PWA, el gateway o NOWPayments al worker.

## 5. Obtener claves de NOWPayments sandbox

Sandbox es un entorno de pruebas sin dinero real. No mezcles sus claves con las de producción.

1. Desde la [guía oficial de sandbox](https://nowpayments.io/blog/how-to-use-the-sandbox-a-guide), entra en el enlace de alta/acceso al sandbox y crea o abre tu cuenta de prueba.
2. En el panel busca **Settings → Payments → API keys** (en algunas vistas, Store Settings). Genera una API key y guárdala.
3. Copia esa clave en `NOWPAYMENTS_API_KEY` de **API y worker**.
4. En **Instant payment notifications / IPN**, genera el **IPN Secret Key**, que es otra clave diferente. Guarda el valor cuando se muestre.
5. Copia ese secreto en `NOWPAYMENTS_IPN_SECRET` de **la API solamente**. El worker no recibe las notificaciones públicas.
6. En ambos proyectos conserva `NOWPAYMENTS_BASE_URL=https://api-sandbox.nowpayments.io/v1`. No cambiar por la URL de producción: esta versión la rechaza.

Referencia de [API keys y notificaciones](https://nowpayments.io/blog/how-to-add-crypto-payments-faster-with-the-nowpayments-node-js-sdk).

### Formar la URL de notificaciones

Necesitas la dirección pública de tu **gateway**. Si es `https://api.miempresa.com`, entonces:

```text
NOWPAYMENTS_IPN_URL = https://api.miempresa.com/api/payments/ipn/nowpayments
```

Pon el mismo valor en API y worker. Esta URL la construyes con TU dominio; no se copia de NOWPayments ni usa el dominio del worker. El código la envía al proveedor al crear la operación. Si el panel pide URL IPN, usa la misma. La ruta debe ser accesible por HTTPS para notificaciones firmadas.

### simulación

En el **worker** configura `NOWPAYMENTS_SANDBOX_CASE=success`. Al crear un depósito, el worker envía `case: success` y NOWPayments simula el pago. No debes enviar monedas reales a la dirección mostrada ni necesitas saldo en una blockchain de pruebas. Después se consulta el resultado y se abona únicamente el importe final que informa el proveedor.

Otros casos de depósito: `failed`, `partially_paid` y `common`. Cambiar el caso afecta depósitos nuevos, no modifica órdenes existentes ni simula payouts. Documentación de [escenarios sandbox](https://www.postman.com/lively-eclipse-136689/test/documentation/muz690z/nowpayments-api-sandbox).

Si NOWPayments devuelve un rechazo explícito, P4C lo respeta. Si hay timeout o un error ambiguo, se mantiene la operación incierta; no se inventa una confirmación ni se libera un retiro potencialmente aceptado. El hecho de no filtrar países en P4C no demuestra que el proveedor conozca o valide el país de cada jugador.

## 6. Credenciales de retiros: solo worker

En las variables del App Service **del worker**:

| Nombre | Qué pegar |
| --- | --- |
| NOWPAYMENTS_PAYOUT_EMAIL | Correo para iniciar sesión en la cuenta sandbox de NOWPayments. |
| NOWPAYMENTS_PAYOUT_PASSWORD | Contraseña de esa cuenta sandbox. |
| NOWPAYMENTS_PAYOUT_TOTP_SECRET | Semilla Base32 del enrolamiento 2FA para automatizar verificación de payouts. No el número temporal de seis dígitos. |

Si el panel sandbox no permite obtener/configurar esa semilla o probar payouts, solicita a NOWPayments el procedimiento compatible. No desactivar 2FA para eludir este paso. El soporte de ese contrato en tu cuenta aún debe verificarse.

**No pongas ninguna de estas tres en la API, el gateway, la PWA ni la administración web.** La API rechaza contraseña/semilla de payouts al iniciar. El worker ya sabe que es un worker: no necesitas añadir `PAYMENTS_WORKER` a su configuración. En la API ese valor permanece `false`.

## 7. Correo para verificar retiros

Si la API ya envía correos, conserva `EMAIL_SERVICE`, `EMAIL_FROM` y `EMAIL_PASS` y copia los mismos al worker. Si no:

1. Elige la cuenta emisora de P4C.
2. Para Gmail, usa `EMAIL_SERVICE=gmail` y `EMAIL_FROM=correo-emisor`.
3. Activa verificación en dos pasos de la cuenta Google y genera una **contraseña de aplicación** en Seguridad. Si la organización no ofrece esa opción, hay que adaptar/configurar otro servicio de correo; no inventar credenciales.
4. Pega esa contraseña de aplicación en `EMAIL_PASS`. No usar una contraseña de NOWPayments.
5. Comprueba envío y recepción de un código de prueba antes de habilitar retiros.

## 8. Conexiones existentes de API, gateway y webs

No cambiar claves de autenticación existentes sin planificar el cierre de sesiones. Para una instalación nueva:

| Variable | Cómo obtenerla y dónde repetirla |
| --- | --- |
| API REDIS_URI | Conexión de tu Redis, obtenida del panel de ese servicio. Copiar exactamente en REDIS_URI del gateway. `rediss://` conserva TLS. El worker no usa Redis. |
| API JWT_SECRET_KEY | Generar un secreto aleatorio, por ejemplo `openssl rand -hex 32`. Copiarlo como JWT_SECRET en gateway. |
| API ADMIN_JWT_SECRET_KEY | Generar OTRA clave distinta. Copiarla con el mismo nombre en gateway. |
| API/Gateway GATEWAY_INTERNAL_SECRET | Generar otra clave aleatoria y usar el MISMO valor en ambos. No viene de NOWPayments. |
| Gateway DOWNSTREAM_URL | URL interna o HTTPS del App Service de API/balanceador. No del worker. |
| PWA VITE_API_URL y Admin NEXT_PUBLIC_API_URL | URL pública HTTPS del gateway. |
| API ALLOWED_ORIGINS y Gateway CORS_ORIGINS | Dominios públicos de PWA y administración, separados por comas y sin rutas. |
| API SOCKET_ORIGIN | Dominio público de la PWA. |
| API GOOGLE_CLIENT_ID / PWA VITE_GOOGLE_CLIENT_ID | ID público del cliente OAuth de jugadores, en Google Cloud Console → APIs y servicios → Credenciales. |
| API GOOGLE_ADMIN_CLIENT_ID / Admin NEXT_PUBLIC_GOOGLE_ADMIN_CLIENT_ID | ID público del cliente OAuth de admins del mismo panel. No el secreto OAuth. |

Mantén `FINANCE_V2_ENABLED=true`, `RELIABLE_COMMANDS_ENABLED=true` y `SOCKET_IO_REDIS_ADAPTER=true` en la API. En la PWA usa `VITE_RELIABLE_COMMANDS=true` **antes de compilar**. El worker solo necesita `FINANCE_V2_ENABLED=true`. No desactivar el libro después de inicializarlo.

### Cuenta del jugador

Para sandbox basta iniciar sesión con un usuario activo de P4C. No hay que crear documentos `finance_eligibility`, aprobar países ni conectar un servicio KYC para estas pruebas. Una cuenta desactivada sigue bloqueada y las señales de riesgo existentes siguen obligando a revisión. Si ya existe evidencia explícita de minoría de edad, el acceso sigue rechazado.

## 9. MFA para administradores de P4C

Es diferente del 2FA de NOWPayments. Sirve para aprobar/rechazar retiros, ajustes y cancelaciones financieras.

1. En MongoDB, colección `admins`, identifica el `_id` del administrador por su correo. Esto requiere acceso autorizado a tu base, no el ID de un jugador.
2. En un computador seguro, dentro del worker, ejecuta `npm run admin:mfa -- ID_DEL_ADMIN`. Genera una nueva semilla y muestra instrucciones; no modifica la base ni configura Azure.
3. Añade esa semilla manualmente a un autenticador con TOTP de seis dígitos, periodo 30 segundos, SHA-1, usando el nombre P4C. Guarda una copia segura según tu procedimiento de recuperación.
4. Copia el JSON mostrado a `FINANCE_ADMIN_TOTP_SECRETS` **de la API**. Para varios admins conserva todas las entradas en un solo JSON, una semilla por persona. No reemplazar un mapa existente sin conservar otros admins.
5. Conserva `{}` hasta terminar ese enrolamiento. Las acciones financieras quedarán bloqueadas hasta entonces. No poner semillas en la web de administración ni en Git.

## 10. Orden de activación y límites de esta entrega

1. Desplegar API y worker compatibles, con ambos interruptores de pagos en `false`.
2. Comprobar `/health`, MongoDB, Redis, acceso de jugadores y correo.
3. Configurar MFA administrativo si necesitas revisar retiros o hacer ajustes; para un depósito sandbox no es necesario.
4. Verificar con la cuenta sandbox las redes, fees, mínimos, depósito, consulta, notificación y payouts/2FA. Sin esa comprobación no afirmar que los pagos están listos.
5. Habilitar `PAYMENTS_DEPOSITS_ENABLED=true` en API y worker para las pruebas sandbox. Verificar una operación completa y su asiento antes de continuar.
6. Solo con autorización/2FA/liquidez sandbox verificadas, habilitar `PAYMENTS_WITHDRAWALS_ENABLED=true` en ambos y probar estados de éxito, rechazo e incertidumbre.
7. Verificar roles MongoDB para impedir modificaciones del diario, restricciones de red/secretos, alertas y pruebas pendientes de fallos/staging antes de considerar dinero real.

Los límites de revisión actuales son 500 USDT por retiro o más de 1.000 USDT en la ventana móvil, incluyendo reservas activas; están en código, no hay variables para cambiarlos. Una reserva incierta no se libera ni reenvía por apagar interruptores. La conciliación continúa para resolver operaciones existentes.

Cambiar NODE_ENV o desplegar en un App Service llamado producción **no activa NOWPayments real**. Ese bloqueo sigue en código y requiere otra fase de validación; esta guía permite preparar servicios y pruebas, no promete activación real rellenando un archivo.

Fuentes Azure: [Node.js y comando de inicio](https://learn.microsoft.com/en-us/azure/app-service/configure-language-nodejs), [configuración de App Service y Always On](https://learn.microsoft.com/en-us/azure/app-service/configure-common).


## 11. Primera prueba desde la PWA en Azure

1. Mantén todos los servicios conectados al mismo entorno de datos de prueba. Guarda en la API la API key sandbox y el secreto IPN; en el worker, la misma API key y URL de callback.
2. Elimina de API y worker el antiguo `NOWPAYMENTS_USDT_NETWORKS={}` si lo habías copiado. La ausencia de esa variable activa descubrimiento de redes;
3. Configura `NOWPAYMENTS_SANDBOX_CASE=success` en el worker. Activa `PAYMENTS_DEPOSITS_ENABLED=true` en API y worker; reinicia ambos tras guardar.
4. Abre la PWA, inicia sesión, entra en **Depositar USDT**, selecciona una red disponible e introduce un importe superior al mínimo indicado por el proveedor.
5. Pulsa **Crear depósito**. No envíes fondos reales. La orden pasa por el procesamiento simulado de NOWPayments; la PWA consulta cada cinco segundos y la conciliación del worker corre cada minuto. El abono puede tardar más de un minuto.
6. Revisa que aparezca confirmada y que se actualice el saldo. Si permanece incierta, revisa logs del worker e IPN antes de crear otra operación. No modificar saldos directamente.
7. Para retirar ese saldo ficticio, configura credenciales/2FA de payouts, comprueba que la cuenta sandbox tenga capacidad/liquidez de payout y activa `PAYMENTS_WITHDRAWALS_ENABLED=true` en ambos. En **Retirar USDT**, introduce una dirección válida para la red, consulta comisión, confirma y usa el código recibido por correo. No pegar una semilla ni código 2FA de NOWPayments en el formulario del jugador.

No se han probado estas llamadas con tus credenciales: la aceptación de redes, payouts y liquidez depende de lo que permita tu cuenta sandbox. Si un endpoint no está disponible en ese entorno, debe verificarse con NOWPayments; no se sustituirá por un pago ficticio presentado como respuesta real del proveedor.
