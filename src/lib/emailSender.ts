/**
 * EmailSender Service for Coding Ladies Academy
 * Dispatches single and bulk emails via Azure Mailer microservice.
 */

export interface EmailData {
  to?: string;
  email?: string;
  from?: string;
  sender?: string;
  replyTo?: string;
  subject: string;
  first_name?: string;
  last_name?: string;
  contact?: string;
  html?: string;
  text?: string;
  attachments?: any[];
  [key: string]: any;
}

export interface BulkEmailPayload {
  recipients: string[];
  from?: string;
  sender?: string;
  replyTo?: string;
  subject: string;
  text?: string;
  html: string;
  attachments?: any[];
  batchSize?: number;
  delayMs?: number;
}

// Standard Coding Ladies Email Template Layout
const BASE_EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>%subject%</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333333;
      margin: 0;
      padding: 0;
      background-color: #f4f6f9;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      padding: 30px;
      border-radius: 12px;
      border-top: 5px solid #00BFB3;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    }
    .header {
      text-align: center;
      padding-bottom: 20px;
      border-bottom: 1px solid #eeeeee;
    }
    .content {
      padding: 25px 0;
      font-size: 14px;
      color: #444444;
    }
    .message-box {
      background-color: #f0fdfa;
      border-left: 4px solid #00BFB3;
      padding: 16px;
      margin: 20px 0;
      border-radius: 6px;
    }
    .button {
      display: inline-block;
      background-color: #00BFB3;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: bold;
      margin: 15px 0;
    }
    .footer {
      text-align: center;
      padding-top: 20px;
      border-top: 1px solid #eeeeee;
      font-size: 12px;
      color: #888888;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <img src="https://portal.codingladies.org/nav-logo.png" alt="Coding Ladies Academy Logo" style="max-height: 48px; width: auto; display: block; margin: 0 auto;" />
      <p style="margin: 6px 0 0 0; font-size: 12px; color: #666666;">Empowering Women in Technology & Leadership</p>
    </div>

    <div class="content">
      <h2 style="color: #111827; margin-top: 0;">%subject%</h2>
      <div class="message-box">
        %message%
      </div>
      <p style="margin-top: 20px;">If you have any questions, feel free to reply directly to this email or contact support.</p>
    </div>

    <div class="footer">
      <p>&copy; %copyright_year% Coding Ladies Academy. All rights reserved.</p>
      <p>Takoradi, Ghana &bull; <a href="https://codingladies.org" style="color: #00BFB3; text-decoration: none;">codingladies.org</a></p>
    </div>
  </div>
</body>
</html>`;

export class EmailSender {
  private apiUrl: string;
  private bulkApiUrl: string;

  constructor() {
    this.apiUrl =
      process.env.AZURE_MAILER_SINGLE_URL ||
      "https://mail.codingladies.org/send-email";
    this.bulkApiUrl =
      process.env.AZURE_MAILER_BULK_URL ||
      "https://mail.codingladies.org/send-bulk";
  }

  /**
   * Prepares the message HTML body by injecting placeholders into template layout
   */
  public prepareMessage(emailData: EmailData, customHtmlTemplate?: string): string {
    let template = customHtmlTemplate || BASE_EMAIL_TEMPLATE;
    const currentYear = new Date().getFullYear().toString();

    // Base replacement placeholders (%key% and {{key}})
    const replacements: Record<string, string> = {
      "%subject%": emailData.subject || "",
      "%message%": emailData.html || emailData.text || "",
      "%copyright_year%": currentYear,
      "%first_name%": emailData.first_name || "",
      "%last_name%": emailData.last_name || "",
      "%email%": emailData.email || emailData.to || "",
      "%recipient_contact%": emailData.contact || "",
      "{{subject}}": emailData.subject || "",
      "{{message}}": emailData.html || emailData.text || "",
      "{{copyright_year}}": currentYear,
      "{{first_name}}": emailData.first_name || "",
      "{{last_name}}": emailData.last_name || "",
      "{{email}}": emailData.email || emailData.to || "",
      "{{recipient_contact}}": emailData.contact || "",
    };

    // Apply base replacements
    Object.keys(replacements).forEach((key) => {
      template = template.replaceAll(key, replacements[key]);
    });

    // Apply dynamic object key replacements
    Object.keys(emailData).forEach((key) => {
      const val = emailData[key];
      if (typeof val === "string" || typeof val === "number") {
        template = template.replaceAll(`%${key}%`, String(val));
        template = template.replaceAll(`{{${key}}}`, String(val));
      }
    });

    return template;
  }

  /**
   * Send single email via Azure Mailer
   */
  public async sendEmail(emailData: EmailData, customTemplateHtml?: string) {
    const finalHtml = this.prepareMessage(emailData, customTemplateHtml);
    const payload = {
      ...emailData,
      html: finalHtml,
      cc: emailData.cc || null,
    };

    return this.curlPost(this.apiUrl, payload);
  }

  /**
   * Send bulk email to recipient list via Azure Mailer
   */
  public async sendBulkEmail(
    recipients: string[],
    emailData: EmailData,
    batchSize: number = 100,
    delayMs: number = 2000,
    customTemplateHtml?: string
  ) {
    const finalHtml = this.prepareMessage(emailData, customTemplateHtml);
    const payload: BulkEmailPayload = {
      recipients,
      from: emailData.from || "Coding Ladies Academy <hello@codingladies.org>",
      sender: emailData.sender || "Coding Ladies Academy",
      replyTo: emailData.replyTo || "support@codingladies.org",
      subject: emailData.subject,
      text: emailData.text || "",
      html: finalHtml,
      attachments: emailData.attachments || undefined,
      batchSize,
      delayMs,
    };

    return this.curlPost(this.bulkApiUrl, payload);
  }

  /**
   * HTTP POST request executor
   */
  private async curlPost(url: string, data: any) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const json = await res.json();
      return { success: res.ok, response: json };
    } catch (err: any) {
      return { success: false, error: err?.message || "Failed to connect to email server" };
    }
  }
}

export const emailSender = new EmailSender();
