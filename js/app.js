import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  runTransaction,
  serverTimestamp,
  where
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const appRoot = document.querySelector('#app');
const configReady = Object.values(firebaseConfig).every(value => value && !value.startsWith('REEMPLAZA_'));
const app = configReady ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const defaultServices = [
  { name: 'Corte de Cabello Mujer', price: 120 },
  { name: 'Corte de Cabello Hombre', price: 80 },
  { name: 'Corte de Cabello Niño', price: 60 },
  { name: 'Peinado Mujer', price: 80 },
  { name: 'Peinado Hombre', price: 60 },
  { name: 'Peinado Niño', price: 60 },
  { name: 'Corte de Barba', price: 60 },
  { name: 'Tinte Mujer', price: 300 },
  { name: 'Uñas', price: 400 },
  { name: 'Lavado de Cabello', price: 50 },
  { name: 'Tratamiento Capilar', price: 150 }
];
let currentUser = null;
let isAdmin = false;
let services = [];
let selectedServiceIds = new Set();
let authMode = 'login';
let notice = '';
let noticeType = 'success';
let loading = false;

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const money = value => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' }).format(Number(value || 0));
const todayISO = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const showNotice = (message, type = 'success') => { notice = message; noticeType = type; render(); };
const baseMarkup = (body, title = 'AppSalón') => `
  <section class="panel">
    <h1 class="nombre-pagina">${title}</h1>
    ${notice ? `<div class="notice ${noticeType}" role="status">${esc(notice)}</div>` : ''}
    ${body}
  </section>`;

function renderConfigHelp() {
  appRoot.innerHTML = baseMarkup(`
    <div class="panel-card">
      <h2>Falta conectar Firebase</h2>
      <p>Completa <code>docs/js/firebase-config.js</code> con la configuración de tu app web de Firebase. Sigue la guía <code>docs/README.md</code> y vuelve a publicar GitHub Pages.</p>
    </div>`, 'AppSalón');
}

function renderAuth() {
  const signup = authMode === 'register';
  const body = `
    <p class="descripcion-pagina">${signup ? 'Crea tu cuenta para solicitar citas' : 'Inicia sesión para reservar y consultar tus citas'}</p>
    <div class="auth-tabs" role="tablist">
      <button type="button" data-auth-mode="login" class="${signup ? '' : 'active'}">Iniciar sesión</button>
      <button type="button" data-auth-mode="register" class="${signup ? 'active' : ''}">Crear cuenta</button>
    </div>
    <form class="formulario" id="auth-form">
      ${signup ? `<div class="campo"><label for="auth-name">Nombre</label><input id="auth-name" name="name" autocomplete="name" required maxlength="80"></div>
      <div class="campo"><label for="auth-phone">Teléfono</label><input id="auth-phone" name="phone" type="tel" autocomplete="tel" required maxlength="20"></div>` : ''}
      <div class="campo"><label for="auth-email">Correo</label><input id="auth-email" name="email" type="email" autocomplete="email" required></div>
      <div class="campo"><label for="auth-password">Contraseña</label><input id="auth-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></div>
      <button class="boton" type="submit" ${loading ? 'disabled' : ''}>${loading ? 'Procesando…' : (signup ? 'Crear cuenta' : 'Iniciar sesión')}</button>
    </form>
    ${!signup ? `<p class="text-center"><button class="secondary-button" type="button" id="reset-password">Olvidé mi contraseña</button></p>` : ''}
    <p class="descripcion-pagina">Al crear una cuenta autorizas el uso de tus datos para gestionar tus citas.</p>`;
  appRoot.innerHTML = baseMarkup(body, signup ? 'Crear Cuenta' : 'Bienvenido');
  appRoot.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => { authMode = button.dataset.authMode; notice = ''; render(); }));
  appRoot.querySelector('#auth-form').addEventListener('submit', handleAuthSubmit);
  appRoot.querySelector('#reset-password')?.addEventListener('click', handlePasswordReset);
}

function renderTopbar() {
  return `<div class="topbar"><p>Hola, ${esc(currentUser?.displayName || currentUser?.email || '')}</p><div class="admin-tools">
    ${isAdmin ? `<button class="secondary-button" type="button" data-view="booking">Reservar cita</button><button class="secondary-button" type="button" data-view="admin">Administración</button>` : ''}
    <button class="boton" type="button" id="logout">Cerrar sesión</button>
  </div></div>`;
}

