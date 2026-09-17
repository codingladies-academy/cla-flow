import { describe, expect, it } from "vitest";
import {
  generateBackupCodes,
  generateTotpCode,
  generateTotpSecret,
  getTotpUri,
  verifyTotpCode,
} from "../totp";

describe("TOTP / 2FA Authenticator Library", () => {
  it("generates a valid base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toBeDefined();
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  it("generates and verifies 6-digit TOTP codes", () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);

    expect(code).toHaveLength(6);
    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects invalid or expired codes outside the time window", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "000000")).toBe(false);

    // Code from 10 minutes ago
    const pastCode = generateTotpCode(secret, Date.now() - 10 * 60 * 1000);
    expect(verifyTotpCode(secret, pastCode)).toBe(false);
  });

  it("generates valid otpauth URI for QR codes", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const uri = getTotpUri({
      secret,
      accountName: "user@codingladies.org",
      issuer: "CLA Flow",
    });

    expect(uri).toContain("otpauth://totp/CLA%20Flow:user%40codingladies.org");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=CLA%20Flow");
  });

  it("generates 8 unique emergency backup codes", () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    for (const code of codes) {
      expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);
    }
  });
});
