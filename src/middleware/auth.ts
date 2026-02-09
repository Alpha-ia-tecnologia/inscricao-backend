import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret'

export interface AuthRequest extends Request {
    adminId?: number
    adminEmail?: string
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
    const header = req.headers.authorization

    if (!header || !header.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Token não fornecido' })
        return
    }

    const token = header.split(' ')[1]

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number; email: string }
        req.adminId = decoded.id
        req.adminEmail = decoded.email
        next()
    } catch {
        res.status(401).json({ error: 'Token inválido ou expirado' })
    }
}
