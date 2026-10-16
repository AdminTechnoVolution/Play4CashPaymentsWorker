# Play4CashPaymentsWorker

Proyecto independiente que procesa depósitos, retiros y conciliaciones de P4C. Comparte MongoDB con Play4CashApi. No contiene los endpoints de jugadores ni necesita Redis. El único HTTP disponible es `/` y `/health`, para comprobar arranque y acceso MongoDB en Azure App Service.

**Empezar por [CONFIGURACION-AZURE.md](./CONFIGURACION-AZURE.md)**. Explica qué crear, de dónde copiar cada valor y cómo verificarlo, sin asumir conocimientos de despliegue.

```sh
npm ci
npm test
npm start
```

Antes de arrancar localmente, copiar `.env.example` a `.env` y completar MongoDB. Los interruptores de pagos quedan apagados. La URL de producción de NOWPayments está bloqueada deliberadamente.

## Responsabilidades

- Busca operaciones persistidas cada 500 ms; crea depósitos y procesa retiros reservados.
- Comprueba la autorización inmutable del retiro y la liquidez antes de enviarlo.
- Procesa notificaciones IPN que guarda la API y consulta el estado en NOWPayments.
- Conserva reservas ante resultados inciertos, sin reenviar o devolver automáticamente.
- Revisa pendientes cada minuto, recupera liquidaciones/devoluciones y concilia diariamente.

La API recibe IPN y solicitudes; el worker no necesita recibir callbacks del proveedor. `/health` no demuestra que una cuenta, moneda o pago externo funcione y no expone datos financieros.

## Código financiero compartido

`src/shared` contiene únicamente 15 archivos necesarios de la lógica financiera de la API, conservando sus rutas relativas. Son copias verificables, no una dependencia `../Play4CashApi` en ejecución ni una copia de la API completa. Se incluyen en el despliegue del worker. No editar estas copias manualmente.

`shared-sources.json` fija sus hashes SHA-256. `npm run check:shared` verifica integridad y, cuando está presente el checkout vecino, coincidencia con la API. La compilación lo ejecuta automáticamente. Si se modifica esa lógica, revisar el cambio en la API y ejecutar `npm run sync:shared`, probar ambos proyectos y desplegar versiones compatibles. Las nuevas dependencias locales deben añadirse al manifiesto/script antes de compilar. Una futura librería privada publicada podría sustituir estas copias.

## Despliegue

`npm run package:azure` genera `deployment.zip` con código compilado y dependencias de producción; no incluye `.env`. Requiere `zip` y acceso al registro npm. No crea recursos ni despliega automáticamente. Ver guía para cargarlo en el App Service del worker. Node 22 o superior; elegir una versión LTS disponible en Azure y usar la misma para compilar y ejecutar.
