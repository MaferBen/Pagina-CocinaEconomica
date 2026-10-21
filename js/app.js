import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {
  createUserWithEmailAndPassword, getAuth, onAuthStateChanged,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, getFirestore,
  query, serverTimestamp, setDoc, updateDoc, where
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const root = document.querySelector('#app');
const configReady = Object.values(firebaseConfig).every(value => value && !value.startsWith('REEMPLAZA_'));
const app = configReady ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const PRODUCTS = 'cocinaMenu';
const ORDERS = 'cocinaOrders';
const DAILY_MENUS = 'cocinaDailyMenus';
const VOTES = 'cocinaVotes';
const PROMOTIONS = 'cocinaPromotions';
let user = null;
let isAdmin = false;
let menu = [];
let todaysDishIds = [];
let promotions = [];
let cart = new Map();
let authMode = 'login';
let notice = '';
let noticeType = 'success';
let busy = false;
let photoPreviewUrl = '';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const money = value => new Intl.NumberFormat('es-MX', { style:'currency', currency:'MXN' }).format(Number(value || 0));
const todayISO = () => { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10); };
const totalCart = () => [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
const showNotice = (message, type = 'success') => { notice = message; noticeType = type; render(); };
const shell = (body, title = 'Cocina Económica') => `<section class="panel"><header class="brand"><span class="brand-mark" aria-hidden="true">🍲</span><div><p class="eyebrow">HECHO EN CASA</p><h1>${title}</h1></div></header>${notice ? `<div class="notice ${noticeType}" role="status">${esc(notice)}</div>` : ''}${body}</section>`;

function renderConfigHelp() {
  root.innerHTML = shell('<div class="panel-card"><h2>Falta conectar Firebase</h2><p>Revisa la configuración de Firebase en <code>js/firebase-config.js</code>.</p></div>');
}

function renderAuth() {
  const signup = authMode === 'register';
  root.innerHTML = shell(`<p class="descripcion-pagina">${signup ? 'Crea tu cuenta para pedir comida' : 'Inicia sesión para hacer o revisar tus pedidos'}</p>
    <div class="auth-tabs"><button type="button" data-auth-mode="login" class="${signup ? '' : 'active'}">Iniciar sesión</button><button type="button" data-auth-mode="register" class="${signup ? 'active' : ''}">Crear cuenta</button></div>
    <form class="formulario" id="auth-form">${signup ? '<div class="campo"><label for="auth-name">Nombre</label><input id="auth-name" name="name" autocomplete="name" maxlength="80" required></div>' : ''}
      <div class="campo"><label for="auth-email">Correo</label><input id="auth-email" name="email" type="email" autocomplete="email" required></div>
      <div class="campo"><label for="auth-password">Contraseña</label><input id="auth-password" name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required></div>
      <button class="boton" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'Procesando…' : (signup ? 'Crear cuenta' : 'Iniciar sesión')}</button></form>
      ${signup ? '<p class="privacy-note">Usaremos tus datos solo para gestionar tus pedidos.</p>' : '<p class="text-center"><button class="secondary-button" type="button" id="reset-password">Olvidé mi contraseña</button></p>'}`);
  root.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => { authMode = button.dataset.authMode; notice = ''; render(); }));
  root.querySelector('#auth-form').addEventListener('submit', handleAuth);
  root.querySelector('#reset-password')?.addEventListener('click', resetPassword);
}

function topbar() {
  return `<nav class="topbar"><p>Hola, ${esc(user?.displayName || user?.email || '')}</p><div class="admin-tools">
    <button class="secondary-button" data-view="menu" type="button">Menú de hoy</button><button class="secondary-button" data-view="catalog" type="button">La carta</button><button class="secondary-button" data-view="promotions" type="button">Promociones</button><button class="secondary-button" data-view="vote" type="button">Vota por mañana</button><button class="secondary-button" data-view="orders" type="button">Mis pedidos</button>
    ${isAdmin ? '<button class="secondary-button" data-view="admin" type="button">Administración</button>' : ''}<button class="boton" id="logout" type="button">Cerrar sesión</button></div></nav>`;
}

function wireTopbar() {
  root.querySelector('#logout')?.addEventListener('click', () => signOut(auth));
  root.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { window.location.hash = button.dataset.view; }));
}

