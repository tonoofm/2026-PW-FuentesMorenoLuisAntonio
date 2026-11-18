const $ = (id) => document.getElementById(id);

async function llamar(metodo, url, cuerpo) {
  const opciones = { method: metodo, headers: {} };
  if (cuerpo !== undefined) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }

  let respuesta;
  try {
    respuesta = await fetch(url, opciones);
  } catch (error) {
    return { status: 0, datos: { error: `No se pudo conectar con el servidor (${error.message})` } };
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }
  return { status: respuesta.status, datos };
}

function claseDelCodigo(status) {
  if (status >= 200 && status < 300) return 'codigo ok';
  if (status === 401) return 'codigo e401';
  if (status === 403) return 'codigo e403';
  return 'codigo error';
}

function anotar(metodo, url, status, datos) {
  const li = document.createElement('li');

  const codigo = document.createElement('span');
  codigo.className = claseDelCodigo(status);
  codigo.textContent = status;

  const pedido = document.createElement('strong');
  pedido.textContent = ` ${metodo} ${url}`;

  const json = document.createElement('pre');
  json.textContent = JSON.stringify(datos, null, 2);

  li.append(codigo, pedido, json);
  $('bitacora').prepend(li);
}

async function mostrarEstado() {
  const { status, datos } = await llamar('GET', '/api/sesion');
  const estado = $('estado');

  if (status === 200 && datos && datos.usuario) {
    const { nombre, rol } = datos.usuario;
    estado.textContent = `Con sesión: ${nombre} (${rol}) · sesión ${datos.sesion} · vence en ${datos.expiraEnSegundos} s`;
    estado.className = 'estado con-sesion';
  } else {
    estado.textContent = status === 0 ? 'Sin conexión con el servidor' : `Sin sesión (el servidor responde ${status})`;
    estado.className = 'estado sin-sesion';
  }

  $('cookie-js').textContent = document.cookie || '(vacío)';
}

function celda(texto) {
  const td = document.createElement('td');
  td.textContent = texto;
  return td;
}

async function mostrarSesiones() {
  const { status, datos } = await llamar('GET', '/api/diagnostico/sesiones');
  const tabla = $('tabla-sesiones');
  tabla.replaceChildren();

  if (status !== 200 || !datos) {
    $('donde').textContent = `No se pudo leer el almacén (código ${status})`;
    const tr = document.createElement('tr');
    const td = celda('(sin datos)');
    td.colSpan = 4;
    tr.append(td);
    tabla.append(tr);
    return;
  }

  $('donde').textContent =
    datos.almacen === 'memoria'
      ? 'En la MEMORIA del servidor (se pierden al reiniciar)'
      : 'En MySQL, tabla sessions (sobreviven a un reinicio del servidor)';

  if (!datos.sesiones || datos.sesiones.length === 0) {
    const tr = document.createElement('tr');
    const td = celda('(sin sesiones)');
    td.colSpan = 4;
    tr.append(td);
    tabla.append(tr);
    return;
  }

  for (const s of datos.sesiones) {
    const tr = document.createElement('tr');
    if (s.esLaTuya) tr.className = 'tuya';
    const vence = s.expira ? new Date(s.expira).toLocaleTimeString() : '—';
    tr.append(
      celda(s.esLaTuya ? `${s.sesion} (la tuya)` : s.sesion),
      celda(s.usuario || '(sin usuario)'),
      celda(String(s.visitas)),
      celda(vence),
    );
    tabla.append(tr);
  }
}

async function refrescarTodo() {
  await Promise.all([mostrarEstado(), mostrarSesiones()]);
}

$('form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const cuerpo = { usuario: $('usuario').value, contrasena: $('contrasena').value };
  const { status, datos } = await llamar('POST', '/api/login', cuerpo);
  anotar('POST', '/api/login', status, datos);
  await refrescarTodo();
});

$('usuario').addEventListener('change', () => {
  $('contrasena').value = `${$('usuario').value}12345`;
});

document.querySelectorAll('button[data-url]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    const { metodo, url } = boton.dataset;
    const { status, datos } = await llamar(metodo, url);
    anotar(metodo, url, status, datos);
    await refrescarTodo();
  });
});

$('btn-refrescar').addEventListener('click', refrescarTodo);
$('btn-sesiones').addEventListener('click', mostrarSesiones);

async function iniciar() {
  const { status, datos } = await llamar('GET', '/api/config');
  $('config').textContent = status === 200 ? JSON.stringify(datos, null, 2) : `Error ${status}`;
  await refrescarTodo();
}

iniciar();