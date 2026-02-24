import { Router } from 'express'
import { pool } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { sendConfirmationEmail } from '../services/email.js'

const router = Router()

// ── PUBLIC ──

// POST /api/inscricoes — Nova inscrição
router.post('/', async (req, res) => {
    const { nome, cpf, email, telefone, instituicao, cargo, dia_participacao } = req.body

    // Validações básicas
    if (!nome || !cpf || !email || !telefone || !instituicao || !cargo || !dia_participacao) {
        res.status(400).json({ error: 'Todos os campos são obrigatórios' })
        return
    }

    // Validar dia_participacao
    const diasValidos = ['dia1', 'dia2', 'ambos']
    if (!diasValidos.includes(dia_participacao)) {
        res.status(400).json({ error: 'Dia de participação inválido' })
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

    // ── Verificar vagas disponíveis ──
    try {
        const { rows: settingsRows } = await pool.query('SELECT key, value FROM settings WHERE key IN ($1, $2)', ['vagas_dia1', 'vagas_dia2'])
        const settingsMap: Record<string, string> = {}
        for (const r of settingsRows) settingsMap[r.key] = r.value
        const maxDia1 = parseInt(settingsMap.vagas_dia1 || '500', 10)
        const maxDia2 = parseInt(settingsMap.vagas_dia2 || '500', 10)

        const { rows: countRows } = await pool.query(
            `SELECT dia_participacao, COUNT(*)::int as count FROM inscricoes GROUP BY dia_participacao`
        )
        const counts: Record<string, number> = {}
        for (const r of countRows) counts[r.dia_participacao] = r.count

        const ocupDia1 = (counts['dia1'] || 0) + (counts['ambos'] || 0)
        const ocupDia2 = (counts['dia2'] || 0) + (counts['ambos'] || 0)

        if (dia_participacao === 'dia1' || dia_participacao === 'ambos') {
            if (ocupDia1 >= maxDia1) {
                res.status(409).json({ error: 'Vagas esgotadas para o 1º Dia' })
                return
            }
        }
        if (dia_participacao === 'dia2' || dia_participacao === 'ambos') {
            if (ocupDia2 >= maxDia2) {
                res.status(409).json({ error: 'Vagas esgotadas para o 2º Dia' })
                return
            }
        }
    } catch (err) {
        console.error('Erro ao verificar vagas:', err)
        // Continue with registration if vacancy check fails
    }

    try {
        const { rows } = await pool.query(
            'INSERT INTO inscricoes (nome, cpf, email, telefone, instituicao, cargo, dia_participacao) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [nome.trim(), cpfClean, email.trim().toLowerCase(), telefone.trim(), instituicao, cargo, dia_participacao]
        )

        // Enviar e-mail de confirmação (não bloqueia a resposta)
        sendConfirmationEmail(email.trim(), nome.trim(), dia_participacao).catch((err) => {
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

// GET /api/inscricoes/vagas — Public: vagas disponíveis por dia
router.get('/vagas', async (_req, res) => {
    try {
        const { rows: settingsRows } = await pool.query('SELECT key, value FROM settings WHERE key IN ($1, $2)', ['vagas_dia1', 'vagas_dia2'])
        const settingsMap: Record<string, string> = {}
        for (const r of settingsRows) settingsMap[r.key] = r.value
        const maxDia1 = parseInt(settingsMap.vagas_dia1 || '500', 10)
        const maxDia2 = parseInt(settingsMap.vagas_dia2 || '500', 10)

        const { rows: countRows } = await pool.query(
            `SELECT dia_participacao, COUNT(*)::int as count FROM inscricoes GROUP BY dia_participacao`
        )
        const counts: Record<string, number> = {}
        for (const r of countRows) counts[r.dia_participacao] = r.count

        const ocupDia1 = (counts['dia1'] || 0) + (counts['ambos'] || 0)
        const ocupDia2 = (counts['dia2'] || 0) + (counts['ambos'] || 0)

        res.json({
            dia1: { total: ocupDia1, max: maxDia1, disponivel: Math.max(0, maxDia1 - ocupDia1) },
            dia2: { total: ocupDia2, max: maxDia2, disponivel: Math.max(0, maxDia2 - ocupDia2) },
        })
    } catch (err) {
        console.error('Erro ao buscar vagas:', err)
        res.status(500).json({ error: 'Erro ao buscar vagas' })
    }
})

// POST /api/inscricoes/checkin — Public: self check-in via QR code
router.post('/checkin', async (req, res) => {
    const { cpf, dia } = req.body

    if (!cpf || !dia) {
        res.status(400).json({ error: 'CPF e dia são obrigatórios' })
        return
    }

    const diasValidos = ['dia1', 'dia2']
    if (!diasValidos.includes(dia)) {
        res.status(400).json({ error: 'Dia inválido. Selecione Dia 1 ou Dia 2.' })
        return
    }

    const cpfClean = cpf.replace(/\D/g, '')
    if (cpfClean.length !== 11) {
        res.status(400).json({ error: 'CPF inválido' })
        return
    }

    try {
        const { rows } = await pool.query(
            'SELECT id, nome, dia_participacao, presente_dia1, presente_dia2 FROM inscricoes WHERE cpf = $1',
            [cpfClean]
        )

        if (rows.length === 0) {
            res.status(404).json({ error: 'CPF não encontrado. Verifique se você está inscrito no evento.' })
            return
        }

        const inscricao = rows[0]

        // Check if participant is enrolled for the selected day
        const inscritoDia = inscricao.dia_participacao === 'ambos' || inscricao.dia_participacao === dia
        if (!inscritoDia) {
            const diaLabel = dia === 'dia1' ? '1º Dia (25/02)' : '2º Dia (26/02)'
            res.status(403).json({ error: `Você não está inscrito para o ${diaLabel}. Sua inscrição é apenas para o ${inscricao.dia_participacao === 'dia1' ? '1º Dia' : '2º Dia'}.` })
            return
        }

        // Check if already checked in for this day
        const campoPresenca = dia === 'dia1' ? 'presente_dia1' : 'presente_dia2'
        if (inscricao[campoPresenca]) {
            res.json({ nome: inscricao.nome, message: 'Sua presença já foi confirmada para este dia!', already: true })
            return
        }

        // Mark presence for the specific day and update the legacy 'presente' flag
        await pool.query(
            `UPDATE inscricoes SET ${campoPresenca} = 1, presente = 1 WHERE id = $1`,
            [inscricao.id]
        )

        const diaLabel = dia === 'dia1' ? '1º Dia (25/02)' : '2º Dia (26/02)'
        res.json({ nome: inscricao.nome, message: `Presença confirmada para o ${diaLabel}!`, already: false })
    } catch (err) {
        console.error('Erro ao fazer check-in:', err)
        res.status(500).json({ error: 'Erro interno ao processar check-in' })
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
    const presentesDia1 = (await pool.query('SELECT COUNT(*) as count FROM inscricoes WHERE presente_dia1 = 1')).rows[0]
    const presentesDia2 = (await pool.query('SELECT COUNT(*) as count FROM inscricoes WHERE presente_dia2 = 1')).rows[0]
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
        presentesDia1: Number(presentesDia1.count),
        presentesDia2: Number(presentesDia2.count),
        ausentes,
        certificadosGerados: Number(certificadosGerados.count),
        certificadosEnviados: Number(certificadosEnviados.count),
        porInstituicao,
        recentes,
    })
})

// GET /api/inscricoes/relatorio — Full report data
router.get('/relatorio', authMiddleware, async (_req, res) => {
    try {
        const total = (await pool.query('SELECT COUNT(*) as count FROM inscricoes')).rows[0]
        const presentesDia1 = (await pool.query('SELECT COUNT(*) as count FROM inscricoes WHERE presente_dia1 = 1')).rows[0]
        const presentesDia2 = (await pool.query('SELECT COUNT(*) as count FROM inscricoes WHERE presente_dia2 = 1')).rows[0]
        const presentes = (await pool.query('SELECT COUNT(*) as count FROM inscricoes WHERE presente = 1')).rows[0]

        // Vagas
        const { rows: settingsRows } = await pool.query('SELECT key, value FROM settings WHERE key IN ($1, $2)', ['vagas_dia1', 'vagas_dia2'])
        const settingsMap: Record<string, string> = {}
        for (const r of settingsRows) settingsMap[r.key] = r.value
        const maxDia1 = parseInt(settingsMap.vagas_dia1 || '500', 10)
        const maxDia2 = parseInt(settingsMap.vagas_dia2 || '500', 10)

        const { rows: countRows } = await pool.query(
            `SELECT dia_participacao, COUNT(*)::int as count FROM inscricoes GROUP BY dia_participacao`
        )
        const counts: Record<string, number> = {}
        for (const r of countRows) counts[r.dia_participacao] = r.count
        const ocupDia1 = (counts['dia1'] || 0) + (counts['ambos'] || 0)
        const ocupDia2 = (counts['dia2'] || 0) + (counts['ambos'] || 0)

        // Por instituição
        const { rows: porInstituicao } = await pool.query(
            'SELECT instituicao as name, COUNT(*)::int as count FROM inscricoes GROUP BY instituicao ORDER BY count DESC'
        )

        // Por cargo
        const { rows: porCargo } = await pool.query(
            'SELECT cargo as name, COUNT(*)::int as count FROM inscricoes GROUP BY cargo ORDER BY count DESC'
        )

        // Por dia de participação
        const porDia = [
            { name: '1º Dia (25/02)', count: counts['dia1'] || 0 },
            { name: '2º Dia (26/02)', count: counts['dia2'] || 0 },
            { name: 'Ambos os dias', count: counts['ambos'] || 0 },
        ]

        // Certificados
        const certificadosGerados = (await pool.query('SELECT COUNT(*) as count FROM certificados WHERE gerado = 1')).rows[0]
        const certificadosEnviados = (await pool.query('SELECT COUNT(*) as count FROM certificados WHERE enviado = 1')).rows[0]

        // Lista completa de participantes
        const { rows: participantes } = await pool.query(
            'SELECT nome, cpf, instituicao, cargo, dia_participacao, presente_dia1, presente_dia2, data_inscricao FROM inscricoes ORDER BY nome'
        )

        res.json({
            totalInscritos: Number(total.count),
            presentes: Number(presentes.count),
            presentesDia1: Number(presentesDia1.count),
            presentesDia2: Number(presentesDia2.count),
            ausentes: Number(total.count) - Number(presentes.count),
            vagas: {
                dia1: { total: ocupDia1, max: maxDia1 },
                dia2: { total: ocupDia2, max: maxDia2 },
            },
            porInstituicao,
            porCargo,
            porDia,
            certificadosGerados: Number(certificadosGerados.count),
            certificadosEnviados: Number(certificadosEnviados.count),
            participantes,
            geradoEm: new Date().toISOString(),
        })
    } catch (err) {
        console.error('Erro ao gerar relatório:', err)
        res.status(500).json({ error: 'Erro ao gerar relatório' })
    }
})

// GET /api/inscricoes/export — CSV
router.get('/export', authMiddleware, async (_req, res) => {
    const { rows: inscricoes } = await pool.query(
        'SELECT * FROM inscricoes ORDER BY nome'
    )

    const diaLabel = (d: string) => d === 'dia1' ? 'Dia 1 (25/02)' : d === 'dia2' ? 'Dia 2 (26/02)' : 'Ambos os dias'
    const headers = 'Nome,CPF,E-mail,Telefone,Instituição,Cargo,Dia Participação,Presente Dia 1,Presente Dia 2,Data Inscrição\n'
    const csvRows = inscricoes.map((i: any) =>
        `"${i.nome}","${i.cpf}","${i.email}","${i.telefone}","${i.instituicao}","${i.cargo}","${diaLabel(i.dia_participacao || 'ambos')}","${i.presente_dia1 ? 'Sim' : 'Não'}","${i.presente_dia2 ? 'Sim' : 'Não'}","${i.data_inscricao}"`
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

// DELETE /api/inscricoes/:id — Excluir inscrição
router.delete('/:id', authMiddleware, async (req, res) => {
    const { id } = req.params

    const { rows } = await pool.query('SELECT id FROM inscricoes WHERE id = $1', [Number(id)])
    if (rows.length === 0) {
        res.status(404).json({ error: 'Inscrição não encontrada' })
        return
    }

    try {
        // Remove certificado associado, se existir
        await pool.query('DELETE FROM certificados WHERE inscricao_id = $1', [Number(id)])
        // Remove a inscrição
        await pool.query('DELETE FROM inscricoes WHERE id = $1', [Number(id)])
        res.json({ message: 'Inscrição excluída com sucesso' })
    } catch (err) {
        console.error('Erro ao excluir inscrição:', err)
        res.status(500).json({ error: 'Erro ao excluir inscrição' })
    }
})

export default router