function renderMenuCards() {
  const todaysMenu = menu.filter(item => todaysDishIds.includes(item.id));
  if (!todaysMenu.length) return '<p class="empty-state">El menú de hoy todavía no está publicado. Vuelve pronto.</p>';
  return `<div class="menu-grid">${todaysMenu.map(item => `<article class="menu-card">${photoMarkup(item, 'dish-photo')}<div class="menu-card-top"><span class="category-pill">${esc(item.category || 'Del día')}</span></div>
    <h3>${esc(item.name)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ''}<div class="menu-card-bottom"><strong>${money(item.price)}</strong><button class="boton add-to-cart" data-add="${esc(item.id)}" type="button">Agregar</button></div></article>`).join('')}</div>`;
}

function photoMarkup(item, className) {
  const image = typeof item.imageData === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(item.imageData) ? item.imageData : '';
  return image ? `<img class="${className}" src="${esc(image)}" alt="Foto de ${esc(item.name)}" loading="lazy">` : `<div class="${className} photo-placeholder" aria-label="Sin foto">🍲</div>`;
}

function cartMarkup() {
  if (!cart.size) return '<p class="empty-state">Tu pedido está vacío. Agrega algo rico del menú.</p>';
  return `<ul class="cart-list">${[...cart.values()].map(item => `<li><div><strong>${esc(item.name)}</strong><small>${money(item.price)} c/u</small></div><div class="quantity"><button type="button" data-qty="-1" data-id="${esc(item.id)}" aria-label="Quitar uno">−</button><span>${item.quantity}</span><button type="button" data-qty="1" data-id="${esc(item.id)}" aria-label="Agregar uno">+</button></div><strong>${money(item.price * item.quantity)}</strong></li>`).join('')}</ul><p class="cart-total">Total estimado <strong>${money(totalCart())}</strong></p>`;
}

function renderMenu() {
  const todaysMenu = menu.filter(item => todaysDishIds.includes(item.id));
  root.innerHTML = shell(`${topbar()}<div class="hero-copy"><p class="eyebrow">SABOR CASERO, TODOS LOS DÍAS</p><h2>Menú de hoy</h2><p>Elige tus platillos y manda tu pedido.</p></div>
    <section class="panel-card"><div class="section-heading"><h2>Platillos de hoy</h2><span>${todaysMenu.length} platillo${todaysMenu.length === 1 ? '' : 's'}</span></div>${renderMenuCards()}</section>
    <section class="panel-card" id="order-cart"><h2>Tu pedido</h2>${cartMarkup()}<form id="order-form" class="formulario order-form">
      <div class="form-grid"><div class="campo"><label for="customer-name">Nombre</label><input id="customer-name" name="name" value="${esc(user?.displayName || '')}" maxlength="80" required></div>
      <div class="campo"><label for="customer-phone">Teléfono</label><input id="customer-phone" name="phone" type="tel" autocomplete="tel" maxlength="20" required></div>
      <div class="campo"><label for="order-date">Fecha deseada</label><input id="order-date" name="date" type="date" min="${todayISO()}" value="${todayISO()}" required></div>
      <div class="campo"><label for="order-time">Hora aproximada</label><input id="order-time" name="time" type="time" required></div></div>
      <fieldset class="delivery-choice"><legend>¿Cómo lo recibirás?</legend><label><input type="radio" name="delivery" value="pickup" checked> Recoger en el local</label><label><input type="radio" name="delivery" value="delivery"> Envío a domicilio</label></fieldset>
      <div class="campo address-field" hidden><label for="address">Dirección de entrega</label><textarea id="address" name="address" rows="2" maxlength="250" placeholder="Calle, número, colonia y referencias"></textarea></div>
      <div class="campo"><label for="order-notes">Indicaciones</label><textarea id="order-notes" name="notes" rows="2" maxlength="300" placeholder="Ej. sin cebolla, tocar el timbre…"></textarea></div>
      <p class="fine-print">El total y la disponibilidad se confirman al aceptar tu pedido. El costo de envío, si aplica, se confirma por teléfono.</p>
      <button class="boton" type="submit" ${busy || !cart.size ? 'disabled' : ''}>${busy ? 'Enviando…' : 'Enviar pedido'}</button></form></section>`);
  wireTopbar();
  root.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => addToCart(button.dataset.add)));
  root.querySelectorAll('[data-qty]').forEach(button => button.addEventListener('click', () => changeQuantity(button.dataset.id, Number(button.dataset.qty))));
  root.querySelectorAll('[name="delivery"]').forEach(radio => radio.addEventListener('change', toggleAddress));
  root.querySelector('#order-form').addEventListener('submit', submitOrder);
}

