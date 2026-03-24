import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.EXPLANATION_ENCRYPTION_KEY || '0'.repeat(64), 'hex')

export function encrypt(plaintext: string): string {
  if (!plaintext) return ''
  const nonce = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, nonce)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([nonce, encrypted, tag]).toString('base64')
}

export function decrypt(base64: string): string {
  if (!base64) return ''
  try {
    const buf = Buffer.from(base64, 'base64')
    const nonce = buf.subarray(0, 12)
    const tag = buf.subarray(buf.length - 16)
    const ciphertext = buf.subarray(12, buf.length - 16)
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, nonce)
    decipher.setAuthTag(tag)
    return decipher.update(ciphertext) + decipher.final('utf8')
  } catch {
    return base64 // fallback: return as-is if not encrypted
  }
}
