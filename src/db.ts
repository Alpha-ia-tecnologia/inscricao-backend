import pg from 'pg'

const { Pool } = pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
})

pool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool PostgreSQL:', err)
})

export async function initDb() {
  const client = await pool.connect()
  try {
    await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                senha_hash TEXT NOT NULL,
                nome TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `)

    await client.query(`
            CREATE TABLE IF NOT EXISTS inscricoes (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                cpf TEXT UNIQUE NOT NULL,
                email TEXT NOT NULL,
                telefone TEXT NOT NULL,
                instituicao TEXT NOT NULL,
                cargo TEXT NOT NULL,
                presente INTEGER DEFAULT 0,
                data_inscricao TEXT DEFAULT TO_CHAR(NOW(), 'DD/MM/YYYY'),
                created_at TIMESTAMP DEFAULT NOW()
            )
        `)

    await client.query(`
            CREATE TABLE IF NOT EXISTS certificados (
                id SERIAL PRIMARY KEY,
                inscricao_id INTEGER UNIQUE NOT NULL REFERENCES inscricoes(id),
                arquivo_path TEXT,
                gerado INTEGER DEFAULT 0,
                enviado INTEGER DEFAULT 0,
                data_gerado TIMESTAMP,
                data_enviado TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `)

    await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                key TEXT UNIQUE NOT NULL,
                value TEXT NOT NULL 
            )
        `)

    await client.query(`
            CREATE TABLE IF NOT EXISTS avaliacoes (
                id SERIAL PRIMARY KEY,
                inscricao_id INTEGER UNIQUE NOT NULL REFERENCES inscricoes(id),
                nota_geral INTEGER NOT NULL,
                nota_conteudo INTEGER NOT NULL,
                nota_organizacao INTEGER NOT NULL,
                nota_palestrantes INTEGER NOT NULL,
                comentario TEXT,
                sugestoes TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `)

    console.log('✅ Tabelas PostgreSQL verificadas/criadas')
  } finally {
    client.release()
  }
}

export default pool
