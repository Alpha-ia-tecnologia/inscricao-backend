import { Router } from 'express'
import db from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { sendConfirmationEmail } from '../services/email.js'

const router = Router()

// ── PUBLIC ──

// POST /api/inscricoes — Nova inscrição
router.post('/', async (req, res) => {
    const { nome, cpf, email, telefone, instituicao, cargo } = req.body

    // Validações básicas
    if (!nome || !cpf || !email || !telefone || !instituicao || !cargo) {
        res.status(400).json({ error: 'Todos os campos são obrigatórios' })
        return
    }

    // Limpar CPF
    const cpfClean = cpf.replace(/\D/g, '')
    if (cpfClean.length !== 11) {
        res.status(400).json({ error: 'CPF inválido' })
        return
    }

    // Verificar duplicata
    const existing = db.prepare('SELECT id FROM inscricoes WHERE cpf = ?').get(cpfClean)
    if (existing) {
        res.status(409).json({ error: 'CPF já inscrito neste evento' })
        return
    }

    try {
        const result = db.prepare(
            'INSERT INTO inscricoes (nome, cpf, email, telefone, instituicao, cargo) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(nome.trim(), cpfClean, email.trim().toLowerCase(), telefone.trim(), instituicao, cargo)

        // Enviar e-mail de confirmação (não bloqueia a resposta)
        sendConfirmationEmail(email.trim(), nome.trim()).catch((err) => {
            console.error('Erro ao enviar e-mail de confirmação:', err)
        })

        res.status(201).json({
            id: result.lastInsertRowid,
            message: 'Inscrição realizada com sucesso!',
        })
    } catch (err: unknown) {
        console.error('Erro ao criar inscrição:', err)
        res.status(500).json({ error: 'Erro interno ao processar inscrição' })
    }
})

// ── ADMIN (protegidas) ──

// GET /api/inscricoes — Listar todas
router.get('/', authMiddleware, (_req, res) => {
    const inscricoes = db.prepare(
        'SELECT * FROM inscricoes ORDER BY created_at DESC'
    ).all()

    res.json(inscricoes)
})

// GET /api/inscricoes/stats — Dashboard stats
router.get('/stats', authMiddleware, (_req, res) => {
    const total = db.prepare('SELECT COUNT(*) as count FROM inscricoes').get() as { count: number }
    const presentes = db.prepare('SELECT COUNT(*) as count FROM inscricoes WHERE presente = 1').get() as { count: number }
    const ausentes = total.count - presentes.count

    const certificadosGerados = db.prepare('SELECT COUNT(*) as count FROM certificados WHERE gerado = 1').get() as { count: number }
    const certificadosEnviados = db.prepare('SELECT COUNT(*) as count FROM certificados WHERE enviado = 1').get() as { count: number }

    // Inscrições por instituição
    const porInstituicao = db.prepare(
        'SELECT instituicao as name, COUNT(*) as count FROM inscricoes GROUP BY instituicao ORDER BY count DESC'
    ).all()

    // Últimas 5 inscrições
    const recentes = db.prepare(
        'SELECT nome, instituicao, cargo, data_inscricao FROM inscricoes ORDER BY created_at DESC LIMIT 5'
    ).all()

    res.json({
        totalInscritos: total.count,
        presentes: presentes.count,
        ausentes,
        certificadosGerados: certificadosGerados.count,
        certificadosEnviados: certificadosEnviados.count,
        porInstituicao,
        recentes,
    })
})

// GET /api/inscricoes/export — CSV
router.get('/export', authMiddleware, (_req, res) => {
    const inscricoes = db.prepare('SELECT * FROM inscricoes ORDER BY nome').all() as Array<{
        nome: string; cpf: string; email: string; telefone: string;
        instituicao: string; cargo: string; presente: number; data_inscricao: string
    }>

    const headers = 'Nome,CPF,E-mail,Telefone,Instituição,Cargo,Presente,Data Inscrição\n'
    const rows = inscricoes.map((i) =>
        `"${i.nome}","${i.cpf}","${i.email}","${i.telefone}","${i.instituicao}","${i.cargo}","${i.presente ? 'Sim' : 'Não'}","${i.data_inscricao}"`
    ).join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=participantes_jornada_2026.csv')
    res.send('\ufeff' + headers + rows)
})

// PATCH /api/inscricoes/:id/presenca — Toggle check-in
router.patch('/:id/presenca', authMiddleware, (req, res) => {
    const { id } = req.params

    const inscricao = db.prepare('SELECT id, presente FROM inscricoes WHERE id = ?').get(Number(id)) as {
        id: number; presente: number
    } | undefined

    if (!inscricao) {
        res.status(404).json({ error: 'Inscrição não encontrada' })
        return
    }

    const newStatus = inscricao.presente ? 0 : 1
    db.prepare('UPDATE inscricoes SET presente = ? WHERE id = ?').run(newStatus, Number(id))

    res.json({ id: Number(id), presente: !!newStatus })
})

export default router