function renderCatalog() {
  root.innerHTML = shell(`${topbar()}<div class="hero-copy"><p class="eyebrow">CONOCE NUESTRA COCINA</p><h2>La carta</h2><p>Estos son algunos de los platillos que preparamos.</p></div><section class="panel-card">${menu.length ? `<div class="menu-grid">${menu.map(item => `<article class="menu-card">${photoMarkup(item, 'dish-photo')}<div class="menu-card-top"><span class="category-pill">${esc(item.category || 'Platillo')}</span></div><h3>${esc(item.name)}</h3>${item.description ? `<p>${esc(item.description)}</p>` : ''}<div class="menu-card-bottom"><strong>${money(item.price)}</strong></div></article>`).join('')}</div>` : '<p class="empty-state">Pronto publicaremos nuestros platillos.</p>'}</section>`);
  wireTopbar();
}

function renderPromotions() {
  const available = promotions.filter(promo => promo.active && promo.startDate <= todayISO() && promo.endDate >= todayISO())
    .map(promo => ({ ...promo, dish:menu.find(item => item.id === promo.dishId) })).filter(promo => promo.dish);
  root.innerHTML = shell(`${topbar()}<div class="hero-copy"><p class="eyebrow">POR TIEMPO LIMITADO</p><h2>Promociones</h2><p>Disfruta nuestras ofertas especiales.</p></div><section class="panel-card">${available.length ? `<div class="menu-grid">${available.map(promo => `<article class="menu-card promotion-card">${photoMarkup(promo.dish, 'dish-photo')}<div class="menu-card-top"><span class="category-pill">${esc(promo.dish.category || 'Promoción')}</span><span class="promo-badge">OFERTA</span></div><h3>${esc(promo.dish.name)}</h3>${promo.dish.description ? `<p>${esc(promo.dish.description)}</p>` : ''}<div class="menu-card-bottom"><span><del>${money(promo.dish.price)}</del> <strong>${money(promo.promoPrice)}</strong></span></div><small class="promo-dates">Válida hasta ${esc(promo.endDate)}</small></article>`).join('')}</div>` : '<p class="empty-state">Por ahora no hay promociones activas. ¡Pronto habrá nuevas ofertas!</p>'}</section>`);
  wireTopbar();
}

function renderVote() {
  root.innerHTML = shell(`${topbar()}<div class="hero-copy"><p class="eyebrow">TU OPINIÓN CUENTA</p><h2>¿Qué cocinamos mañana?</h2><p>Elige tu favorito de nuestra carta.</p></div><section class="panel-card"><form id="vote-form"><div class="vote-options">${menu.map(item => `<label class="vote-option">${photoMarkup(item, 'vote-photo')}<span><input type="radio" name="dishId" value="${esc(item.id)}" required> <strong>${esc(item.name)}</strong><small>${esc(item.category || '')}</small></span></label>`).join('')}</div><button class="boton" type="submit" ${menu.length ? '' : 'disabled'}>Enviar mi voto</button><p class="fine-print">Puedes cambiar tu voto durante el día. Los resultados los consulta la cocina.</p></form></section>`);
  wireTopbar();
  root.querySelector('#vote-form')?.addEventListener('submit', submitVote);
  loadMyVote();
}

async function loadMyVote() {
  try {
    const snap = await getDoc(doc(db, VOTES, `${todayISO()}_${user.uid}`));
    const radio = root.querySelector(`[name="dishId"][value="${CSS.escape(snap.data()?.dishId || '')}"]`);
    if (radio) radio.checked = true;
  } catch (error) { showNotice(errorMessage(error), 'error'); }
}

async function submitVote(event) {
  event.preventDefault();
  const dishId = new FormData(event.currentTarget).get('dishId');
  if (!menu.some(item => item.id === dishId)) return showNotice('Elige un platillo de la carta.', 'error');
  try {
    await setDoc(doc(db, VOTES, `${todayISO()}_${user.uid}`), { uid:user.uid, date:todayISO(), dishId, updatedAt:serverTimestamp() });
    showNotice('¡Listo! Guardamos tu voto para mañana.');
  } catch (error) { showNotice(errorMessage(error), 'error'); }
}

