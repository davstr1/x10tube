import nodemailer from 'nodemailer';
import { config } from '../config.js';

const transporter = config.smtpHost
  ? nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: { user: config.smtpUser, pass: config.smtpPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    })
  : null;

export async function sendUninstallFeedback(reason: string, details: string, email: string): Promise<void> {
  if (!transporter) {
    console.log('[Mailer] SMTP not configured, skipping email');
    return;
  }
  const lines = [`Reason: ${reason}`, '', `Details:`, details || '(none)'];
  if (email) {
    lines.push('', `Reply to: ${email}`);
  }
  await transporter.sendMail({
    from: `"StraightToYourAI" <${config.smtpUser}>`,
    to: config.feedbackTo,
    replyTo: email || undefined,
    subject: `[STYA] Uninstall feedback: ${reason}`,
    text: lines.join('\n'),
  });
}
