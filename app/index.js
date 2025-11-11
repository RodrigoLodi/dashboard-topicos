const express = require('express');
const mysql = require('mysql2/promise');
const client = require('prom-client');

const app = express();
const port = 3000;

let pool;

async function getDbPool() {
  if (pool) return pool;

  for (let i = 0; i < 10; i++) {
    try {
      pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        port: process.env.DB_PORT,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });
      console.log('Conexão com o pool do MySQL estabelecida.');
      return pool;
    } catch (err) {
      console.warn('Tentando conectar ao MySQL... tentativa', i + 1);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
  throw new Error('Não foi possível conectar ao banco de dados MySQL.');
}


async function initializeDb() {
  try {
    const dbPool = await getDbPool();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS vendas (
        id INT PRIMARY KEY AUTO_INCREMENT,  -- <--- Sintaxe do MySQL
        produto VARCHAR(100) NOT NULL,
        categoria VARCHAR(50) NOT NULL,
        valor DECIMAL(10, 2) NOT NULL,
        data_venda TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await dbPool.query(createTableQuery);
    console.log('Tabela "vendas" verificada/criada com sucesso.');

    const [rows] = await dbPool.query('SELECT COUNT(*) AS count FROM vendas');
    if (rows[0].count < 20) {
      console.log('Populando banco de dados...');
      const insertQuery = `
        INSERT INTO vendas (produto, categoria, valor) VALUES
        ('Bolo de Chocolate', 'Bolos', 45.00),
        ('Coxinha', 'Salgados', 8.00),
        ('Brigadeiro', 'Doces', 3.50),
        ('Pão Francês', 'Pães', 1.50),
        ('Bolo de Fubá', 'Bolos', 38.00),
        ('Empada', 'Salgados', 7.50),
        ('Quindim', 'Doces', 6.00),
        ('Croissant', 'Pães', 7.00),
        ('Bolo de Chocolate', 'Bolos', 45.00),
        ('Coxinha', 'Salgados', 8.00),
        ('Brigadeiro', 'Doces', 3.50),
        ('Pão Francês', 'Pães', 1.50),
        ('Bolo de Fubá', 'Bolos', 38.00),
        ('Empada', 'Salgados', 7.50),
        ('Quindim', 'Doces', 6.00),
        ('Croissant', 'Pães', 7.00),
        ('Bolo de Chocolate', 'Bolos', 45.00),
        ('Coxinha', 'Salgados', 8.00),
        ('Brigadeiro', 'Doces', 3.50),
        ('Pão Francês', 'Pães', 1.50)
      `;
      await dbPool.query(insertQuery);
    }
  } catch (err) {
    console.error('Erro ao inicializar o banco de dados:', err);
  }
}

const register = new client.Registry();
client.collectDefaultMetrics({ register }); 

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP (em segundos)',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 1.5],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Número total de requisições HTTP',
  labelNames: ['method', 'route', 'status_code'],
});

const sweetcontrolVendasTotal = new client.Counter({
  name: 'sweetcontrol_vendas_total',
  help: 'Total de vendas registradas',
  labelNames: ['categoria'],
});

register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(sweetcontrolVendasTotal);

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer(); 
  
  res.on('finish', () => {
    const route = req.path; 
    const method = req.method;
    const statusCode = res.statusCode;

    end({ route, method, status_code: statusCode });
    httpRequestsTotal.inc({ route, method, status_code: statusCode });
  });

  next();
});

app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

app.post('/venda', express.json(), async (req, res) => {
  const { produto, categoria, valor } = req.body;

  if (!produto || !categoria || !valor) {
    return res.status(400).send('Dados da venda incompletos.');
  }

  try {
    const dbPool = await getDbPool();
    const query = 'INSERT INTO vendas (produto, categoria, valor) VALUES (?, ?, ?)';
    const values = [produto, categoria, valor];
    
    const [result] = await dbPool.query(query, values);
    
    sweetcontrolVendasTotal.inc({ categoria });

    res.status(201).json({ insertedId: result.insertId }); 
  } catch (err) {
    console.error('Erro ao inserir venda:', err);
    res.status(500).send('Erro no servidor');
  }
});

app.get('/vendas', async (req, res) => {
  try {
    const dbPool = await getDbPool();
    const [rows] = await dbPool.query('SELECT * FROM vendas ORDER BY data_venda DESC LIMIT 100');
    res.status(200).json(rows);
  } catch (err) {
    console.error('Erro ao consultar vendas:', err);
    res.status(500).send('Erro no servidor');
  }
});

app.get('/', (req, res) => {
  res.send('API "Sweet Control" no ar! Acesse /metrics para ver as métricas.');
});

app.listen(port, async () => {
  console.log(`Aplicação "Sweet Control" rodando em http://localhost:${port}`);
  await initializeDb();
});