function toggleAddress() {
  const delivery = root.querySelector('[name="delivery"]:checked')?.value === 'delivery';
  const field = root.querySelector('.address-field');
  if (field) { field.hidden = !delivery; root.querySelector('#address').required = delivery; }
}

function addToCart(id) {
  const product = menu.find(item => item.id === id);
  if (!product) return;
  const current = cart.get(id);
  cart.set(id, { id, name:product.name, price:Number(product.price), quantity:(current?.quantity || 0) + 1 });
  notice = '';
  renderMenu();
  root.querySelector('#order-cart')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

function changeQuantity(id, delta) {
  const item = cart.get(id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart.delete(id);
  else cart.set(id, item);
  renderMenu();
}

function renderOrders() {
  root.innerHTML = shell(`${topbar()}<section class="panel-card"><div class="section-heading"><h2>Mis pedidos</h2><button class="secondary-button" data-view="menu" type="button">Hacer un pedido</button></div><div id="my-orders" class="empty-state">Cargando pedidos…</div></section>`);
  wireTopbar();
  loadMyOrders();
}

const statusText = status => ({ requested:'Nuevo', preparing:'Preparando', ready:'Listo', completed:'Entregado', canceled:'Cancelado' }[status] || status || 'Nuevo');
const orderItemsText = items => (items || []).map(item => `${esc(item.quantity)} × ${esc(item.name)}`).join(', ');

async function loadMyOrders() {
  const host = root.querySelector('#my-orders');
  if (!host) return;
  try {
    const snapshot = await getDocs(query(collection(db, ORDERS), where('uid', '==', user.uid)));
    const orders = snapshot.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    host.className = orders.length ? '' : 'empty-state';
    host.innerHTML = orders.length ? orders.map(order => `<article class="order-row"><div class="section-heading"><h3>Pedido ${esc(order.id.slice(-6).toUpperCase())}</h3><span class="status status-${esc(order.status)}">${esc(statusText(order.status))}</span></div><p>${esc(order.date)} · ${esc(order.time)} · ${order.delivery === 'delivery' ? 'A domicilio' : 'Recoger'}</p><p>${orderItemsText(order.items)}</p><strong>${money(order.total)}</strong>${order.address ? `<p>Dirección: ${esc(order.address)}</p>` : ''}</article>`).join('') : '<p>Aún no tienes pedidos.</p>';
  } catch (error) { host.innerHTML = `<p class="notice error">${esc(errorMessage(error))}</p>`; }
}

function renderAdmin() {
  root.innerHTML = shell(`${topbar()}<p class="descripcion-pagina">Organiza el menú del día, revisa la encuesta y atiende los pedidos.</p>
    <section class="panel-card"><div class="section-heading"><h2>Menú para hoy</h2><span>${todayISO()}</span></div><p class="fine-print">Marca los platillos de la carta que ofrecerás hoy. La carta completa se conserva por separado.</p><div id="daily-menu-editor"></div><button class="boton" id="save-daily-menu" type="button">Publicar menú de hoy</button></section>
    <section class="panel-card"><div class="section-heading"><h2>Votos para mañana</h2><span>${todayISO()}</span></div><div id="vote-results" class="empty-state">Cargando resultados…</div></section>
    <section class="panel-card"><h2>Crear promoción</h2><form id="promotion-form" class="formulario"><div class="form-grid">
      <div class="campo"><label for="promo-dish">Platillo de la carta</label><select id="promo-dish" name="dishId" required>${menu.map(item => `<option value="${esc(item.id)}">${esc(item.name)} — ${money(item.price)}</option>`).join('')}</select></div>
      <div class="campo"><label for="promo-price">Precio de promoción</label><input id="promo-price" name="promoPrice" type="number" min="0.01" step="0.01" required></div>
      <div class="campo"><label for="promo-start">Desde</label><input id="promo-start" name="startDate" type="date" value="${todayISO()}" required></div>
      <div class="campo"><label for="promo-end">Hasta</label><input id="promo-end" name="endDate" type="date" value="${todayISO()}" required></div>
    </div><button class="boton" type="submit" ${menu.length ? '' : 'disabled'}>Publicar promoción</button></form><div id="admin-promotions"></div></section>
    <section class="panel-card"><h2>Agregar platillo</h2><form class="formulario" id="product-form"><div class="form-grid">
      <div class="campo"><label for="product-name">Platillo</label><input id="product-name" name="name" maxlength="80" required></div>
      <div class="campo"><label for="product-category">Categoría</label><input id="product-category" name="category" maxlength="40" placeholder="Comida corrida, bebida…" required></div>
      <div class="campo"><label for="product-price">Precio</label><input id="product-price" name="price" type="number" min="0.01" step="0.01" required></div>
      <div class="campo"><label for="product-description">Descripción</label><input id="product-description" name="description" maxlength="180" placeholder="Ingredientes o acompañamiento"></div>
      <div class="campo photo-field"><label for="product-image">Foto del platillo</label><div><input id="product-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required><small>JPG, PNG o WebP; se reduce automáticamente para guardarse en Firebase.</small><img id="product-photo-preview" class="photo-preview" alt="Vista previa de la foto" hidden></div></div></div>
      <button class="boton" type="submit">Publicar platillo</button></form><div id="admin-menu"></div></section>
    <section class="panel-card"><div class="section-heading"><h2>Pedidos recibidos</h2><div class="campo"><label for="filter-date">Fecha</label><input id="filter-date" type="date" value="${todayISO()}"></div></div><div id="admin-orders" class="empty-state">Cargando pedidos…</div></section>`);
  wireTopbar();
  renderDailyMenuEditor();
  loadVoteResults();
  renderAdminPromotions();
  root.querySelector('#promotion-form').addEventListener('submit', addPromotion);
  root.querySelector('#save-daily-menu').addEventListener('click', saveDailyMenu);
  renderAdminMenu();
  root.querySelector('#product-form').addEventListener('submit', addProduct);
  root.querySelector('#product-image').addEventListener('change', previewProductPhoto);
  root.querySelector('#filter-date').addEventListener('change', loadAdminOrders);
  loadAdminOrders();
}

function renderAdminPromotions() {
  const host = root.querySelector('#admin-promotions');
  if (!host) return;
  const current = promotions.map(promo => ({ ...promo, dish:menu.find(item => item.id === promo.dishId) }));
  host.innerHTML = `<h3 class="subheading">Promociones publicadas</h3>${current.length ? `<div class="admin-product-list">${current.map(promo => `<article class="admin-row">${promo.dish ? photoMarkup(promo.dish, 'admin-dish-photo') : ''}<div class="admin-product-info"><strong>${esc(promo.dish?.name || 'Platillo eliminado')}</strong><p>${money(promo.promoPrice)} · ${esc(promo.startDate)} al ${esc(promo.endDate)} · ${promo.active ? 'Activa' : 'Inactiva'}</p></div><button class="boton-eliminar" type="button" data-delete-promo="${esc(promo.id)}">Retirar</button></article>`).join('')}</div>` : '<p class="empty-state">Aún no hay promociones publicadas.</p>'}`;
  host.querySelectorAll('[data-delete-promo]').forEach(button => button.addEventListener('click', () => removePromotion(button.dataset.deletePromo)));
}

async function addPromotion(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const dishId = String(form.get('dishId') || '');
  const dish = menu.find(item => item.id === dishId);
  const promoPrice = Number(form.get('promoPrice'));
  const startDate = String(form.get('startDate'));
  const endDate = String(form.get('endDate'));
  if (!dish || !Number.isFinite(promoPrice) || promoPrice <= 0 || promoPrice >= Number(dish.price)) return showNotice('El precio de promoción debe ser menor al precio normal.', 'error');
  if (!startDate || !endDate || endDate < startDate) return showNotice('Revisa las fechas de la promoción.', 'error');
  try {
    await addDoc(collection(db, PROMOTIONS), { dishId, promoPrice, startDate, endDate, active:true, createdAt:serverTimestamp() });
    await loadPromotions(); notice = 'Promoción publicada.'; noticeType = 'success'; renderAdmin();
  } catch (error) { showNotice(errorMessage(error), 'error'); }
}

async function removePromotion(id) {
  if (!confirm('¿Retirar esta promoción?')) return;
  try { await deleteDoc(doc(db, PROMOTIONS, id)); await loadPromotions(); notice = 'Promoción retirada.'; renderAdmin(); }
  catch (error) { showNotice(errorMessage(error), 'error'); }
}

function renderDailyMenuEditor() {
  const host = root.querySelector('#daily-menu-editor');
  if (!host) return;
  host.innerHTML = menu.length ? `<div class="daily-menu-options">${menu.map(item => `<label><input type="checkbox" value="${esc(item.id)}" ${todaysDishIds.includes(item.id) ? 'checked' : ''}> ${esc(item.name)}</label>`).join('')}</div>` : '<p class="empty-state">Primero agrega platillos a la carta.</p>';
}

async function saveDailyMenu() {
  const button = root.querySelector('#save-daily-menu');
  const dishIds = [...root.querySelectorAll('#daily-menu-editor input:checked')].map(input => input.value);
  if (!dishIds.length) return showNotice('Selecciona al menos un platillo para el menú de hoy.', 'error');
  button.disabled = true;
  try {
    await setDoc(doc(db, DAILY_MENUS, todayISO()), { date:todayISO(), dishIds, updatedAt:serverTimestamp(), updatedBy:user.uid });
    todaysDishIds = dishIds; notice = 'Menú de hoy publicado.'; noticeType = 'success'; renderAdmin();
  } catch (error) { showNotice(errorMessage(error), 'error'); }
  finally { button.disabled = false; }
}

async function loadVoteResults() {
  const host = root.querySelector('#vote-results');
  if (!host) return;
  try {
    const snap = await getDocs(query(collection(db, VOTES), where('date', '==', todayISO())));
    const counts = new Map(menu.map(item => [item.id, 0]));
    snap.docs.forEach(vote => { const id = vote.data().dishId; if (counts.has(id)) counts.set(id, counts.get(id) + 1); });
    const max = Math.max(1, ...counts.values());
    const sorted = [...counts].sort((a,b) => b[1]-a[1]);
    host.className = sorted.some(([,count]) => count) ? 'vote-results' : 'empty-state';
    host.innerHTML = sorted.some(([,count]) => count) ? `${sorted.map(([id,count]) => { const item = menu.find(dish => dish.id === id); return `<div class="vote-result"><div><strong>${esc(item?.name || 'Platillo')}</strong><span>${count} voto${count === 1 ? '' : 's'}</span></div><div class="vote-bar"><i style="width:${Math.round(count/max*100)}%"></i></div></div>`; }).join('')}<p class="fine-print">El platillo más votado: <strong>${esc(menu.find(item => item.id === sorted[0][0])?.name || '')}</strong>. Usa este resultado para planear el menú de mañana.</p>` : '<p>Aún no hay votos para mañana.</p>';
  } catch (error) { host.innerHTML = `<p class="notice error">${esc(errorMessage(error))}</p>`; }
}

function renderAdminMenu() {
  const host = root.querySelector('#admin-menu');
  if (!host) return;
  host.innerHTML = `<h3 class="subheading">Platillos publicados</h3>${menu.length ? `<div class="admin-product-list">${menu.map(item => `<article class="admin-row">${photoMarkup(item, 'admin-dish-photo')}<div class="admin-product-info"><strong>${esc(item.name)}</strong><p>${esc(item.category || '')} · ${money(item.price)}</p></div><button class="boton-eliminar" type="button" data-delete-product="${esc(item.id)}">Quitar del menú</button></article>`).join('')}</div>` : '<p class="empty-state">Todavía no agregas platillos.</p>'}`;
  host.querySelectorAll('[data-delete-product]').forEach(button => button.addEventListener('click', () => removeProduct(button.dataset.deleteProduct)));
}

async function loadAdminOrders() {
  const host = root.querySelector('#admin-orders');
  const date = root.querySelector('#filter-date')?.value;
  if (!host || !date) return;
  host.textContent = 'Cargando…';
  try {
    const snapshot = await getDocs(query(collection(db, ORDERS), where('date', '==', date)));
    const orders = snapshot.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => a.time.localeCompare(b.time));
    host.className = orders.length ? '' : 'empty-state';
    host.innerHTML = orders.length ? orders.map(order => `<article class="order-row"><div class="section-heading"><h3>${esc(order.time)} · ${esc(order.customerName)}</h3><span class="status status-${esc(order.status)}">${esc(statusText(order.status))}</span></div>
      <p>Teléfono: <a href="tel:${esc(order.phone)}">${esc(order.phone)}</a> · ${order.delivery === 'delivery' ? 'A domicilio' : 'Recoger en local'}</p>${order.address ? `<p>Dirección: ${esc(order.address)}</p>` : ''}<p>Pedido: ${orderItemsText(order.items)}</p><p>Total estimado: <strong>${money(order.total)}</strong></p>${order.notes ? `<p>Indicaciones: ${esc(order.notes)}</p>` : ''}
      <div class="order-actions"><label for="status-${esc(order.id)}">Estado</label><select id="status-${esc(order.id)}" data-order-status="${esc(order.id)}"><option value="requested" ${order.status === 'requested' ? 'selected' : ''}>Nuevo</option><option value="preparing" ${order.status === 'preparing' ? 'selected' : ''}>Preparando</option><option value="ready" ${order.status === 'ready' ? 'selected' : ''}>Listo</option><option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Entregado</option><option value="canceled" ${order.status === 'canceled' ? 'selected' : ''}>Cancelado</option></select></div></article>`).join('') : '<p>No hay pedidos para esta fecha.</p>';
    host.querySelectorAll('[data-order-status]').forEach(select => select.addEventListener('change', () => changeOrderStatus(select.dataset.orderStatus, select.value)));
  } catch (error) { host.innerHTML = `<p class="notice error">${esc(errorMessage(error))}</p>`; }
}

async function changeOrderStatus(id, status) {
  try { await updateDoc(doc(db, ORDERS, id), { status }); notice = 'Estado del pedido actualizado.'; noticeType = 'success'; await loadAdminOrders(); }
  catch (error) { showNotice(errorMessage(error), 'error'); }
}

async function addProduct(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const product = { name:String(form.get('name')).trim(), category:String(form.get('category')).trim(), description:String(form.get('description')).trim(), price:Number(form.get('price')), active:true };
  const imageFile = form.get('image');
  if (!product.name || !product.category || !Number.isFinite(product.price) || product.price <= 0) return showNotice('Revisa el nombre, categoría y precio.', 'error');
  if (!(imageFile instanceof File) || !imageFile.size) return showNotice('Selecciona una foto del platillo.', 'error');
  const button = formElement.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Comprimiendo foto…';
  try {
    product.imageData = await compressPhoto(imageFile);
    button.textContent = 'Guardando platillo…';
    await addDoc(collection(db, PRODUCTS), product);
    formElement.reset(); clearPhotoPreview(); await loadMenu(); notice = 'Platillo y foto publicados.'; render();
  } catch (error) { showNotice(errorMessage(error), 'error'); }
  finally { button.disabled = false; }
}

function previewProductPhoto(event) {
  clearPhotoPreview();
  const file = event.currentTarget.files?.[0];
  const preview = root.querySelector('#product-photo-preview');
  if (!file || !preview) return;
  photoPreviewUrl = URL.createObjectURL(file);
  preview.src = photoPreviewUrl;
  preview.hidden = false;
}

function clearPhotoPreview() {
  if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  photoPreviewUrl = '';
}

async function compressPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('La foto debe estar en formato JPG, PNG o WebP.');
  if (file.size > 12 * 1024 * 1024) throw new Error('La foto original debe pesar menos de 12 MB.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('No se pudo abrir la foto. Elige otra imagen.'));
      element.src = objectUrl;
    });
    const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob = null;
    for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 240 * 1024) break;
    }
    if (!blob || blob.size > 240 * 1024) throw new Error('La foto no se pudo reducir lo suficiente. Prueba con otra imagen más sencilla.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo preparar la foto. Intenta de nuevo.'));
      reader.readAsDataURL(blob);
    });
    if (dataUrl.length > 350000) throw new Error('La foto comprimida todavía es demasiado grande. Prueba con otra imagen.');
    return dataUrl;
  } finally { URL.revokeObjectURL(objectUrl); }
}

