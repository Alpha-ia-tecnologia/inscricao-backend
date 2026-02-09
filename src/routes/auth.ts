import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool } from '../db.js'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, senha } = req.body

    if (!email || !senha) {
        res.status(400).json({ error: 'E-mail e senha são obrigatórios' })
        return
    }

    const { rows } = await pool.query(
        'SELECT id, email, senha_hash, nome FROM admins WHERE email = $1',
        [email.trim().toLowerCase()]
    )

    const admin = rows[0]
    if (!admin) {
        res.status(401).json({ error: 'Credenciais inválidas' })
        return
    }

    const valid = bcrypt.compareSync(senha, admin.senha_hash)
    if (!valid) {
        res.status(401).json({ error: 'Credenciais inválidas' })
        return
    }

    const token = jwt.sign(
        { id: admin.id, email: admin.email },
        process.env.JWT_SECRET || 'dev_secret',
        { expiresIn: '8h' }
    )

    res.json({
        token,
        admin: { id: admin.id, nome: admin.nome, email: admin.email },
    })
})

export default router
