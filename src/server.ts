import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { initDb } from './db.js'

import authRoutes from './routes/auth.js'
import inscricoesRoutes from './routes/inscricoes.js'
import certificadosRoutes from './routes/certificados.js'
import settingsRoutes from './routes/settings.js'
import avaliacoesRoutes from './routes/avaliacoes.js'
import adminsRoutes from './routes/admins.js'

const app = express()
const PORT = Number(process.env.PORT) || 3001

// ── Middleware ──
app.use(helmet())
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://localhost:4173']

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
}))
app.use(express.json())

// ── Routes ──
app.use('/api/auth', authRoutes)
app.use('/api/inscricoes', inscricoesRoutes)
app.use('/api/certificados', certificadosRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/avaliacoes', avaliacoesRoutes)
app.use('/api/admins', adminsRoutes)

// ── Health check ──
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Start ──
async function start() {
    await initDb()
    console.log('✅ PostgreSQL conectado e tabelas verificadas')

    app.listen(PORT, () => {
        console.log('')
        console.log('  🚀 Backend rodando em http://localhost:' + PORT)
        console.log('  📚 API: http://localhost:' + PORT + '/api')
        console.log('  ❤️  Health: http://localhost:' + PORT + '/api/health')
        console.log('')
    })
}

start().catch((err) => {
    console.error('❌ Falha ao iniciar servidor:', err)
    process.exit(1)
})
