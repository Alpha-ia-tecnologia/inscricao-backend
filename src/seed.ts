import bcrypt from 'bcryptjs'
import db from './db.js'

// ── Seed admin user ──
const adminEmail = 'admin@semed.tuntum.ma.gov.br'
const adminPassword = 'admin2026'
const adminNome = 'Administrador SEMED'

const existing = db.prepare('SELECT id FROM admins WHERE email = ?').get(adminEmail)

if (existing) {
    console.log('✅ Admin já existe:', adminEmail)
} else {
    const hash = bcrypt.hashSync(adminPassword, 10)
    db.prepare('INSERT INTO admins (email, senha_hash, nome) VALUES (?, ?, ?)').run(
        adminEmail,
        hash,
        adminNome
    )
    console.log('✅ Admin criado:', adminEmail)
    console.log('🔑 Senha:', adminPassword)
}

console.log('\nSeed concluído!')

// ── Seed settings ──
const defaultSettings: Record<string, string> = {
    event_name: 'Jornada Pedagógica 2026',
    event_date: '25 e 26 de Fevereiro de 2026',
    event_location: 'Centro de Convenções — Tuntum, MA',
    event_workload: '40',
}

for (const [key, value] of Object.entries(defaultSettings)) {
    const existingSetting = db.prepare('SELECT key FROM settings WHERE key = ?').get(key)
    if (!existingSetting) {
        db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value)
        console.log(`✅ Configuração criada: ${key} -> "${value}"`)
    } else {
        console.log(`✅ Configuração já existe: ${key}`)
    }
}