async function removeProduct(id) {
  if (!confirm('¿Quitar este platillo del menú? Los pedidos anteriores conservarán su descripción.')) return;
  try { await deleteDoc(doc(db, PRODUCTS, id)); await loadMenu(); notice = 'Platillo retirado del menú.'; render(); }
  catch (error) { showNotice(errorMessage(error), 'error'); }
}

async function submitOrder(event) {
  event.preventDefault();
  if (!cart.size) return showNotice('Agrega al menos un platillo al pedido.', 'error');
  const form = new FormData(event.currentTarget);
  const delivery = String(form.get('delivery'));
  const address = String(form.get('address') || '').trim();
  if (delivery === 'delivery' && !address) return showNotice('Escribe la dirección de entrega.', 'error');
  const order = { uid:user.uid, customerName:String(form.get('name')).trim(), email:user.email || '', phone:String(form.get('phone')).trim(), date:String(form.get('date')), time:String(form.get('time')), delivery, address:delivery === 'delivery' ? address : '', notes:String(form.get('notes') || '').trim(), items:[...cart.values()].map(({id,name,price,quantity}) => ({ id, name, price, quantity })), total:totalCart(), status:'requested', createdAt:serverTimestamp() };
  if (!order.customerName || !order.phone || !order.date || !order.time) return showNotice('Completa tu nombre, teléfono, fecha y hora.', 'error');
  busy = true; notice = ''; render();
  try { await addDoc(collection(db, ORDERS), order); cart.clear(); notice = '¡Pedido enviado! La cocina confirmará disponibilidad y costo de envío.'; noticeType = 'success'; window.location.hash = 'orders'; }
  catch (error) { notice = errorMessage(error); noticeType = 'error'; }
  finally { busy = false; render(); }
}

