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

// ── Paleta do sistema ──
const COLORS = {
    primary: '#3B6FCB',       // Azul principal
    secondary: '#1E3A6E',     // Azul escuro
    accent: '#00BCD4',        // Ciano/Teal
    background: '#EEF1FA',    // Fundo claro
    foreground: '#1a2340',    // Texto principal
    muted: '#64748b',         // Texto secundário
    white: '#ffffff',
    lightBlue: '#d6e4f7',     // Borda suave
}

async function getSettings(): Promise<Record<string, string>> {
    const { rows } = await pool.query('SELECT key, value FROM settings')
    return rows.reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value
        return acc
    }, {} as Record<string, string>)
}

function formatCPF(cpf: string): string {
    const c = cpf.replace(/\D/g, '')
    return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`
}

function getLogoPaths() {
    const logoSemedPath = path.join(__dirname, '..', '..', 'assets', 'logo-semed.png')
    const brasaoPath = path.join(__dirname, '..', '..', 'assets', 'brasao-tuntum.png')
    return {
        logoSemed: fs.existsSync(logoSemedPath) ? logoSemedPath : null,
        brasao: fs.existsSync(brasaoPath) ? brasaoPath : null,
    }
}

function renderCertificateContent(
    doc: InstanceType<typeof PDFDocument>,
    data: CertificateData,
    settings: { eventName: string; eventDate: string; eventLocation: string; eventWorkload: string },
) {
    const width = doc.page.width   // 841.89
    const height = doc.page.height // 595.28
    const centerX = width / 2
    const { logoSemed, brasao } = getLogoPaths()

    // ── Background ──
    doc.rect(0, 0, width, height).fill(COLORS.white)

    // ── Faixa superior azul escuro ──
    doc.rect(0, 0, width, 8).fill(COLORS.secondary)

    // ── Faixa inferior ciano ──
    doc.rect(0, height - 8, width, 8).fill(COLORS.accent)

    // ── Bordas laterais sutis ──
    doc.rect(0, 8, 3, height - 16).fill(COLORS.primary)
    doc.rect(width - 3, 8, 3, height - 16).fill(COLORS.primary)

    // ── Moldura interna elegante ──
    const m = 28
    doc.rect(m, m, width - m * 2, height - m * 2)
        .lineWidth(1.5)
        .stroke(COLORS.lightBlue)

    // ── Cantoneiras decorativas (azul principal) ──
    const cornerLen = 30
    const ci = m + 8
    // Topo-esquerda
    doc.moveTo(ci, ci + cornerLen).lineTo(ci, ci).lineTo(ci + cornerLen, ci).lineWidth(2.5).stroke(COLORS.primary)
    // Topo-direita
    doc.moveTo(width - ci - cornerLen, ci).lineTo(width - ci, ci).lineTo(width - ci, ci + cornerLen).lineWidth(2.5).stroke(COLORS.primary)
    // Base-esquerda
    doc.moveTo(ci, height - ci - cornerLen).lineTo(ci, height - ci).lineTo(ci + cornerLen, height - ci).lineWidth(2.5).stroke(COLORS.primary)
    // Base-direita
    doc.moveTo(width - ci - cornerLen, height - ci).lineTo(width - ci, height - ci).lineTo(width - ci, height - ci - cornerLen).lineWidth(2.5).stroke(COLORS.primary)

    // ── Brasão como marca d'água central ──
    if (brasao) {
        doc.save()
        doc.opacity(0.04)
        const brasaoSize = 280
        doc.image(brasao, centerX - brasaoSize / 2, height / 2 - brasaoSize / 2 + 20, {
            width: brasaoSize,
            height: brasaoSize,
            fit: [brasaoSize, brasaoSize],
            align: 'center',
            valign: 'center',
        })
        doc.restore()
    }

    // ── Logo SEMED ──
    let contentStartY = 58
    if (logoSemed) {
        const logoWidth = 340
        const logoHeight = 58
        doc.image(logoSemed, centerX - logoWidth / 2, 42, {
            width: logoWidth,
            height: logoHeight,
            fit: [logoWidth, logoHeight],
            align: 'center',
            valign: 'center',
        })
        contentStartY = 108
    } else {
        doc.fontSize(13).fillColor(COLORS.muted)
            .text('PREFEITURA MUNICIPAL DE TUNTUM \u2014 MARANH\u00C3O', 0, 52, { align: 'center', width })
        doc.fontSize(11).fillColor(COLORS.muted)
            .text('Secretaria Municipal de Educa\u00E7\u00E3o \u2014 SEMED', 0, 70, { align: 'center', width })
        contentStartY = 95
    }

    // ── Linha divisória ciano ──
    const dividerY = contentStartY + 2
    doc.moveTo(centerX - 160, dividerY).lineTo(centerX + 160, dividerY)
        .lineWidth(2).stroke(COLORS.accent)
    // Pequenos pontos decorativos nas extremidades
    doc.circle(centerX - 162, dividerY, 2).fill(COLORS.accent)
    doc.circle(centerX + 162, dividerY, 2).fill(COLORS.accent)

    // ── Título CERTIFICADO ──
    doc.fontSize(36).fillColor(COLORS.secondary)
        .text('CERTIFICADO', 0, dividerY + 14, { align: 'center', width, characterSpacing: 4 })

    // ── Subtítulo "de Participação" ──
    doc.fontSize(13).fillColor(COLORS.primary)
        .text('de Participa\u00E7\u00E3o', 0, dividerY + 52, { align: 'center', width, characterSpacing: 1 })

    // ── Corpo ──
    const bodyY = dividerY + 80
    doc.fontSize(12).fillColor(COLORS.muted)
        .text('Certificamos que', 0, bodyY, { align: 'center', width })

    // Nome do participante
    doc.fontSize(26).fillColor(COLORS.secondary)
        .text(data.nome.toUpperCase(), 0, bodyY + 22, { align: 'center', width })

    // Sublinhado ciano no nome
    const nameWidth = doc.widthOfString(data.nome.toUpperCase())
    const nameStartX = centerX - nameWidth / 2
    doc.moveTo(nameStartX, bodyY + 55).lineTo(nameStartX + nameWidth, bodyY + 55)
        .lineWidth(1.5).stroke(COLORS.accent)

    // CPF / Cargo / Instituição
    doc.fontSize(10.5).fillColor(COLORS.muted)
        .text(
            `CPF: ${formatCPF(data.cpf)}  \u2022  ${data.cargo}  \u2022  ${data.instituicao}`,
            80, bodyY + 66, { align: 'center', width: width - 160 }
        )

    // Texto principal
    doc.fontSize(12).fillColor(COLORS.foreground)
        .text(
            `participou do ${settings.eventName}, promovido pela Secretaria Municipal de Educa\u00E7\u00E3o de Tuntum \u2014 MA, realizado em ${settings.eventDate}, com carga hor\u00E1ria total de`,
            100, bodyY + 92, { align: 'center', width: width - 200, lineGap: 5 }
        )

    // Carga horária em destaque
    const hoursY = bodyY + 148
    // Fundo pill para as horas
    const hoursText = `${settings.eventWorkload} HORAS`
    doc.fontSize(22).fillColor(COLORS.secondary)
    const hoursW = doc.widthOfString(hoursText) + 40
    doc.save()
    doc.roundedRect(centerX - hoursW / 2, hoursY - 6, hoursW, 36, 18)
        .fill(COLORS.background)
    doc.restore()
    doc.fontSize(22).fillColor(COLORS.secondary)
        .text(hoursText, 0, hoursY, { align: 'center', width })

    // Dia de participação
    const diaText = data.dia_participacao === 'dia1' ? '1\u00BA Dia \u2014 Gestores, Coordenadores e Equipe T\u00E9cnica da SEMED'
        : data.dia_participacao === 'dia2' ? '2\u00BA Dia \u2014 Professores, Gestores, Coordenadores e Equipe da SEMED'
            : 'Ambos os dias'
    doc.fontSize(10).fillColor(COLORS.muted)
        .text(`Participa\u00E7\u00E3o: ${diaText}`, 0, hoursY + 40, { align: 'center', width })

    // ── Rodapé ──
    const footerY = hoursY + 65
    doc.fontSize(10).fillColor(COLORS.muted)
        .text(`${settings.eventLocation}, ${settings.eventDate}`, 0, footerY, { align: 'center', width })

    // Linha de assinatura
    const sigY = footerY + 28
    doc.moveTo(centerX - 130, sigY).lineTo(centerX + 130, sigY)
        .lineWidth(0.8).stroke(COLORS.primary)

    doc.fontSize(10).fillColor(COLORS.secondary)
        .text(`Coordena\u00E7\u00E3o do ${settings.eventName}`, 0, sigY + 6, { align: 'center', width })

    doc.fontSize(8.5).fillColor(COLORS.muted)
        .text('SEMED \u2014 Tuntum, MA', 0, sigY + 20, { align: 'center', width })

    // ── Linha ciano inferior decorativa acima da faixa ──
    doc.moveTo(m + 10, height - m - 4).lineTo(width - m - 10, height - m - 4)
        .lineWidth(0.5).stroke(COLORS.accent)
}

export async function generateCertificate(data: CertificateData, inscricaoId: number, suffix?: string): Promise<string> {
    const fileName = suffix ? `certificado_${inscricaoId}_${suffix}.pdf` : `certificado_${inscricaoId}.pdf`
    const filePath = path.join(certsDir, fileName)

    const s = await getSettings()
    const settings = {
        eventName: s.event_name || 'I Simp\u00F3sio de Educa\u00E7\u00E3o de Tuntum',
        eventDate: s.event_date || '25 e 26 de Fevereiro de 2026',
        eventLocation: s.event_location || 'CT Centro de Treinamento Esportivo \u2014 Tuntum, MA',
        eventWorkload: s.event_workload || '16',
    }

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
        })

        const stream = fs.createWriteStream(filePath)
        doc.pipe(stream)

        renderCertificateContent(doc, data, settings)

        doc.end()
        stream.on('finish', () => resolve(filePath))
        stream.on('error', reject)
    })
}

export async function generateCertificateStream(data: CertificateData): Promise<InstanceType<typeof PDFDocument>> {
    const s = await getSettings()
    const settings = {
        eventName: s.event_name || 'I Simp\u00F3sio de Educa\u00E7\u00E3o de Tuntum',
        eventDate: s.event_date || '25 e 26 de Fevereiro de 2026',
        eventLocation: s.event_location || 'CT Centro de Treinamento Esportivo \u2014 Tuntum, MA',
        eventWorkload: s.event_workload || '16',
    }

    const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })

    renderCertificateContent(doc, data, settings)

    // Marca d'água "MODELO" para preview
    const width = doc.page.width
    const height = doc.page.height
    const centerX = width / 2
    doc.save()
    doc.rotate(-35, { origin: [centerX, height / 2] })
    doc.fontSize(80).fillColor(COLORS.primary).opacity(0.06)
        .text('MODELO', centerX - 200, height / 2 - 35)
    doc.restore()

    return doc
}

export async function generateCertificateStreamReal(data: CertificateData): Promise<InstanceType<typeof PDFDocument>> {
    const s = await getSettings()
    const settings = {
        eventName: s.event_name || 'I Simp\u00F3sio de Educa\u00E7\u00E3o de Tuntum',
        eventDate: s.event_date || '25 e 26 de Fevereiro de 2026',
        eventLocation: s.event_location || 'CT Centro de Treinamento Esportivo \u2014 Tuntum, MA',
        eventWorkload: s.event_workload || '16',
    }

    const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
    })

    renderCertificateContent(doc, data, settings)

    return doc
}
