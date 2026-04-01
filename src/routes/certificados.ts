import { Router } from 'express'
import { pool } from '../db.js'
import { authMiddleware } from '../middleware/auth.js'
import { generateCertificate, generateCertificateStream, generateCertificateStreamReal } from '../services/certificado.js'
import { sendCertificateEmail } from '../services/email.js'

const router = Router()

// POST /api/certificados/gerar — Gerar PDFs para presentes
router.post('/gerar', authMiddleware, async (_req, res) => {
    // Buscar presentes que ainda não têm certificado
    const { rows: presentes } = await pool.query(`
        SELECT i.* FROM inscricoes i
        LEFT JOIN certificados c ON c.inscricao_id = i.id
        WHERE i.presente = 1 AND (c.id IS NULL OR c.gerado = 0)
    `)

    if (presentes.length === 0) {
        // Check if all already generated
        const totalPresentes = (await pool.query(
            'SELECT COUNT(*) as count FROM inscricoes WHERE presente = 1'
        )).rows[0]
        if (Number(totalPresentes.count) > 0) {
            res.json({ message: 'Todos os certificados já foram gerados', gerados: 0 })
            return
        }
        res.status(400).json({ error: 'Nenhum participante com check-in confirmado' })
        return
    }

    let gerados = 0

    for (const p of presentes) {
        try {
            const dia = p.dia_participacao || 'ambos'

            if (dia === 'ambos') {
                // Gerar dois certificados separados (um para cada dia)
                const filePath1 = await generateCertificate(
                    { nome: p.nome, cpf: p.cpf, cargo: p.cargo, instituicao: p.instituicao, dia_participacao: 'dia1' },
                    p.id, 'dia1'
                )
                const filePath2 = await generateCertificate(
                    { nome: p.nome, cpf: p.cpf, cargo: p.cargo, instituicao: p.instituicao, dia_participacao: 'dia2' },
                    p.id, 'dia2'
                )

                // Armazenar ambos os caminhos separados por pipe (|)
                const combinedPath = `${filePath1}|${filePath2}`
                await pool.query(
                    `INSERT INTO certificados (inscricao_id, arquivo_path, gerado, data_gerado)
                     VALUES ($1, $2, 1, NOW())
                     ON CONFLICT (inscricao_id) DO UPDATE SET arquivo_path = $2, gerado = 1, data_gerado = NOW()`,
                    [p.id, combinedPath]
                )
            } else {
                const filePath = await generateCertificate(
                    { nome: p.nome, cpf: p.cpf, cargo: p.cargo, instituicao: p.instituicao, dia_participacao: dia },
                    p.id
                )
                await pool.query(
                    `INSERT INTO certificados (inscricao_id, arquivo_path, gerado, data_gerado)
                     VALUES ($1, $2, 1, NOW())
                     ON CONFLICT (inscricao_id) DO UPDATE SET arquivo_path = $2, gerado = 1, data_gerado = NOW()`,
                    [p.id, filePath]
                )
            }
            gerados++
        } catch (err) {
            console.error(`Erro ao gerar certificado para ${p.nome}:`, err)
        }
    }

    res.json({ message: `${gerados} certificado(s) gerado(s) com sucesso`, gerados })
})

// POST /api/certificados/enviar — Enviar por e-mail
router.post('/enviar', authMiddleware, async (_req, res) => {
    const { rows: pendentes } = await pool.query(`
        SELECT c.id as cert_id, c.arquivo_path, i.nome, i.email, i.dia_participacao
        FROM certificados c
        JOIN inscricoes i ON i.id = c.inscricao_id
        WHERE c.gerado = 1 AND c.enviado = 0
    `)

    if (pendentes.length === 0) {
        res.json({ message: 'Nenhum certificado pendente de envio', enviados: 0 })
        return
    }

    let enviados = 0

    for (const p of pendentes) {
        try {
            const dia = p.dia_participacao || 'ambos'
            const paths = p.arquivo_path.split('|')

            await sendCertificateEmail(p.email, p.nome, paths, dia)
            await pool.query(
                'UPDATE certificados SET enviado = 1, data_enviado = NOW() WHERE id = $1',
                [p.cert_id]
            )
            enviados++
        } catch (err) {
            console.error(`Erro ao enviar certificado para ${p.nome}:`, err)
        }
    }

    res.json({ message: `${enviados} certificado(s) enviado(s) por e-mail`, enviados })
})