function renderServices() {
  if (!services.length) return `<p class="empty-state">Todavía no hay servicios publicados. Contacta al salón para continuar.</p>`;
  return `<div class="listado-servicios">${services.map(service => `
    <article class="servicio service-card ${selectedServiceIds.has(service.id) ? 'selected' : ''}" data-service-id="${esc(service.id)}" tabindex="0" role="checkbox" aria-checked="${selectedServiceIds.has(service.id)}">
      <p class="nombre-servicio">${esc(service.name)}</p>
      <p class="precio-servicio">${money(service.price)}</p>
      ${service.description ? `<p class="service-description">${esc(service.description)}</p>` : ''}
    </article>`).join('')}</div>`;
}

function renderBooking() {
  const selected = services.filter(service => selectedServiceIds.has(service.id));
  const total = selected.reduce((sum, service) => sum + Number(service.price), 0);
  const body = `${renderTopbar()}
    <p class="descripcion-pagina">Elige servicios y el horario que prefieres.</p>
    <div class="panel-card"><h2>Servicios</h2>${renderServices()}</div>
    <div class="panel-card"><h2>Datos de la cita</h2>
      <form class="formulario booking-form" id="booking-form">
        <div class="campo"><label for="client-name">Nombre</label><input id="client-name" name="name" value="${esc(currentUser?.displayName || '')}" autocomplete="name" maxlength="80" required></div>
        <div class="campo"><label for="client-phone">Teléfono</label><input id="client-phone" name="phone" type="tel" autocomplete="tel" maxlength="20" required></div>
        <div class="campo"><label for="appointment-date">Fecha</label><input id="appointment-date" name="date" type="date" min="${todayISO()}" required></div>
        <div class="campo"><label for="appointment-time">Hora</label><select id="appointment-time" name="time" required><option value="">Elige una fecha primero</option></select></div>
        <div class="notice">Servicios seleccionados: ${selected.length}. Total estimado: ${money(total)}. El horario se confirma al guardar. El precio final se confirma en el salón.</div>
        <button class="boton" type="submit" ${loading || !services.length ? 'disabled' : ''}>${loading ? 'Guardando…' : 'Solicitar cita'}</button>
      </form>
    </div>`;
  appRoot.innerHTML = baseMarkup(body, 'Crear Nueva Cita');
  wireTopbar();
  appRoot.querySelectorAll('[data-service-id]').forEach(card => {
    const toggle = () => { const id = card.dataset.serviceId; selectedServiceIds.has(id) ? selectedServiceIds.delete(id) : selectedServiceIds.add(id); notice = ''; render(); };
    card.addEventListener('click', toggle);
    card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } });
  });
  const dateInput = appRoot.querySelector('#appointment-date');
  dateInput.addEventListener('change', refreshTimeOptions);
  appRoot.querySelector('#booking-form').addEventListener('submit', handleBookingSubmit);
}

function renderAdmin() {
  const body = `${renderTopbar()}
    <p class="descripcion-pagina">Administra servicios y revisa solicitudes de citas.</p>
    <div class="panel-card"><h2>Servicios</h2>
      <form class="formulario" id="service-form">
        <div class="campo"><label for="service-name">Nombre</label><input id="service-name" name="name" required maxlength="80" placeholder="Nombre del servicio"></div>
        <div class="campo"><label for="service-price">Precio</label><input id="service-price" name="price" type="number" min="0" step="0.01" required placeholder="0.00"></div>
        <button class="boton" type="submit">Agregar servicio</button>
      </form>
      ${services.length ? `<ul class="servicios">${services.map(service => `<li><p>Nombre: <span>${esc(service.name)}</span></p><p>Precio: <span>${money(service.price)}</span></p><button class="boton-eliminar" type="button" data-delete-service="${esc(service.id)}">Eliminar</button></li>`).join('')}</ul>` : `<p class="empty-state">No hay servicios configurados.</p><button class="boton" id="seed-services" type="button">Cargar servicios iniciales</button>`}
    </div>
    <div class="panel-card"><h2>Buscar citas</h2>
      <div class="campo"><label for="filter-date">Fecha</label><input id="filter-date" type="date" value="${todayISO()}"></div>
      <div id="appointments" class="empty-state">Selecciona una fecha para cargar citas.</div>
    </div>`;
  appRoot.innerHTML = baseMarkup(body, 'Panel de Administración');
  wireTopbar();
  appRoot.querySelector('#service-form').addEventListener('submit', handleServiceSubmit);
  appRoot.querySelector('#filter-date').addEventListener('change', loadAppointments);
  appRoot.querySelector('#seed-services')?.addEventListener('click', seedServices);
  appRoot.querySelectorAll('[data-delete-service]').forEach(button => button.addEventListener('click', () => removeService(button.dataset.deleteService)));
  loadAppointments();
}

