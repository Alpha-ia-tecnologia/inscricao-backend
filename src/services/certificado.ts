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
}

async function getSettings(): Promise<Record<string, string>> {
    const { rows } = await pool.query('SELECT key, value FROM settings')
    return rows.reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value
        return acc
    }, {} as Record<string, string>)
}

export async function generateCertificate(data: CertificateData, inscricaoId: number): Promise<string> {
    const filePath = path.join(certsDir, `certificado_${inscricaoId}.pdf`)

    const s = await getSettings()
    const eventName = s.event_name || 'Jornada Pedagógica 2026'
    const eventDate = s.event_date || '25 e 26 de Fevereiro de 2026'
    const eventLocation = s.event_location || 'Centro de Convenções — Tuntum, MA'
    const eventWorkload = s.event_workload || '40'

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

        // ── Background ──
        doc.rect(0, 0, width, height).fill('#f8fafc')

        // ── Border ──
        const borderMargin = 30
        doc.rect(borderMargin, borderMargin, width - borderMargin * 2, height - borderMargin * 2)
            .lineWidth(3)
            .stroke('#1a472a')

        doc.rect(borderMargin + 8, borderMargin + 8, width - (borderMargin + 8) * 2, height - (borderMargin + 8) * 2)
            .lineWidth(1)
            .stroke('#d4a853')

        // ── Header ──
        const centerX = width / 2

        doc.fontSize(14)
            .fillColor('#6b7280')
            .text('PREFEITURA MUNICIPAL DE TUNTUM — MARANHÃO', 0, 65, { align: 'center', width })

        doc.fontSize(12)
            .fillColor('#6b7280')
            .text('Secretaria Municipal de Educação — SEMED', 0, 85, { align: 'center', width })

        // ── Gold line ──
        doc.moveTo(centerX - 120, 110).lineTo(centerX + 120, 110)
            .lineWidth(2).stroke('#d4a853')

        // ── Title ──
        doc.fontSize(36)
            .fillColor('#1a472a')
            .text('CERTIFICADO', 0, 130, { align: 'center', width })

        // ── Body ──
        doc.fontSize(14)
            .fillColor('#374151')
            .text('Certificamos que', 0, 190, { align: 'center', width })

        doc.fontSize(28)
            .fillColor('#1a472a')
            .text(data.nome.toUpperCase(), 0, 220, { align: 'center', width })

        // Gold underline for name
        const nameWidth = doc.widthOfString(data.nome.toUpperCase())
        const nameStartX = centerX - nameWidth / 2
        doc.moveTo(nameStartX, 255).lineTo(nameStartX + nameWidth, 255)
            .lineWidth(1).stroke('#d4a853')

        doc.fontSize(13)
            .fillColor('#374151')
            .text(
                `CPF: ${formatCPF(data.cpf)} — ${data.cargo}`,
                80, 275, { align: 'center', width: width - 160 }
            )

        doc.fontSize(14)
            .fillColor('#374151')
            .text(
                `participou da ${eventName}, promovida pela Secretaria Municipal de Educação de Tuntum — MA, realizada em ${eventDate}, com carga horária total de`,
                100, 310, { align: 'center', width: width - 200, lineGap: 4 }
            )

        doc.fontSize(26)
            .fillColor('#1a472a')
            .text(`${eventWorkload} HORAS`, 0, 375, { align: 'center', width })

        // ── Footer ──
        doc.fontSize(12)
            .fillColor('#6b7280')
            .text(`${eventLocation}, ${eventDate}`, 0, 430, { align: 'center', width })

        // Signature line
        doc.moveTo(centerX - 120, 480).lineTo(centerX + 120, 480)
            .lineWidth(1).stroke('#374151')

        doc.fontSize(11)
            .fillColor('#374151')
            .text(`Coordenação da ${eventName}`, 0, 488, { align: 'center', width })

        doc.fontSize(10)
            .fillColor('#6b7280')
            .text('SEMED — Tuntum, MA', 0, 504, { align: 'center', width })

        // ── Corner decorations ──
        const decorColor = '#d4a853'
        const d = 25
        doc.moveTo(borderMargin + 15, borderMargin + 15 + d).lineTo(borderMargin + 15, borderMargin + 15).lineTo(borderMargin + 15 + d, borderMargin + 15).lineWidth(2).stroke(decorColor)
        doc.moveTo(width - borderMargin - 15 - d, borderMargin + 15).lineTo(width - borderMargin - 15, borderMargin + 15).lineTo(width - borderMargin - 15, borderMargin + 15 + d).lineWidth(2).stroke(decorColor)
        doc.moveTo(borderMargin + 15, height - borderMargin - 15 - d).lineTo(borderMargin + 15, height - borderMargin - 15).lineTo(borderMargin + 15 + d, height - borderMargin - 15).lineWidth(2).stroke(decorColor)
        doc.moveTo(width - borderMargin - 15 - d, height - borderMargin - 15).lineTo(width - borderMargin - 15, height - borderMargin - 15).lineTo(width - borderMargin - 15, height - borderMargin - 15 - d).lineWidth(2).stroke(decorColor)

        doc.end()

        stream.on('finish', () => resolve(filePath))
        stream.on('error', reject)
    })
}

function formatCPF(cpf: string): string {
    const c = cpf.replace(/\D/g, '')
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`
}
