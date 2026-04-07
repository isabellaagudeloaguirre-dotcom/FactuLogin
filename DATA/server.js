require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const nodemailer = require('nodemailer');

const {
  createUser,
  getUserByEmail,
  getAllUsers,
  getUserById,
  updateUserProfileImage,
  addNotification,
  getNotificationsByUser,
  addInvoice,
  getInvoicesByUser,
  addUserEvent,
  createClient,
  getClients,
  createCompany,
  getCompanies,
  createProduct,
  getProducts,
  getProductById,
  createOrder,
  createOrderItem,
  getOrders,
} = require('./db');

const app = express();

const PORT = process.env.PORT || 3000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:4200';
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `profile-${Date.now()}${ext}`);
  },
});

const upload = multer({ storage });
const mailer = SMTP_HOST && SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || origin === FRONTEND_ORIGIN) return cb(null, true);
      return cb(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'API FactuLogin funcionando' });
});

app.get('/api/users', async (_req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { nombre, correo, password } = req.body;

    if (!nombre || !correo || !password) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const existing = await getUserByEmail(correo);
    if (existing) {
      return res
        .status(409)
        .json({ error: 'El usuario ya existe con ese correo' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await createUser({
      name: nombre,
      email: correo,
      passwordHash,
    });

    await addNotification(user.id, 'Tu cuenta fue creada correctamente.');
    await addInvoice(user.id, 'Factura demo de bienvenida', 0);

    res.status(201).json({
      ok: true,
      user,
      message: 'Usuario creado correctamente',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const user = await getUserByEmail(correo);

    if (!user) {
      return res
        .status(401)
        .json({ ok: false, error: 'Correo o contraseña incorrectos' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res
        .status(401)
        .json({ ok: false, error: 'Correo o contraseña incorrectos' });
    }

    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.profile_image || null,
      },
      message: 'Login correcto',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.get('/api/users/:id/dashboard', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const notifications = await getNotificationsByUser(userId);
    const invoices = await getInvoicesByUser(userId);

    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profileImage: user.profile_image || null,
      },
      notifications,
      invoices,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar dashboard' });
  }
});

app.post('/api/users/:id/events', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { action, detail } = req.body;
    if (!action) {
      return res.status(400).json({ error: 'La acción es requerida' });
    }

    await addUserEvent(userId, action, detail);
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar evento de usuario' });
  }
});

app.post('/api/users/:id/profile-photo', upload.single('profileImage'), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const user = await getUserById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });

    if (user.profile_image) {
      const oldPath = path.join(__dirname, user.profile_image.replace('/uploads/', 'uploads/'));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const relativePath = `/uploads/${req.file.filename}`;
    await updateUserProfileImage(userId, relativePath);
    await addNotification(userId, 'Se actualizó tu foto de perfil.');
    await addUserEvent(userId, 'profile_photo_changed', 'Cambió su foto de perfil');

    res.json({ ok: true, profileImage: relativePath });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al actualizar foto de perfil' });
  }
});

app.get('/api/clientes', async (_req, res) => {
  try {
    const rows = await getClients();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

app.post('/api/clientes', async (req, res) => {
  try {
    const { nombre, documento, telefono } = req.body;
    if (!nombre || !documento || !telefono) {
      return res.status(400).json({ error: 'Faltan datos de cliente' });
    }
    const row = await createClient({ name: nombre, document: documento, phone: telefono });
    res.status(201).json({ ok: true, client: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar cliente' });
  }
});

app.get('/api/empresas', async (_req, res) => {
  try {
    const rows = await getCompanies();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener empresas' });
  }
});

app.post('/api/empresas', async (req, res) => {
  try {
    const { nombre, nit, telefono, direccion } = req.body;
    if (!nombre || !nit || !telefono || !direccion) {
      return res.status(400).json({ error: 'Faltan datos de empresa' });
    }
    const row = await createCompany({ name: nombre, nit, phone: telefono, address: direccion });
    res.status(201).json({ ok: true, company: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar empresa' });
  }
});

app.get('/api/productos', async (_req, res) => {
  try {
    const rows = await getProducts();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

app.post('/api/productos', async (req, res) => {
  try {
    const { nombre, precio, empresaId } = req.body;
    if (!nombre || !precio || !empresaId) {
      return res.status(400).json({ error: 'Faltan datos de producto' });
    }
    const row = await createProduct({ name: nombre, price: Number(precio), companyId: Number(empresaId) });
    res.status(201).json({ ok: true, product: row });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al guardar producto' });
  }
});

app.get('/api/pedidos/options', async (_req, res) => {
  try {
    const [clientes, empresas, productos] = await Promise.all([
      getClients(),
      getCompanies(),
      getProducts(),
    ]);
    res.json({ clientes, empresas, productos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al cargar opciones de pedido' });
  }
});

app.get('/api/pedidos', async (_req, res) => {
  try {
    const rows = await getOrders();
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al listar pedidos' });
  }
});

app.post('/api/pedidos', async (req, res) => {
  try {
    const { userId, clienteId, empresaId, items } = req.body;
    if (!clienteId || !empresaId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Faltan datos para generar el pedido' });
    }

    const invoiceLines = [];
    let total = 0;
    for (const raw of items) {
      const productId = Number(raw.productoId);
      const quantity = Number(raw.cantidad);
      if (!productId || !quantity || quantity <= 0) {
        return res.status(400).json({ error: 'Items inválidos en el pedido' });
      }
      const product = await getProductById(productId);
      if (!product) return res.status(404).json({ error: `Producto ${productId} no encontrado` });
      const subtotal = Number(product.price) * quantity;
      total += subtotal;
      invoiceLines.push({
        productId,
        productName: product.name,
        quantity,
        price: Number(product.price),
        subtotal,
      });
    }

    const order = await createOrder({
      userId: userId ? Number(userId) : null,
      clientId: Number(clienteId),
      companyId: Number(empresaId),
      total,
    });

    for (const line of invoiceLines) {
      await createOrderItem({
        orderId: order.id,
        productId: line.productId,
        quantity: line.quantity,
        price: line.price,
        subtotal: line.subtotal,
      });
    }

    if (userId) {
      await addInvoice(Number(userId), `Factura pedido #${order.id}`, total);
      await addNotification(Number(userId), `Se generó el pedido #${order.id} por $${total.toFixed(2)}.`);
      await addUserEvent(Number(userId), 'order_created', `Pedido #${order.id} creado`);
    }

    let mailSent = false;
    let mailInfo = null;
    if (userId && mailer) {
      const user = await getUserById(Number(userId));
      if (user && user.email) {
        const linesText = invoiceLines
          .map((l) => `- ${l.productName} x${l.quantity} | ${l.price.toFixed(2)} | Subtotal ${l.subtotal.toFixed(2)}`)
          .join('\n');

        mailInfo = await mailer.sendMail({
          from: SMTP_FROM,
          to: user.email,
          subject: `Factura de pedido #${order.id}`,
          text: `Hola ${user.name},\n\nTu pedido fue generado correctamente.\n\nDetalle:\n${linesText}\n\nTotal: ${total.toFixed(2)}\n\nGracias por usar FactuLogin.`,
        });
        mailSent = true;
      }
    }

    res.status(201).json({
      ok: true,
      orderId: order.id,
      total,
      invoiceLines,
      mailSent,
      mailResponse: mailInfo ? mailInfo.response : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear pedido/factura' });
  }
});

app.listen(PORT, () => {
  console.log(`API FactuLogin escuchando en http://localhost:${PORT}`);
});

