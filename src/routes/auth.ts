import { Router } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import db from '../db.js'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

// POST /api/auth/login
router.post('/login', (req, res) => {
    const { email, senha } = req.body

    if (!email || !senha) {
        res.status(400).json({ error: 'E-mail e senha são obrigatórios' })
        return
    }

    const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email) as {
        id: number; email: string; senha_hash: string; nome: string
    } | undefined

    if (!admin) {
        res.status(401).json({ error: 'E-mail ou senha inválidos' })
        return
    }

    const valid = bcrypt.compareSync(senha, admin.senha_hash)
    if (!valid) {
        res.status(401).json({ error: 'E-mail ou senha inválidos' })
        return
    }

    const token = jwt.sign(
        { id: admin.id, email: admin.email },
        JWT_SECRET,
        { expiresIn: '24h' }
    )

    res.json({
        token,
        admin: { id: admin.id, email: admin.email, nome: admin.nome },
    })
})

export default router
