# Cocina Económica: menú y pedidos en línea

Esta es la versión estática para GitHub Pages. Usa Firebase Authentication para las cuentas y Cloud Firestore para el menú y los pedidos. La cuenta propietaria que ya estaba registrada como administradora en `appsalonAdmins` conserva el acceso al panel. También se puede autorizar otra cuenta creando `cocinaAdmins/{UID}` desde Firebase Console.

## Funciones

- Crear cuenta, iniciar sesión y recuperar contraseña.
- Mantener una carta permanente de platillos con categoría, descripción, precio y foto.
- Publicar una sección separada de promociones con precio especial y vigencia.
- Publicar por separado el menú del día desde Administración.
- Votar una vez al día por un platillo de la carta para sugerirlo para mañana. El cliente puede cambiar su voto durante el día.
- Consultar en Administración una gráfica de votos para decidir el menú del día siguiente.
- Armar un carrito con los platillos del menú de hoy y solicitar pedidos para recoger o recibir a domicilio.
- Consultar pedidos propios y cambiar el estado desde Administración.
- Guardar la carta en `cocinaMenu`, promociones en `cocinaPromotions`, menús diarios en `cocinaDailyMenus`, votos en `cocinaVotes` y pedidos en `cocinaOrders`.

En esta primera versión los clientes crean una cuenta e inician sesión antes de ver el menú o pedir. Si se prefiere aceptar pedidos sin cuenta, hay que ajustar el acceso de clientes antes de publicar.

La disponibilidad, el costo de envío y el total final se confirman directamente con el cliente. No se cobran pagos ni se envían avisos automáticos por correo o WhatsApp.

Las fotos se reducen en el navegador a un máximo aproximado de 900 px y 240 KB y se guardan con el platillo en Firestore. Así no se necesita Cloud Storage. Cloud Storage para Firebase requiere el plan Blaze desde el 3 de febrero de 2026; como este sitio debe seguir en plan gratuito, no se usa ese producto. La foto ocupa parte de la cuota gratuita de Firestore y se limita para que el documento del platillo quede por debajo del máximo de 1 MiB.

## Configurar Firestore

1. En Firebase Console, abre **Firestore Database > Reglas**.
2. Copia el contenido actualizado de `firestore.rules` de esta carpeta y publícalo. Las reglas permiten leer la carta, las promociones y los menús diarios, limitan cada cuenta a su propio voto diario, protegen los pedidos por cuenta, limitan las fotos a imágenes JPEG comprimidas y reservan los cambios administrativos al UID autorizado.
3. La cuenta administradora actual sigue autorizada si su documento existe en `appsalonAdmins`. Para autorizar otra cuenta, crea `cocinaAdmins` y un documento con el UID de esa cuenta como ID; déjalo vacío.
4. Inicia sesión con esa cuenta y agrega los platillos en **Administración** para crear la carta.
5. En **Menú para hoy**, selecciona los platillos que ofrecerás y pulsa **Publicar menú de hoy**. Repite este paso cada día para actualizarlo.
6. En **Votos para mañana**, consulta la gráfica de preferencias del día y usa el resultado para planear el menú siguiente.
7. En **Crear promoción**, elige un platillo de la carta, indica el precio especial y las fechas de vigencia. Las promociones vigentes aparecerán en la sección **Promociones**.

No pongas credenciales privadas en el JavaScript ni hagas público el acceso administrativo editando código. El objeto de configuración web de Firebase identifica el proyecto; las reglas controlan los permisos.

## Publicar los cambios en GitHub Pages

Sube el contenido de esta carpeta a la raíz del repositorio público existente, conservando las rutas `assets/` y `js/`. Reemplaza `index.html`, `firestore.rules`, `README.md`, `assets/css/site.css` y `js/app.js`; agrega o conserva el resto de recursos que ya estén en el repositorio. No subas el proyecto PHP ni `appsalon_mvc_php.sql`.

Después de confirmar el cambio en GitHub, Pages volverá a publicar la misma URL. La base Firebase y las cuentas existentes se conservan; el menú y los pedidos nuevos usarán las colecciones `cocinaMenu` y `cocinaOrders`.
