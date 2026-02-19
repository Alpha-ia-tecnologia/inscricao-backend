import PDFDocument from 'pdfkit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool } from '../db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certsDir = path.join(__dirname, '..', '..', 'certificates')

// Ensure certificates directory exists
if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true })
}

export interface CertificateData {
    nome: string
    cpf: string
    cargo: string
    instituicao: string
    dia_participacao: string
}

async function getSettings(): Promise<Record<string, string>> {
    const { rows } = await pool.query('SELECT key, value FROM settings')
    return rows.reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value
        return acc
    }, {} as Record<string, string>)
}

export async function generateCertificate(data: CertificateData, inscricaoId: number, suffix?: string): Promise<string> {
    const fileName = suffix ? `certificado_${inscricaoId}_${suffix}.pdf` : `certificado_${inscricaoId}.pdf`
    const filePath = path.join(certsDir, fileName)

    const s = await getSettings()
    const eventName = s.event_name || 'Jornada Pedagógica 2026'
    const eventDate = s.event_date || '25 e 26 de Fevereiro de 2026'
    const eventLocation = s.event_location || 'Centro de Convenções — Tuntum, MA'
    const eventWorkload = s.event_workload || '40'

    // Logo path
    const logoPath = path.join(__dirname, '..', '..', 'assets', 'logo-semed.png')
    const hasLogo = fs.existsSync(logoPath)

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
        })

        const stream = fs.createWriteStream(filePath)
        doc.pipe(stream)

        const width = doc.page.width   // 841.89
        const height = doc.page.height // 595.28
        const centerX = width / 2

        // ── Background ──
        doc.rect(0, 0, width, height).fill('#f8fafc')

        // ── Outer border (green) ──
        const borderMargin = 25
        doc.rect(borderMargin, borderMargin, width - borderMargin * 2, height - borderMargin * 2)
            .lineWidth(3)
            .stroke('#1a472a')

        // ── Inner border (gold) ──
        doc.rect(borderMargin + 6, borderMargin + 6, width - (borderMargin + 6) * 2, height - (borderMargin + 6) * 2)
            .lineWidth(1)
            .stroke('#d4a853')

        // ── Corner decorations ──
        const decorColor = '#d4a853'
        const d = 25
        doc.moveTo(borderMargin + 12, borderMargin + 12 + d).lineTo(borderMargin + 12, borderMargin + 12).lineTo(borderMargin + 12 + d, borderMargin + 12).lineWidth(2).stroke(decorColor)
        doc.moveTo(width - borderMargin - 12 - d, borderMargin + 12).lineTo(width - borderMargin - 12, borderMargin + 12).lineTo(width - borderMargin - 12, borderMargin + 12 + d).lineWidth(2).stroke(decorColor)
        doc.moveTo(borderMargin + 12, height - borderMargin - 12 - d).lineTo(borderMargin + 12, height - borderMargin - 12).lineTo(borderMargin + 12 + d, height - borderMargin - 12).lineWidth(2).stroke(decorColor)
        doc.moveTo(width - borderMargin - 12 - d, height - borderMargin - 12).lineTo(width - borderMargin - 12, height - borderMargin - 12).lineTo(width - borderMargin - 12, height - borderMargin - 12 - d).lineWidth(2).stroke(decorColor)

        // ── Logo ──
        let contentStartY = 55
        if (hasLogo) {
            const logoWidth = 320
            const logoHeight = 55
            const logoX = centerX - logoWidth / 2
            doc.image(logoPath, logoX, 48, { width: logoWidth, height: logoHeight, fit: [logoWidth, logoHeight], align: 'center', valign: 'center' })
            contentStartY = 110
        } else {
            doc.fontSize(13)
                .fillColor('#6b7280')
                .text('PREFEITURA MUNICIPAL DE TUNTUM — MARANHÃO', 0, 55, { align: 'center', width })
            doc.fontSize(11)
                .fillColor('#6b7280')
                .text('Secretaria Municipal de Educação — SEMED', 0, 73, { align: 'center', width })
            contentStartY = 95
        }

        // ── Gold divider ──
        doc.moveTo(centerX - 140, contentStartY).lineTo(centerX + 140, contentStartY)
            .lineWidth(2).stroke('#d4a853')

        // ── Title ──
        doc.fontSize(34)
            .fillColor('#1a472a')
            .text('CERTIFICADO', 0, contentStartY + 12, { align: 'center', width })

        // ── Body ──
        const bodyY = contentStartY + 60
        doc.fontSize(13)
            .fillColor('#374151')
            .text('Certificamos que', 0, bodyY, { align: 'center', width })

        doc.fontSize(26)
            .fillColor('#1a472a')
            .text(data.nome.toUpperCase(), 0, bodyY + 25, { align: 'center', width })

        // Gold underline for name
        const nameWidth = doc.widthOfString(data.nome.toUpperCase())
        const nameStartX = centerX - nameWidth / 2
        doc.moveTo(nameStartX, bodyY + 58).lineTo(nameStartX + nameWidth, bodyY + 58)
            .lineWidth(1).stroke('#d4a853')

        doc.fontSize(12)
            .fillColor('#374151')
            .text(
                `CPF: ${formatCPF(data.cpf)} — ${data.cargo} — ${data.instituicao}`,
                80, bodyY + 70, { align: 'center', width: width - 160 }
            )

        doc.fontSize(13)
            .fillColor('#374151')
            .text(
                `participou da ${eventName}, promovida pela Secretaria Municipal de Educação de Tuntum — MA, realizada em ${eventDate}, com carga horária total de`,
                100, bodyY + 100, { align: 'center', width: width - 200, lineGap: 4 }
            )

        doc.fontSize(24)
            .fillColor('#1a472a')
            .text(`${eventWorkload} HORAS`, 0, bodyY + 155, { align: 'center', width })

        // Day of participation
        const diaText = data.dia_participacao === 'dia1' ? '1º Dia — Gestores, Coordenadores e Equipe Técnica da SEMED'
            : data.dia_participacao === 'dia2' ? '2º Dia — Professores, Gestores, Coordenadores e Equipe da SEMED'
                : 'Ambos os dias'
        doc.fontSize(11)
            .fillColor('#6b7280')
            .text(`Participação: ${diaText}`, 0, bodyY + 185, { align: 'center', width })

        // ── Footer ──
        doc.fontSize(11)
            .fillColor('#6b7280')
            .text(`${eventLocation}, ${eventDate}`, 0, bodyY + 215, { align: 'center', width })

        // Signature line
        doc.moveTo(centerX - 120, bodyY + 250).lineTo(centerX + 120, bodyY + 250)
            .lineWidth(1).stroke('#374151')

        doc.fontSize(10)
            .fillColor('#374151')
            .text(`Coordenação da ${eventName}`, 0, bodyY + 256, { align: 'center', width })

        doc.fontSize(9)
            .fillColor('#6b7280')
            .text('SEMED — Tuntum, MA', 0, bodyY + 270, { align: 'center', width })

        doc.end()

        stream.on('finish', () => resolve(filePath))
        stream.on('error', reject)
    })
}

function formatCPF(cpf: string): string {
    const c = cpf.replace(/\D/g, '')
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`
}
