import nodemailer from 'nodemailer'
import { pool } from '../db.js'

const gmailUser = process.env.GMAIL_USER
const gmailPass = process.env.GMAIL_APP_PASSWORD

// Create transporter only if credentials are configured
let transporter: nodemailer.Transporter | null = null

if (gmailUser && gmailPass) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  })
  console.log('📧 Serviço de e-mail configurado com Gmail')
} else {
  console.log('⚠️  E-mail não configurado — configure GMAIL_USER e GMAIL_APP_PASSWORD no .env')
}

// ── Helpers ──

async function getSettings(): Promise<Record<string, string>> {
  const { rows } = await pool.query('SELECT key, value FROM settings')
  return rows.reduce((acc: Record<string, string>, row: any) => {
    acc[row.key] = row.value
    return acc
  }, {} as Record<string, string>)
}

// ── Templates ──

function confirmationTemplate(nome: string, s: Record<string, string>): string {
  const firstName = nome.split(' ')[0]
  const eventName = s.event_name || 'Jornada Pedagógica 2026'
  const eventDate = s.event_date || '25 e 26 de Fevereiro de 2026'
  const eventLocation = s.event_location || 'Centro de Convenções — Tuntum, MA'
  const eventWorkload = s.event_workload || '40'

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1a472a 0%, #2d5a3f 100%); padding: 32px; text-align: center;">
        <h1 style="color: #d4a853; margin: 0; font-size: 24px;">🌿 ${eventName}</h1>
        <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0; font-size: 14px;">SEMED — Tuntum, Maranhão</p>
      </div>
      <div style="padding: 32px;">
        <h2 style="color: #1a472a; margin: 0 0 16px;">Inscrição Confirmada! ✅</h2>
        <p style="color: #374151; line-height: 1.6;">
          Olá, <strong>${firstName}</strong>! Sua inscrição na <strong>${eventName}</strong> foi realizada com sucesso.
        </p>
        <div style="background: #ecfdf5; border-left: 4px solid #1a472a; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #1a472a; font-weight: 600;">📅 Data: ${eventDate}</p>
          <p style="margin: 8px 0 0; color: #1a472a;">📍 Local: ${eventLocation}</p>
          <p style="margin: 8px 0 0; color: #1a472a;">⏰ Carga horária: ${eventWorkload} horas</p>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          Após o evento, o certificado de participação será enviado para este e-mail.
          Qualquer dúvida, entre em contato com a SEMED.
        </p>
      </div>
      <div style="background: #f1f5f9; padding: 16px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          © 2026 SEMED Tuntum — Secretaria Municipal de Educação
        </p>
      </div>
    </div>
  `
}

function certificateEmailTemplate(nome: string, s: Record<string, string>): string {
  const firstName = nome.split(' ')[0]
  const eventName = s.event_name || 'Jornada Pedagógica 2026'
  const eventWorkload = s.event_workload || '40'

  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8fafc; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1a472a 0%, #2d5a3f 100%); padding: 32px; text-align: center;">
        <h1 style="color: #d4a853; margin: 0; font-size: 24px;">🏆 Certificado Disponível</h1>
        <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0; font-size: 14px;">${eventName} — SEMED Tuntum</p>
      </div>
      <div style="padding: 32px;">
        <h2 style="color: #1a472a; margin: 0 0 16px;">Parabéns, ${firstName}! 🎓</h2>
        <p style="color: #374151; line-height: 1.6;">
          Seu certificado de participação na <strong>${eventName}</strong> está anexado a este e-mail.
        </p>
        <div style="background: #ecfdf5; border-left: 4px solid #1a472a; padding: 16px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #1a472a;">📄 O certificado está em formato PDF</p>
          <p style="margin: 8px 0 0; color: #1a472a;">✅ Carga horária: ${eventWorkload} horas</p>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          Guarde este certificado. Ele é válido como comprovante de formação continuada.
        </p>
      </div>
      <div style="background: #f1f5f9; padding: 16px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          © 2026 SEMED Tuntum — Secretaria Municipal de Educação
        </p>
      </div>
    </div>
  `
}

// ── Send Functions ──

export async function sendConfirmationEmail(to: string, nome: string): Promise<boolean> {
  if (!transporter) {
    console.log(`📧 [MOCK] E-mail de confirmação para ${to} (${nome})`)
    return false
  }

  const s = await getSettings()
  const eventName = s.event_name || 'Jornada Pedagógica 2026'

  await transporter.sendMail({
    from: `"SEMED Tuntum" <${gmailUser}>`,
    to,
    subject: `✅ Inscrição Confirmada — ${eventName}`,
    html: confirmationTemplate(nome, s),
  })

  console.log(`📧 E-mail de confirmação enviado para ${to}`)
  return true
}

export async function sendCertificateEmail(
  to: string,
  nome: string,
  pdfPath: string
): Promise<boolean> {
  if (!transporter) {
    console.log(`📧 [MOCK] Certificado para ${to} (${nome})`)
    return false
  }

  const s = await getSettings()
  const eventName = s.event_name || 'Jornada Pedagógica 2026'

  await transporter.sendMail({
    from: `"SEMED Tuntum" <${gmailUser}>`,
    to,
    subject: `🏆 Certificado — ${eventName}`,
    html: certificateEmailTemplate(nome, s),
    attachments: [
      {
        filename: `Certificado_${nome.replace(/\s+/g, '_')}.pdf`,
        path: pdfPath,
      },
    ],
  })

  console.log(`📧 Certificado enviado para ${to}`)
  return true
}
