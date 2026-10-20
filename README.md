# AppSalón: GitHub Pages + Firebase

Esta carpeta es el paquete estático para el repositorio nuevo. No subas el proyecto PHP ni `appsalon_mvc_php.sql`: GitHub Pages publica HTML/CSS/JavaScript y no ejecuta PHP. La versión estática usa Firebase Authentication y Cloud Firestore. Todas sus colecciones tienen prefijo `appsalon`, y este proyecto Firebase separado no mezclará datos con tus encuestas.

## 1. Crear el proyecto Firebase nuevo

1. Entra a [Firebase Console](https://console.firebase.google.com/) y crea un proyecto nuevo para AppSalón.
2. Registra una aplicación **Web** en el proyecto.
3. Copia la configuración web a `js/firebase-config.js`: `apiKey`, `authDomain`, `projectId` y `appId`. Esos valores de la app web son públicos; no pongas contraseñas ni claves privadas aquí.
4. En **Authentication > Sign-in method**, habilita **Correo electrónico/Contraseña**.
5. En **Firestore Database**, crea una base de datos en modo producción y publica las reglas de `firestore.rules`.

Firebase proporciona el objeto de configuración al registrar una aplicación web. Consulta la guía oficial si lo necesitas: [Agregar Firebase a una app web](https://firebase.google.com/docs/web/setup).

## 2. Crear la cuenta administradora

1. Abre la aplicación publicada y crea tu cuenta desde **Crear cuenta**.
2. En Firebase Console abre **Authentication > Users** y copia el UID de tu cuenta.
3. En Firestore crea la colección `appsalonAdmins` y un documento con ese UID como ID. Déjalo vacío.
4. Cierra e inicia sesión de nuevo. En **Administración**, pulsa **Cargar servicios iniciales** una sola vez.

El permiso de administración se controla con Firestore Rules y ese documento. No agregues permisos editando el JavaScript.

## 3. Crear el repositorio nuevo y publicar

1. En GitHub crea un repositorio nuevo, por ejemplo `appsalon-online`. Para publicar Pages sin pagar, usa un repositorio **público**.
2. Sube **el contenido de esta carpeta** (el `index.html`, `assets/`, `js/`, `firestore.rules` y este README) a la raíz del repositorio. No subas otros archivos del proyecto PHP ni el SQL de ejemplo.
3. En el repositorio abre **Settings > Pages** y configura **Deploy from a branch**, rama `main`, carpeta `/(root)`.
4. Cuando GitHub te dé la URL, agrega el dominio `TU-USUARIO.github.io` en **Firebase Console > Authentication > Settings > Authorized domains**.

La URL del sitio de proyecto será parecida a `https://TU-USUARIO.github.io/appsalon-online/`. GitHub documenta la publicación desde una rama y raíz del repositorio [aquí](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Funciones incluidas

- Registro, inicio de sesión y recuperación de contraseña con Firebase Authentication.
- Selección de servicios y solicitud de citas entre semana de 10:00 a 18:00.
- Bloqueo transaccional del horario para evitar dos reservas simultáneas.
- Panel para gestionar servicios y consultar/eliminar citas por fecha.
- Colecciones independientes: `appsalonServices`, `appsalonAdmins`, `appsalonAppointments` y `appsalonSlots`.

La recuperación de contraseña la envía Firebase. Los correos personalizados de confirmación de cita y los pagos no están incluidos. El total mostrado es una estimación que se confirma en el salón.

## Respaldo

Exporta regularmente las colecciones `appsalonAppointments`, `appsalonServices` y `appsalonSlots` desde Firebase Console.