async function loadMenu() {
  if (!db) return;
  try {
    const snapshot = await getDocs(query(collection(db, PRODUCTS), where('active', '==', true)));
    menu = snapshot.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => a.category.localeCompare(b.category, 'es') || a.name.localeCompare(b.name, 'es'));
    const dailySnapshot = await getDoc(doc(db, DAILY_MENUS, todayISO()));
    todaysDishIds = dailySnapshot.exists() ? dailySnapshot.data().dishIds || [] : [];
    await loadPromotions();
  } catch (error) { showNotice(errorMessage(error), 'error'); }
}

async function loadPromotions() {
  try {
    const snapshot = await getDocs(query(collection(db, PROMOTIONS), where('active', '==', true)));
    promotions = snapshot.docs.map(d => ({ id:d.id, ...d.data() }));
  } catch (error) { showNotice(errorMessage(error), 'error'); }
}

async function checkAdmin(current) {
  if (!current) { isAdmin = false; return; }
  try {
    const [newRole, legacyRole] = await Promise.all([
      getDoc(doc(db, 'cocinaAdmins', current.uid)),
      getDoc(doc(db, 'appsalonAdmins', current.uid))
    ]);
    isAdmin = newRole.exists() || legacyRole.exists();
  } catch { isAdmin = false; }
}

