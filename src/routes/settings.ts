import { Router } from 'express'
import { pool } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// GET /api/settings — Public (frontend needs event details)
router.get('/', async (_req, res) => {
    try {
        const { rows } = await pool.query('SELECT key, value FROM settings')
        const settings = rows.reduce((acc: Record<string, string>, row: any) => {
            acc[row.key] = row.value
            return acc
        }, {} as Record<string, string>)
        res.json(settings)
    } catch (error) {
        console.error('Erro ao buscar configurações:', error)
        res.status(500).json({ error: 'Erro interno ao buscar configurações' })
    }
})

// PUT /api/settings — Admin only — batch update all settings
router.put('/', authMiddleware, async (req, res) => {
    const settings = req.body as Record<string, string>

    if (!settings || typeof settings !== 'object') {
        res.status(400).json({ error: 'Dados inválidos' })
        return
    }

    const allowedKeys = ['event_name', 'event_date', 'event_location', 'event_workload']

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        for (const [key, value] of Object.entries(settings)) {
            if (allowedKeys.includes(key) && typeof value === 'string' && value.trim()) {
                await client.query(
                    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
                    [key, value.trim()]
                )
            }
        }

        await client.query('COMMIT')
        res.json({ message: 'Configurações atualizadas com sucesso' })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Erro ao atualizar configurações:', error)
        res.status(500).json({ error: 'Erro interno ao atualizar configurações' })
    } finally {
        client.release()
    }
})

export default router
