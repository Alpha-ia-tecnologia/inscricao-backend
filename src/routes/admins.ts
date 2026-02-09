import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { pool } from '../db.js'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'

const router = Router()

// GET /api/admins — list all admins (without senha_hash)
router.get('/', authMiddleware, async (_req, res) => {
    const { rows } = await pool.query(
        'SELECT id, nome, email, created_at FROM admins ORDER BY id ASC'
    )
    res.json(rows)
})

// POST /api/admins — create new admin
router.post('/', authMiddleware, async (req, res) => {
    const { nome, email, senha } = req.body

    if (!nome?.trim() || !email?.trim() || !senha?.trim()) {
        res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' })
        return
    }

    if (senha.length < 6) {
        res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' })
        return
    }

    const { rows: existing } = await pool.query(
        'SELECT id FROM admins WHERE email = $1', [email.trim()]
    )
    if (existing.length > 0) {
        res.status(409).json({ error: 'Já existe um administrador com este e-mail' })
        return
    }

    const hash = bcrypt.hashSync(senha, 10)

    const { rows } = await pool.query(
        'INSERT INTO admins (nome, email, senha_hash) VALUES ($1, $2, $3) RETURNING id',
        [nome.trim(), email.trim(), hash]
    )

    res.status(201).json({
        id: rows[0].id,
        nome: nome.trim(),
        email: email.trim(),
        message: 'Administrador criado com sucesso',
    })
})

// PUT /api/admins/:id — update admin
router.put('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params
    const { nome, email, senha } = req.body

    if (!nome?.trim() || !email?.trim()) {
        res.status(400).json({ error: 'Nome e e-mail são obrigatórios' })
        return
    }

    const { rows: adminRows } = await pool.query(
        'SELECT id FROM admins WHERE id = $1', [Number(id)]
    )
    if (adminRows.length === 0) {
        res.status(404).json({ error: 'Administrador não encontrado' })
        return
    }

    const { rows: dupRows } = await pool.query(
        'SELECT id FROM admins WHERE email = $1 AND id != $2',
        [email.trim(), Number(id)]
    )
    if (dupRows.length > 0) {
        res.status(409).json({ error: 'Já existe outro administrador com este e-mail' })
        return
    }

    if (senha && senha.trim()) {
        if (senha.length < 6) {
            res.status(400).json({ error: 'A senha deve ter no mínimo 6 caracteres' })
            return
        }
        const hash = bcrypt.hashSync(senha, 10)
        await pool.query(
            'UPDATE admins SET nome = $1, email = $2, senha_hash = $3 WHERE id = $4',
            [nome.trim(), email.trim(), hash, Number(id)]
        )
    } else {
        await pool.query(
            'UPDATE admins SET nome = $1, email = $2 WHERE id = $3',
            [nome.trim(), email.trim(), Number(id)]
        )
    }

    res.json({ message: 'Administrador atualizado com sucesso' })
})

// DELETE /api/admins/:id — delete admin
router.delete('/:id', authMiddleware, async (req: AuthRequest, res) => {
    const { id } = req.params
    const adminId = req.adminId

    if (Number(id) === adminId) {
        res.status(400).json({ error: 'Você não pode excluir sua própria conta' })
        return
    }

    const { rows } = await pool.query(
        'SELECT id FROM admins WHERE id = $1', [Number(id)]
    )
    if (rows.length === 0) {
        res.status(404).json({ error: 'Administrador não encontrado' })
        return
    }

    await pool.query('DELETE FROM admins WHERE id = $1', [Number(id)])
    res.json({ message: 'Administrador excluído com sucesso' })
})

export default router
