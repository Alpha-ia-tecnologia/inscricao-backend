import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool, initDb } from './db.js'

async function seed() {
    // Ensure tables exist
    await initDb()

    // ── Admin padrão ──
    const email = 'admin@semed.tuntum.ma.gov.br'
    const senhaHash = bcrypt.hashSync('admin2026', 10)

    await pool.query(
        `INSERT INTO admins (email, senha_hash, nome)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO NOTHING`,
        [email, senhaHash, 'Administrador SEMED']
    )
    console.log('✅ Admin padrão criado (ou já existia)')

    // ── Settings padrão ──
    const defaultSettings = [
        ['event_name', 'Jornada Pedagógica 2026'],
        ['event_date', '25 e 26 de Fevereiro de 2026'],
        ['event_location', 'Centro de Convenções — Tuntum, MA'],
        ['event_workload', '40'],
        ['vagas_dia1', '500'],
        ['vagas_dia2', '500'],
    ]

    for (const [key, value] of defaultSettings) {
        await pool.query(
            `INSERT INTO settings (key, value)
             VALUES ($1, $2)
             ON CONFLICT (key) DO NOTHING`,
            [key, value]
        )
    }
    console.log('✅ Configurações padrão criadas (ou já existiam)')

    await pool.end()
    console.log('🏁 Seed concluído!')
}

seed().catch((err) => {
    console.error('❌ Erro no seed:', err)
    process.exit(1)
})
