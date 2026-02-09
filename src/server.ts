import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import authRoutes from './routes/auth.js'
import inscricoesRoutes from './routes/inscricoes.js'
import certificadosRoutes from './routes/certificados.js'
import settingsRoutes from './routes/settings.js'
import avaliacoesRoutes from './routes/avaliacoes.js'

const app = express()
const PORT = Number(process.env.PORT) || 3001

// ── Middleware ──
app.use(helmet())
app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:4173'],
    credentials: true,
}))
app.use(express.json())

// ── Routes ──
app.use('/api/auth', authRoutes)
app.use('/api/inscricoes', inscricoesRoutes)
app.use('/api/certificados', certificadosRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/avaliacoes', avaliacoesRoutes)

// ── Health check ──
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Start ──
app.listen(PORT, () => {
    console.log('')
    console.log('  🚀 Backend rodando em http://localhost:' + PORT)
    console.log('  📚 API: http://localhost:' + PORT + '/api')
    console.log('  ❤️  Health: http://localhost:' + PORT + '/api/health')
    console.log('')
})