async function handleAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = String(form.get('email')).trim();
  const password = String(form.get('password'));
  busy = true; notice = ''; render();
  try {
    if (authMode === 'register') {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName:String(form.get('name')).trim() });
    } else await signInWithEmailAndPassword(auth, email, password);
  } catch (error) { notice = errorMessage(error); noticeType = 'error'; }
  finally { busy = false; render(); }
}

async function resetPassword() {
  const email = root.querySelector('#auth-email')?.value.trim();
  if (!email) return showNotice('Escribe tu correo para enviarte el enlace de recuperación.', 'error');
  try { await sendPasswordResetEmail(auth, email); showNotice('Revisa tu correo para restablecer la contraseña.'); }
  catch (error) { showNotice(errorMessage(error), 'error'); }
}

function errorMessage(error) {
  const messages = { 'auth/email-already-in-use':'Ese correo ya tiene una cuenta.', 'auth/invalid-email':'El correo no es válido.', 'auth/invalid-credential':'Correo o contraseña incorrectos.', 'auth/weak-password':'Usa una contraseña de al menos 6 caracteres.', 'auth/network-request-failed':'No hay conexión. Intenta de nuevo.', 'auth/too-many-requests':'Hubo muchos intentos. Espera un momento y prueba de nuevo.', 'permission-denied':'Firebase rechazó esta operación. Revisa las reglas de Firestore.' };
  return messages[error.code] || error.message || `No se pudo completar la operación (${error.code || 'error'}).`;
}

function render() {
  if (!configReady) return renderConfigHelp();
  if (!user) return renderAuth();
  if (window.location.hash === '#admin' && isAdmin) return renderAdmin();
  if (window.location.hash === '#orders') return renderOrders();
  if (window.location.hash === '#catalog') return renderCatalog();
  if (window.location.hash === '#promotions') return renderPromotions();
  if (window.location.hash === '#vote') return renderVote();
  return renderMenu();
}

if (auth) onAuthStateChanged(auth, async current => {
  user = current;
  await checkAdmin(current);
  await loadMenu();
  if (!isAdmin && window.location.hash === '#admin') window.location.hash = 'menu';
  render();
});
else renderConfigHelp();
window.addEventListener('hashchange', render);
