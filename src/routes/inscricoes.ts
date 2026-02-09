import { Router } from 'express'
import { pool } from '../db.js'
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
    const { rows: existing } = await pool.query(
        'SELECT id FROM inscricoes WHERE cpf = $1', [cpfClean]
    )
    if (existing.length > 0) {
        res.status(409).json({ error: 'CPF já inscrito neste evento' })
        return
    }

    try {
        const { rows } = await pool.query(
            'INSERT INTO inscricoes (nome, cpf, email, telefone, instituicao, cargo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [nome.trim(), cpfClean, email.trim().toLowerCase(), telefone.trim(), instituicao, cargo]
        )

        // Enviar e-mail de confirmação (não bloqueia a resposta)
        sendConfirmationEmail(email.trim(), nome.trim()).catch((err) => {
            console.error('Erro ao enviar e-mail de confirmação:', err)
        })

        res.status(201).json({
            id: rows[0].id,
            message: 'Inscrição realizada com sucesso!',
        })
    } catch (err: unknown) {
        console.error('Erro ao criar inscrição:', err)
        res.status(500).json({ error: 'Erro interno ao processar inscrição' })
    }
})

// ── ADMIN (protegidas) ──

// GET /api/inscricoes — Listar todas
router.get('/', authMiddleware, async (_req, res) => {
    const { rows } = await pool.query(
        'SELECT * FROM inscricoes ORDER BY created_at DESC'
    )
    res.json(rows)
})

// GET /api/inscricoes/stats — Dashboard stats
router.get('/stats', authMiddleware, async (_req, res) => {
    const total = (await pool.query('SELECT COUNT(*) as count FROM inscricoes')).rows[0]
    const presentes = (await pool.query('SELECT COUNT(*) as count FROM inscricoes WHERE presente = 1')).rows[0]
    const ausentes = Number(total.count) - Number(presentes.count)

    const certificadosGerados = (await pool.query('SELECT COUNT(*) as count FROM certificados WHERE gerado = 1')).rows[0]
    const certificadosEnviados = (await pool.query('SELECT COUNT(*) as count FROM certificados WHERE enviado = 1')).rows[0]

    // Inscrições por instituição
    const { rows: porInstituicao } = await pool.query(
        'SELECT instituicao as name, COUNT(*) as count FROM inscricoes GROUP BY instituicao ORDER BY count DESC'
    )

    // Últimas 5 inscrições
    const { rows: recentes } = await pool.query(
        'SELECT nome, instituicao, cargo, data_inscricao FROM inscricoes ORDER BY created_at DESC LIMIT 5'
    )

    res.json({
        totalInscritos: Number(total.count),
        presentes: Number(presentes.count),
        ausentes,
        certificadosGerados: Number(certificadosGerados.count),
        certificadosEnviados: Number(certificadosEnviados.count),
        porInstituicao,
        recentes,
    })
})

// GET /api/inscricoes/export — CSV
router.get('/export', authMiddleware, async (_req, res) => {
    const { rows: inscricoes } = await pool.query(
        'SELECT * FROM inscricoes ORDER BY nome'
    )

    const headers = 'Nome,CPF,E-mail,Telefone,Instituição,Cargo,Presente,Data Inscrição\n'
    const csvRows = inscricoes.map((i: any) =>
        `"${i.nome}","${i.cpf}","${i.email}","${i.telefone}","${i.instituicao}","${i.cargo}","${i.presente ? 'Sim' : 'Não'}","${i.data_inscricao}"`
    ).join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=participantes_jornada_2026.csv')
    res.send('\ufeff' + headers + csvRows)
})

// PATCH /api/inscricoes/:id/presenca — Toggle check-in
router.patch('/:id/presenca', authMiddleware, async (req, res) => {
    const { id } = req.params

    const { rows } = await pool.query(
        'SELECT id, presente FROM inscricoes WHERE id = $1', [Number(id)]
    )

    const inscricao = rows[0]
    if (!inscricao) {
        res.status(404).json({ error: 'Inscrição não encontrada' })
        return
    }

    const newStatus = inscricao.presente ? 0 : 1
    await pool.query(
        'UPDATE inscricoes SET presente = $1 WHERE id = $2', [newStatus, Number(id)]
    )

    res.json({ id: Number(id), presente: !!newStatus })
})

export default router