function wireTopbar() {
  appRoot.querySelector('#logout')?.addEventListener('click', () => signOut(auth));
  appRoot.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { window.location.hash = button.dataset.view; }));
}

function render() {
  if (!configReady) return renderConfigHelp();
  if (!currentUser) return renderAuth();
  if (window.location.hash === '#admin' && isAdmin) return renderAdmin();
  return renderBooking();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = String(form.get('email')).trim();
  const password = String(form.get('password'));
  loading = true; notice = ''; render();
  try {
    if (authMode === 'register') {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const name = String(form.get('name')).trim();
      await updateProfile(credential.user, { displayName: name });
      currentUser = credential.user;
      notice = 'Cuenta creada. Completa tus datos y solicita tu cita.';
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    noticeType = 'error'; notice = authError(error);
  } finally { loading = false; render(); }
}

async function handlePasswordReset() {
  const email = appRoot.querySelector('#auth-email')?.value.trim();
  if (!email) return showNotice('Escribe tu correo para enviarte el enlace de recuperación.', 'error');
  try { await sendPasswordResetEmail(auth, email); showNotice('Revisa tu correo para restablecer la contraseña.'); }
  catch (error) { showNotice(authError(error), 'error'); }
}

function authError(error) {
  const messages = {
    'auth/email-already-in-use':'Ese correo ya tiene una cuenta.',
    'auth/invalid-email':'El correo no es válido.',
    'auth/invalid-credential':'Correo o contraseña incorrectos.',
    'auth/weak-password':'Usa una contraseña de al menos 6 caracteres.',
    'auth/network-request-failed':'No hay conexión. Intenta de nuevo.',
    'auth/too-many-requests':'Hubo muchos intentos. Espera un momento y prueba de nuevo.',
    'permission-denied':'Firebase rechazó esta operación. Revisa las reglas de Firestore.'
  };
  return messages[error.code] || `No se pudo completar la operación (${error.code || 'error'}).`;
}

async function loadServices() {
  if (!db) return;
  try {
    const snapshot = await getDocs(collection(db, 'appsalonServices'));
    services = snapshot.docs.map(item => ({ id:item.id, ...item.data() })).filter(item => item.active !== false).sort((a,b) => a.name.localeCompare(b.name, 'es'));
  } catch (error) { showNotice(authError(error), 'error'); }
}

async function checkAdmin(user) {
  if (!user) { isAdmin = false; return; }
  try { isAdmin = (await getDoc(doc(db, 'appsalonAdmins', user.uid))).exists(); }
  catch { isAdmin = false; }
}

async function refreshTimeOptions() {
  const date = appRoot.querySelector('#appointment-date')?.value;
  const select = appRoot.querySelector('#appointment-time');
  if (!select) return;
  if (!date) { select.innerHTML = '<option value="">Elige una fecha primero</option>'; return; }
  if (new Date(`${date}T12:00:00`).getDay() % 6 === 0 || date < todayISO()) {
    select.innerHTML = '<option value="">Elige un día hábil futuro</option>';
    showNotice('No se aceptan citas en fin de semana ni en fechas pasadas.', 'error');
    return;
  }
  const options = [];
  for (let hour = 10; hour <= 18; hour++) for (const minute of ['00','30']) {
    if (hour === 18 && minute === '30') continue;
    const time = `${String(hour).padStart(2,'0')}:${minute}`;
    const slot = await getDoc(doc(db, 'appsalonSlots', `${date}_${time}`));
    if (!slot.exists()) options.push(`<option value="${time}">${time}</option>`);
  }
  select.innerHTML = options.length ? `<option value="">Selecciona una hora</option>${options.join('')}` : '<option value="">No hay horarios disponibles</option>';
}

async function handleBookingSubmit(event) {
  event.preventDefault();
  if (!selectedServiceIds.size) return showNotice('Selecciona al menos un servicio.', 'error');
  const form = new FormData(event.currentTarget);
  const date = String(form.get('date'));
  const time = String(form.get('time'));
  const name = String(form.get('name')).trim();
  const phone = String(form.get('phone')).trim();
  if (!name || !phone || !date || !time) return showNotice('Completa todos los datos de la cita.', 'error');
  const serviceIds = [...selectedServiceIds];
  const appointmentRef = doc(collection(db, 'appsalonAppointments'));
  const slotRef = doc(db, 'appsalonSlots', `${date}_${time}`);
  loading = true; notice = ''; render();
  try {
    await runTransaction(db, async transaction => {
      const slot = await transaction.get(slotRef);
      if (slot.exists()) throw new Error('Ese horario acaba de ocuparse. Elige otro.');
      transaction.set(appointmentRef, {
        uid: currentUser.uid,
        clientName: name,
        email: currentUser.email || '',
        phone,
        date,
        time,
        serviceIds,
        status: 'requested',
        createdAt: serverTimestamp()
      });
      transaction.set(slotRef, { appointmentId: appointmentRef.id, date, time });
    });
    selectedServiceIds.clear();
    notice = 'Tu solicitud de cita quedó registrada.'; noticeType = 'success';
  } catch (error) { notice = error.message?.includes('ocup') ? error.message : authError(error); noticeType = 'error'; }
  finally { loading = false; render(); }
}

async function handleServiceSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get('name')).trim();
  const price = Number(form.get('price'));
  if (!name || !Number.isFinite(price) || price < 0) return showNotice('Revisa el nombre y precio.', 'error');
  try {
    await addDoc(collection(db, 'appsalonServices'), { name, price, active:true });
    await loadServices(); notice = 'Servicio agregado.'; noticeType = 'success'; render();
  } catch (error) { showNotice(authError(error), 'error'); }
}

