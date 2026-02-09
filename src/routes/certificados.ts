import { Router } from 'express'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { generateCertificate } from '../services/certificado.js'
import { sendCertificateEmail } from '../services/email.js'

const router = Router()

// POST /api/certificados/gerar — Gerar PDFs para presentes
router.post('/gerar', authMiddleware, (_req, res) => {
    // Buscar presentes que ainda não têm certificado
    const presentes = db.prepare(`
    SELECT i.* FROM inscricoes i
    LEFT JOIN certificados c ON c.inscricao_id = i.id
    WHERE i.presente = 1 AND (c.id IS NULL OR c.gerado = 0)
  `).all() as Array<{
        id: number; nome: string; cpf: string; cargo: string; instituicao: string
    }>

    if (presentes.length === 0) {
        // Check if all already generated
        const totalPresentes = db.prepare('SELECT COUNT(*) as count FROM inscricoes WHERE presente = 1').get() as { count: number }
        if (totalPresentes.count > 0) {
            res.json({ message: 'Todos os certificados já foram gerados', gerados: 0 })
            return
        }
        res.status(400).json({ error: 'Nenhum participante com check-in confirmado' })
        return
    }

    let gerados = 0

    const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO certificados (inscricao_id, arquivo_path, gerado, data_gerado)
    VALUES (?, ?, 1, datetime('now', 'localtime'))
  `)

    for (const p of presentes) {
        try {
            const filePath = generateCertificate(
                { nome: p.nome, cpf: p.cpf, cargo: p.cargo, instituicao: p.instituicao },
                p.id
            )
            insertStmt.run(p.id, filePath)
            gerados++
        } catch (err) {
            console.error(`Erro ao gerar certificado para ${p.nome}:`, err)
        }
    }

    res.json({ message: `${gerados} certificado(s) gerado(s) com sucesso`, gerados })
})

// POST /api/certificados/enviar — Enviar por e-mail
router.post('/enviar', authMiddleware, async (_req, res) => {
    const pendentes = db.prepare(`
    SELECT c.id as cert_id, c.arquivo_path, i.nome, i.email
    FROM certificados c
    JOIN inscricoes i ON i.id = c.inscricao_id
    WHERE c.gerado = 1 AND c.enviado = 0
  `).all() as Array<{
        cert_id: number; arquivo_path: string; nome: string; email: string
    }>

    if (pendentes.length === 0) {
        res.json({ message: 'Nenhum certificado pendente de envio', enviados: 0 })
        return
    }

    let enviados = 0

    for (const p of pendentes) {
        try {
            await sendCertificateEmail(p.email, p.nome, p.arquivo_path)
            db.prepare(`
        UPDATE certificados SET enviado = 1, data_enviado = datetime('now', 'localtime')
        WHERE id = ?
      `).run(p.cert_id)
            enviados++
        } catch (err) {
            console.error(`Erro ao enviar certificado para ${p.nome}:`, err)
        }
    }

    res.json({ message: `${enviados} certificado(s) enviado(s) por e-mail`, enviados })
})

// GET /api/certificados/stats — Stats dos certificados
router.get('/stats', authMiddleware, (_req, res) => {
    const totalPresentes = db.prepare('SELECT COUNT(*) as count FROM inscricoes WHERE presente = 1').get() as { count: number }
    const gerados = db.prepare('SELECT COUNT(*) as count FROM certificados WHERE gerado = 1').get() as { count: number }
    const enviados = db.prepare('SELECT COUNT(*) as count FROM certificados WHERE enviado = 1').get() as { count: number }
    const pendentes = totalPresentes.count - enviados.count

    res.json({
        totalPresentes: totalPresentes.count,
        certificadosGerados: gerados.count,
        certificadosEnviados: enviados.count,
        pendentes: pendentes > 0 ? pendentes : 0,
    })
})

export default router
