# Cocina Económica: menú y pedidos en línea

Esta es la versión estática para GitHub Pages. Usa Firebase Authentication para las cuentas y Cloud Firestore para el menú y los pedidos. La cuenta propietaria que ya estaba registrada como administradora en `appsalonAdmins` conserva el acceso al panel. También se puede autorizar otra cuenta creando `cocinaAdmins/{UID}` desde Firebase Console.

## Funciones de esta primera versión

- Crear cuenta, iniciar sesión y recuperar contraseña.
- Publicar platillos con categoría, descripción y precio.
- Armar un carrito y solicitar pedidos para recoger o recibir a domicilio.
- Consultar pedidos propios y cambiar el estado desde Administración.
- Guardar el menú en `cocinaMenu` y los pedidos en `cocinaOrders`.

En esta primera versión los clientes crean una cuenta e inician sesión antes de ver el menú o pedir. Si se prefiere aceptar pedidos sin cuenta, hay que ajustar el acceso de clientes antes de publicar.

La disponibilidad, el costo de envío y el total final se confirman directamente con el cliente. No se cobran pagos ni se envían avisos automáticos por correo o WhatsApp.

## Configurar Firestore

1. En Firebase Console, abre **Firestore Database > Reglas**.
2. Copia el contenido de `firestore.rules` de esta carpeta y publícalo. Las reglas permiten leer el menú, protegen los pedidos por cuenta y limitan los cambios administrativos al UID autorizado.
3. La cuenta administradora actual sigue autorizada si su documento existe en `appsalonAdmins`. Para autorizar otra cuenta, crea `cocinaAdmins` y un documento con el UID de esa cuenta como ID; déjalo vacío.
4. Inicia sesión con esa cuenta y agrega los platillos en **Administración**.

No pongas credenciales privadas en el JavaScript ni hagas público el acceso administrativo editando código. El objeto de configuración web de Firebase identifica el proyecto; las reglas controlan los permisos.

## Publicar los cambios en GitHub Pages

Sube el contenido de esta carpeta a la raíz del repositorio público existente, conservando las rutas `assets/` y `js/`. Reemplaza `index.html`, `firestore.rules`, `README.md`, `assets/css/site.css` y `js/app.js`; agrega o conserva el resto de recursos que ya estén en el repositorio. No subas el proyecto PHP ni `appsalon_mvc_php.sql`.

Después de confirmar el cambio en GitHub, Pages volverá a publicar la misma URL. La base Firebase y las cuentas existentes se conservan; el menú y los pedidos nuevos usarán las colecciones `cocinaMenu` y `cocinaOrders`.