// POST /api/certificados/consulta — Consulta pública por CPF (sem auth)
router.post('/consulta', async (req, res) => {
    const { cpf } = req.body
    if (!cpf) {
        res.status(400).json({ error: 'CPF é obrigatório' })
        return
    }

    const cpfClean = cpf.replace(/\D/g, '')
    if (cpfClean.length !== 11) {
        res.status(400).json({ error: 'CPF inválido' })
        return
    }

    const { rows } = await pool.query('SELECT * FROM inscricoes WHERE cpf = $1', [cpfClean])
    if (rows.length === 0) {
        res.json({ status: 'not_found', message: 'Nenhuma inscrição encontrada para este CPF.' })
        return
    }

    const inscricao = rows[0]
    const presente = Number(inscricao.presente) === 1

    if (!presente) {
        res.json({
            status: 'no_presence',
            nome: inscricao.nome,
            message: 'Inscrição encontrada, mas a presença não foi confirmada. O certificado só é emitido para participantes com check-in realizado.',
        })
        return
    }

    res.json({
        status: 'eligible',
        nome: inscricao.nome,
        cargo: inscricao.cargo,
        instituicao: inscricao.instituicao,
        dia_participacao: inscricao.dia_participacao,
        message: 'Participação confirmada! Seu certificado está disponível para download.',
    })
})

// GET /api/certificados/download/:cpf — Download público do certificado por CPF
router.get('/download/:cpf', async (req, res) => {
    const cpfClean = req.params.cpf.replace(/\D/g, '')
    if (cpfClean.length !== 11) {
        res.status(400).json({ error: 'CPF inválido' })
        return
    }

    const { rows } = await pool.query(
        'SELECT * FROM inscricoes WHERE cpf = $1 AND presente = 1',
        [cpfClean]
    )

    if (rows.length === 0) {
        res.status(404).json({ error: 'Nenhum participante elegível encontrado para este CPF.' })
        return
    }

    const p = rows[0]
    try {
        const doc = await generateCertificateStreamReal({
            nome: p.nome,
            cpf: p.cpf,
            cargo: p.cargo,
            instituicao: p.instituicao,
            dia_participacao: p.dia_participacao || 'ambos',
        })

        const nomeSlug = p.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="certificado_${nomeSlug}.pdf"`)
        doc.pipe(res)
        doc.end()
    } catch (err) {
        console.error('Erro ao gerar certificado para download:', err)
        res.status(500).json({ error: 'Erro ao gerar certificado' })
    }
})

// GET /api/certificados/modelo — Gerar modelo de certificado para validação
router.get('/modelo', authMiddleware, async (_req, res) => {
    try {
        const sampleData = {
            nome: 'Nome Completo do Participante',
            cpf: '00000000000',
            cargo: 'Professor(a)',
            instituicao: 'Escola Municipal Exemplo',
            dia_participacao: 'ambos',
        }

        const doc = await generateCertificateStream(sampleData)

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', 'attachment; filename="modelo_certificado.pdf"')
        doc.pipe(res)
        doc.end()
    } catch (err) {
        console.error('Erro ao gerar modelo de certificado:', err)
        res.status(500).json({ error: 'Erro ao gerar modelo de certificado' })
    }
})

// GET /api/certificados/stats — Stats dos certificados
router.get('/stats', authMiddleware, async (_req, res) => {
    const totalPresentes = (await pool.query('SELECT COUNT(*) as count FROM inscricoes WHERE presente = 1')).rows[0]
    const gerados = (await pool.query('SELECT COUNT(*) as count FROM certificados WHERE gerado = 1')).rows[0]
    const enviados = (await pool.query('SELECT COUNT(*) as count FROM certificados WHERE enviado = 1')).rows[0]
    const pendentes = Number(totalPresentes.count) - Number(enviados.count)

    res.json({
        totalPresentes: Number(totalPresentes.count),
        certificadosGerados: Number(gerados.count),
        certificadosEnviados: Number(enviados.count),
        pendentes: pendentes > 0 ? pendentes : 0,
    })
})

export default router
