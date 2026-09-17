import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Generate a random Base32 encoded secret key (160-bit / 20 bytes).
 */
export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decode base32 string to Buffer.
 */
function base32ToBuffer(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Compute the 6-digit TOTP code for a given timestamp and secret.
 */
export function generateTotpCode(secret: string, timestamp = Date.now(), stepSeconds = 30): string {
  const key = base32ToBuffer(secret);
  const counter = Math.floor(timestamp / 1000 / stepSeconds);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter), 0);

  const hmac = createHmac("sha1", key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return String(otp).padStart(6, "0");
}

/**
 * Verify a user-entered 6-digit TOTP code allowing for 1 step clock drift (-30s to +30s).
 */
export function verifyTotpCode(secret: string, code: string, windowSteps = 1): boolean {
  if (!code || code.length !== 6) return false;
  const cleanCode = code.trim();
  const now = Date.now();

  for (let i = -windowSteps; i <= windowSteps; i++) {
    const checkTime = now + i * 30 * 1000;
    if (generateTotpCode(secret, checkTime) === cleanCode) {
      return true;
    }
  }

  return false;
}

/**
 * Generates an otpauth:// URI for QR code scanning in Google Authenticator.
 */
export function getTotpUri({
  secret,
  accountName,
  issuer = "CLA Flow",
}: {
  secret: string;
  accountName: string;
  issuer?: string;
}): string {
  const encIssuer = encodeURIComponent(issuer);
  const encAccount = encodeURIComponent(accountName);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates 8 random single-use backup recovery codes.
 */
export function generateBackupCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(4).toString("hex").toUpperCase();
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}
