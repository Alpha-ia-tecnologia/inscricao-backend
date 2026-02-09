import { Router } from 'express'
import { pool } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

// ── PUBLIC ──

// POST /api/avaliacoes — Participante envia avaliação (identificado por CPF)
router.post('/', async (req, res) => {
    const { cpf, nota_geral, nota_conteudo, nota_organizacao, nota_palestrantes, comentario, sugestoes } = req.body

    if (!cpf || !nota_geral || !nota_conteudo || !nota_organizacao || !nota_palestrantes) {
        res.status(400).json({ error: 'CPF e todas as notas são obrigatórios' })
        return
    }

    // Validar notas (1-5)
    const notas = [nota_geral, nota_conteudo, nota_organizacao, nota_palestrantes]
    if (notas.some((n) => typeof n !== 'number' || n < 1 || n > 5)) {
        res.status(400).json({ error: 'Todas as notas devem ser entre 1 e 5' })
        return
    }

    // Limpar CPF
    const cpfClean = cpf.replace(/\D/g, '')
    if (cpfClean.length !== 11) {
        res.status(400).json({ error: 'CPF inválido' })
        return
    }

    // Buscar inscrição pelo CPF
    const { rows: inscRows } = await pool.query(
        'SELECT id FROM inscricoes WHERE cpf = $1', [cpfClean]
    )
    const inscricao = inscRows[0]
    if (!inscricao) {
        res.status(404).json({ error: 'CPF não encontrado. Apenas participantes inscritos podem avaliar.' })
        return
    }

    // Verificar se já avaliou
    const { rows: existingRows } = await pool.query(
        'SELECT id FROM avaliacoes WHERE inscricao_id = $1', [inscricao.id]
    )
    if (existingRows.length > 0) {
        res.status(409).json({ error: 'Você já enviou sua avaliação. Obrigado!' })
        return
    }

    try {
        await pool.query(
            `INSERT INTO avaliacoes (inscricao_id, nota_geral, nota_conteudo, nota_organizacao, nota_palestrantes, comentario, sugestoes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [inscricao.id, nota_geral, nota_conteudo, nota_organizacao, nota_palestrantes, comentario?.trim() || null, sugestoes?.trim() || null]
        )

        res.status(201).json({ message: 'Avaliação enviada com sucesso! Obrigado pelo seu feedback.' })
    } catch (err: unknown) {
        console.error('Erro ao salvar avaliação:', err)
        res.status(500).json({ error: 'Erro interno ao processar avaliação' })
    }
})

// ── ADMIN (protegidas) ──

// GET /api/avaliacoes/stats — Resultados agregados
router.get('/stats', authMiddleware, async (_req, res) => {
    try {
        const total = (await pool.query('SELECT COUNT(*) as count FROM avaliacoes')).rows[0]
        const totalInscritos = (await pool.query('SELECT COUNT(*) as count FROM inscricoes')).rows[0]

        // Médias
        const medias = (await pool.query(`
            SELECT 
                ROUND(AVG(nota_geral)::numeric, 1) as media_geral,
                ROUND(AVG(nota_conteudo)::numeric, 1) as media_conteudo,
                ROUND(AVG(nota_organizacao)::numeric, 1) as media_organizacao,
                ROUND(AVG(nota_palestrantes)::numeric, 1) as media_palestrantes,
                ROUND(AVG((nota_geral + nota_conteudo + nota_organizacao + nota_palestrantes) / 4.0)::numeric, 1) as media_combinada
            FROM avaliacoes
        `)).rows[0]

        // Distribuição de notas (todas as categorias combinadas)
        const { rows: distribuicao } = await pool.query(`
            SELECT nota, COUNT(*)::int as count FROM (
                SELECT nota_geral as nota FROM avaliacoes
                UNION ALL
                SELECT nota_conteudo as nota FROM avaliacoes
                UNION ALL
                SELECT nota_organizacao as nota FROM avaliacoes
                UNION ALL
                SELECT nota_palestrantes as nota FROM avaliacoes
            ) sub
            GROUP BY nota
            ORDER BY nota
        `)

        // Comentários recentes (com nome do participante)
        const { rows: comentarios } = await pool.query(`
            SELECT a.comentario, a.sugestoes, a.created_at, i.nome
            FROM avaliacoes a
            JOIN inscricoes i ON a.inscricao_id = i.id
            WHERE a.comentario IS NOT NULL AND a.comentario != ''
            ORDER BY a.created_at DESC
            LIMIT 20
        `)

        res.json({
            totalAvaliacoes: Number(total.count),
            totalInscritos: Number(totalInscritos.count),
            taxaResposta: Number(totalInscritos.count) > 0 ? Math.round((Number(total.count) / Number(totalInscritos.count)) * 100) : 0,
            mediaGeral: Number(medias.media_combinada) || 0,
            medias: {
                geral: Number(medias.media_geral) || 0,
                conteudo: Number(medias.media_conteudo) || 0,
                organizacao: Number(medias.media_organizacao) || 0,
                palestrantes: Number(medias.media_palestrantes) || 0,
            },
            distribuicao,
            comentarios,
        })
    } catch (err) {
        console.error('Erro ao buscar stats de avaliações:', err)
        res.status(500).json({ error: 'Erro interno' })
    }
})

// GET /api/avaliacoes/export — Exportar CSV
router.get('/export', authMiddleware, async (_req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT i.nome, i.cpf, i.instituicao, i.cargo,
                   a.nota_geral, a.nota_conteudo, a.nota_organizacao, a.nota_palestrantes,
                   a.comentario, a.sugestoes, a.created_at
            FROM avaliacoes a
            JOIN inscricoes i ON a.inscricao_id = i.id
            ORDER BY a.created_at DESC
        `)

        const headers = 'Nome,CPF,Instituição,Cargo,Nota Geral,Nota Conteúdo,Nota Organização,Nota Palestrantes,Comentário,Sugestões,Data\n'
        const csvRows = rows.map((r: any) =>
            `"${r.nome}","${r.cpf}","${r.instituicao}","${r.cargo}",${r.nota_geral},${r.nota_conteudo},${r.nota_organizacao},${r.nota_palestrantes},"${r.comentario || ''}","${r.sugestoes || ''}","${r.created_at}"`
        ).join('\n')

        res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        res.setHeader('Content-Disposition', 'attachment; filename=avaliacoes_evento.csv')
        res.send('\ufeff' + headers + csvRows)
    } catch (err) {
        console.error('Erro ao exportar avaliações:', err)
        res.status(500).json({ error: 'Erro interno' })
    }
})

export default router
