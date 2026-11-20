// La aplicación de la demo. server.js la arranca; las pruebas la arrancan con otras configuraciones.
// Lo que dice "(en clase)" es lo que se programó en clase, paso por paso.
const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { crearModeloUsuarios } = require('./modelos/usuarios.modelo');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { crearModeloTokens } = require('./modelos/tokens.modelos');
const NOMBRE_COOKIE = 'connect.sid';

// Para la demo nunca mostramos el id completo de la sesión: solo sus primeros 8 caracteres.
function idCorto(id) {
  return id ? `${String(id).slice(0, 8)}…` : null;
}

function crearApp(config, pool) {
  const app = express();
  const usuarios = crearModeloUsuarios(pool);

  // express.json() lee el cuerpo de las peticiones con Content-Type: application/json.
  app.use(express.json());

  // ---------- Paso 1 (en clase): configurar la sesión ----------
  // Dónde se guardan las sesiones: en la tabla sessions de MySQL o en la memoria del proceso.
  const almacen =
    config.almacen === 'memoria'
      ? new session.MemoryStore()
      : new MySQLStore({ createDatabaseTable: true, clearExpired: true, checkExpirationInterval: 60 * 1000 }, pool);

  app.use(
    session({
      name: NOMBRE_COOKIE,
      secret: process.env.SESSION_SECRET || 'cambia-este-secreto', // con esto se FIRMA el id que va en la cookie
      store: almacen,
      resave: false, // no reescribir la sesión si no cambió
      saveUninitialized: false, // no crear sesión (ni cookie) hasta que haya algo que guardar
      rolling: config.rolling, // true: cada respuesta reinicia el reloj de la cookie
      cookie: {
        maxAge: config.maxAgeMs,
        httpOnly: config.httpOnly,
        sameSite: config.sameSite,
        secure: false, // en http://localhost no hay HTTPS; en un servidor real va en true
        path: '/',
      },
    }),
  );

  // ---------- Paso 5 (en clase): el servidor decide cuándo vence ----------
  // Momento (en ms) en que vence una sesión con usuario:
  //  rolling: false → hora fija desde que inició sesión.
  //  rolling: true  → desde la última vez que se usó.
  function venceEn(sesion) {
    if (sesion && sesion.usuario) {
      const desde = config.rolling ? sesion.ultimoUso : sesion.inicio;
      if (typeof desde === 'number') return desde + config.maxAgeMs;
    }
    // Sesión sin usuario (solo visitas): la fecha de la cookie que guardó el almacén.
    const expira = sesion && sesion.cookie && sesion.cookie.expires;
    return expira ? new Date(expira).getTime() : null;
  }

  function vencida(sesion) {
    const limite = venceEn(sesion);
    return limite !== null && Date.now() > limite;
  }

  // Borra la cookie del navegador (manda la cookie vacía con fecha de 1970).
  function borrarCookie(res) {
    res.clearCookie(NOMBRE_COOKIE, { path: '/' });
  }

  // ---------- Paso 1 (en clase): requiereSesion → 401 ----------
  function requiereSesion(req, res, next) {
    if (!req.session || !req.session.usuario) {
      return res.status(401).json({ error: '401 · No has iniciado sesión (o tu sesión ya venció)' });
    }
    if (vencida(req.session)) {
      // Aunque el navegador mande la cookie, el servidor ya no la acepta: destruye la sesión.
      return req.session.destroy(() => {
        borrarCookie(res);
        res.status(401).json({ error: '401 · Tu sesión venció: vuelve a iniciar sesión' });
      });
    }
    if (config.rolling) req.session.ultimoUso = Date.now(); // con rolling, usarla la renueva
    return next();
  }

  // ---------- Paso 3 (en clase): requiereRol → 403 ----------
  // Se usa SIEMPRE después de requiereSesion: primero "¿quién eres?" y luego "¿puedes?".
  function requiereRol(rol) {
    return (req, res, next) => {
      if (req.session.usuario.rol !== rol) {
        return res
          .status(403)
          .json({ error: `403 · Eres ${req.session.usuario.usuario}, pero esta ruta es solo para ${rol}` });
      }
      return next();
    };
  }

  // Envuelve una ruta async para que un error vaya al manejador de errores (500) y no tumbe el servidor.
  const asincrona = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

  // Promesas para los métodos de sesión que usan callback.
  const regenerar = (req) => new Promise((ok, mal) => req.session.regenerate((e) => (e ? mal(e) : ok())));
  const guardar = (req) => new Promise((ok, mal) => req.session.save((e) => (e ? mal(e) : ok())));

  // ---------- Rutas ----------
  app.get('/api/config', (req, res) => {
    res.json(config);
  });

  // Sin protección: cuenta visitas. Crea una sesión (y su cookie) aunque no haya usuario.
  app.post('/api/visita', (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({ visitas: req.session.visitas, sesion: idCorto(req.sessionID) });
  });

  // ---------- Paso 2 y paso 7 (en clase): login ----------
  app.post(
    '/api/login',
    asincrona(async (req, res) => {
      const { usuario, contrasena } = req.body || {};
      const encontrado =
        typeof usuario === 'string' && typeof contrasena === 'string'
          ? await usuarios.verificar(usuario, contrasena)
          : null;
      if (!encontrado) {
        // El mismo mensaje si el usuario no existe o si la contraseña está mal. No tocamos la sesión: no hay cookie.
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      }

      // ¿Ya traía una sesión con datos (por ejemplo, de /api/visita)?
      const teniaSesion = Object.keys(req.session).some((clave) => clave !== 'cookie');
      const sesionAntes = teniaSesion ? idCorto(req.sessionID) : null;

      // Paso 7: contra la fijación de sesión, al entrar se crea una sesión NUEVA (otro id).
      if (config.regenerarAlEntrar) await regenerar(req);

      const ahora = Date.now();
      req.session.usuario = encontrado; // { id, usuario, nombre, rol } — sin el hash
      req.session.inicio = ahora;
      req.session.ultimoUso = ahora;
      await guardar(req);

      return res.json({ usuario: encontrado, sesionAntes, sesionDespues: idCorto(req.sessionID) });
    }),
  );

  // ---------- Paso 2 (en clase): logout ----------
  app.post('/api/logout', (req, res, next) => {
    req.session.destroy((error) => {
      if (error) return next(error);
      borrarCookie(res);
      return res.json({ mensaje: 'Sesión cerrada: el servidor la borró' });
    });
  });

  app.get('/api/sesion', requiereSesion, (req, res) => {
    const limite = venceEn(req.session);
    res.json({
      usuario: req.session.usuario,
      sesion: idCorto(req.sessionID),
      expiraEnSegundos: Math.max(0, Math.round((limite - Date.now()) / 1000)),
    });
  });

  app.get('/api/perfil', requiereSesion, (req, res) => {
    req.session.visitas = (req.session.visitas || 0) + 1;
    res.json({
      mensaje: `Hola, ${req.session.usuario.nombre}`,
      rol: req.session.usuario.rol,
      visitas: req.session.visitas,
    });
  });

  // El orden importa: primero requiereSesion (401) y después requiereRol (403).
  app.get('/api/admin/reporte', requiereSesion, requiereRol('admin'), (req, res) => {
    res.json({ reporte: 'Talleres: 3 · Inscritos: 57 · Cupo libre: 18' });
  });

  // Solo para la clase: lo que guarda el servidor. Un servidor real nunca muestra esto.
  app.get('/api/diagnostico/sesiones', (req, res, next) => {
    almacen.all((error, todas) => {
      if (error) return next(error);
      const sesiones = Object.entries(todas || {})
        .filter(([, datos]) => datos && !vencida(datos))
        .map(([id, datos]) => {
          const limite = venceEn(datos);
          return {
            sesion: idCorto(id),
            esLaTuya: id === req.sessionID,
            usuario: datos.usuario ? datos.usuario.usuario : null,
            visitas: datos.visitas || 0,
            expira: limite ? new Date(limite).toISOString() : null,
          };
        });
      return res.json({ almacen: config.almacen === 'memoria' ? 'memoria' : 'mysql', sesiones });
    });
  });

  // Cualquier otra ruta de la API: 404 en JSON.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `404 · No existe la ruta ${req.method} ${req.originalUrl}` });
  });

  // El frontend (index.html, estilos.css, demo.js).
  app.use(express.static(path.join(__dirname, 'public')));

  // Errores inesperados: 500 en JSON. El detalle real sale en la terminal del servidor.
  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: '500 · Error del servidor' });
  });

  //implementación de jwt

  const SECRETO_JWT = config.jwtSecreto || process.env.JWT_SECRET || 'secreto-jwt-solo-para-esta-deno';

  //vamos a crear una función para poder verificar y firmar que el token sea auténtico y sino a volar

  function firmarToken(usuario) {
    return jwt.sign(
      {
        sub: String(usuario.id),
        usuario: usuario.usuario,
        nombre: usuario.nombre,
        rol: usuario.rol,
      },
      SECRETO_JWT,
      {
        algorithm: 'HS256',
        expiresIn: config.jwtExpiraSeg,
        jwtid: crypto.randomUUID(),
      },
    );
  }

  //tenemos que hacer una función que se encargue de validar quien necesita un token o no dentro de la aplicación entre el middleware
  async function requiereJWT(req, res, next) {
    const encabezado = req.headers.authorization || '';
    if (!encabezado.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Falta un token asociado' });
    }
    const token = encabezado.slice('Bearer '.length);

    let datos;
    try {
      datos = jwt.verify(token, SECRETO_JWT, { algorithms: ['HS256'] });
    } catch (error) {
      if(error === 'TokenExpiredError'){
        return res.status(401).json({ error: 'Token expirado, por favor renuévelo' });
      }
      return res.status(401).json({ error: 'Token inválido' });
    }

    try {
      if(config.jwtRevocar && (await tokens.estaRevocado(datos.jti))){
        return res.status(401).json({ error: 'Token revocado' });
      }
    } catch (error) {
      return next(error);
    }
    req.jwt = datos;
    next();
  }

  //403 el token es válido pero no el rol
  function requiereRolJWT(rol) {
    return (req, res, next) => {
      if (req.jwt.rol !== rol) {
        return res.status(403).json({ error: `Eres ${req.jwt.usuario}, pero esta ruta es solo para ${rol}` });
      }
      next();
    };
  }


  app.post('/api/jwt/login', asincrona(async (req, res) => {
    try {
      const { usuario, contrasena } = req.body || {};
      const datos = await usuarios.verificar(usuario, contrasena);
      if (!datos) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      res.json({ token: firmarToken(datos), usuario: datos });
    } catch (error) {
      next(error);
    }
  }));

  app.get('/api/jwt/perfil', requiereJWT, (req, res) => {
    res.json({ mensaje: `Hola, ${req.jwt.nombre}`, rol: req.jwt.rol,
       expiraEnSegundos: Math.max(0, req.jwt.exp - Math.floor(Date.now() / 1000)) });
  });

// ruta para admin
app.get('/api/jwt/admin/reporte', requiereJWT, requiereRolJWT('admin'), (req, res) => {
  res.json({ reporte: 'Talleres: 3' });
});

app.post('/api/jwt/refresh', requiereJWT, asincrona(async (req, res) => {
  const { sub, usuario, nombre, rol } = req.jwtM;
  res.json({ token: firmarToken({ id: sub, usuario, nombre, rol }) });
}));

app.post('/api/jwt/logout', requiereJWT, asincrona(async (req, res, next) => {
  try {
    if (config.jwtRevocar) {
      await tokens.revocar(req.jwt.jti, req.jwt.usuario, req.jwt.exp);
      return res.json({ mensaje: 'Token revocado en el servidor, se registra en la lista negra' });
    }
    res.json({ mensaje: 'el servidor no guarda nada' });
  } catch (error) {
    next(error);
  }
}));
      return app;
}

module.exports = { crearApp, NOMBRE_COOKIE };