async function removeService(id) {
  if (!confirm('¿Eliminar este servicio?')) return;
  try { await deleteDoc(doc(db, 'appsalonServices', id)); selectedServiceIds.delete(id); await loadServices(); notice = 'Servicio eliminado.'; render(); }
  catch (error) { showNotice(authError(error), 'error'); }
}

async function seedServices() {
  if (!isAdmin) return;
  try {
    for (const service of defaultServices) await addDoc(collection(db, 'appsalonServices'), { ...service, active:true });
    await loadServices(); notice = 'Servicios iniciales cargados. Ya puedes editar la lista desde esta pantalla.'; render();
  } catch (error) { showNotice(authError(error), 'error'); }
}

async function loadAppointments() {
  const host = appRoot.querySelector('#appointments');
  const date = appRoot.querySelector('#filter-date')?.value;
  if (!host || !date) return;
  host.textContent = 'Cargando…';
  try {
    const snapshot = await getDocs(query(collection(db, 'appsalonAppointments'), where('date', '==', date)));
    const records = snapshot.docs.map(item => ({ id:item.id, ...item.data() })).sort((a,b) => a.time.localeCompare(b.time));
    if (!records.length) { host.innerHTML = '<p class="empty-state">No hay citas para esta fecha.</p>'; return; }
    host.innerHTML = records.map(record => {
      const names = record.serviceIds.map(id => services.find(service => service.id === id)?.name || 'Servicio eliminado');
      const total = record.serviceIds.reduce((sum,id) => sum + Number(services.find(service => service.id === id)?.price || 0), 0);
      return `<article class="admin-row"><h3>${esc(record.time)} — ${esc(record.clientName)}</h3>
        <p>Correo: ${esc(record.email)}</p><p>Teléfono: ${esc(record.phone)}</p>
        <p>Servicios: ${names.map(esc).join(', ')}</p><p>Total estimado: ${money(total)}</p>
        <p>Estado: ${esc(record.status || 'requested')}</p>
        <button type="button" class="boton-eliminar" data-delete-appointment="${esc(record.id)}" data-date="${esc(record.date)}" data-time="${esc(record.time)}">Eliminar cita</button></article>`;
    }).join('');
    host.querySelectorAll('[data-delete-appointment]').forEach(button => button.addEventListener('click', () => deleteAppointment(button.dataset.deleteAppointment, button.dataset.date, button.dataset.time)));
  } catch (error) { host.innerHTML = `<p class="notice error">${esc(authError(error))}</p>`; }
}

async function deleteAppointment(id, date, time) {
  if (!confirm('¿Eliminar esta cita y liberar el horario?')) return;
  try {
    await runTransaction(db, async transaction => {
      transaction.delete(doc(db, 'appsalonAppointments', id));
      transaction.delete(doc(db, 'appsalonSlots', `${date}_${time}`));
    });
    await loadAppointments();
  } catch (error) { showNotice(authError(error), 'error'); }
}

if (auth) {
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    await checkAdmin(user);
    await loadServices();
    if (!isAdmin && window.location.hash === '#admin') window.location.hash = 'booking';
    render();
  });
} else {
  renderConfigHelp();
}
window.addEventListener('hashchange', render);


