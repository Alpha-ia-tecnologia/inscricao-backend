const login = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@semed.tuntum.ma.gov.br', senha: 'admin2026' }),
})
const { token } = await login.json()
console.log('✅ Login OK')

const headers = { Authorization: `Bearer ${token}` }

// Test stats
const statsRes = await fetch('http://localhost:3000/api/certificados/stats', { headers })
const stats = await statsRes.json()
console.log('📊 Stats:', JSON.stringify(stats, null, 2))

// Test settings
const settingsRes = await fetch('http://localhost:3000/api/settings')
const settings = await settingsRes.json()
console.log('⚙️  Settings:', JSON.stringify(settings, null, 2))

// Test generate (only if there are eligible participants)
if (stats.totalPresentes > 0) {
    const genRes = await fetch('http://localhost:3000/api/certificados/gerar', { method: 'POST', headers })
    const genResult = await genRes.json()
    console.log('🏆 Generate:', JSON.stringify(genResult, null, 2))
} else {
    console.log('⚠️  No present participants to generate certificates for')
}
