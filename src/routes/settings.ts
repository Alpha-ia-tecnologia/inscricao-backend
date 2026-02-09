import { Router } from 'express'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// GET /api/settings — Public (frontend needs event details)
router.get('/', (_req, res) => {
    try {
        const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
        const settings = rows.reduce((acc, row) => {
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
router.put('/', authMiddleware, (req, res) => {
    const settings = req.body as Record<string, string>

    if (!settings || typeof settings !== 'object') {
        res.status(400).json({ error: 'Dados inválidos' })
        return
    }

    const allowedKeys = ['event_name', 'event_date', 'event_location', 'event_workload']

    try {
        const stmt = db.prepare(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        )

        const updateMany = db.transaction((entries: [string, string][]) => {
            for (const [key, value] of entries) {
                if (allowedKeys.includes(key) && typeof value === 'string' && value.trim()) {
                    stmt.run(key, value.trim())
                }
            }
        })

        updateMany(Object.entries(settings))

        res.json({ message: 'Configurações atualizadas com sucesso' })
    } catch (error) {
        console.error('Erro ao atualizar configurações:', error)
        res.status(500).json({ error: 'Erro interno ao atualizar configurações' })
    }
})

export default router
