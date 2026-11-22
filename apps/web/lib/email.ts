// Envío de correos (enlaces mágicos). En local usa Mailpit: http://localhost:8025
import 'server-only';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});

const FROM = process.env.EMAIL_FROM ?? 'Quiz_Rush <no-reply@quizrush.local>';

export async function sendMagicLinkEmail(to: string, url: string) {
  const html = `
  <div style="font-family:Arial,sans-serif;background:#0e0b26;padding:32px;color:#f5f3ff">
    <div style="max-width:480px;margin:auto;background:#1a1640;border-radius:18px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:28px">⚡ Quiz_Rush</h1>
      <p style="font-size:16px;line-height:1.5">¡Hola! Pulsa el botón para entrar. El enlace caduca en 5 minutos.</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${url}" style="background:#ffe14d;color:#1a1640;font-weight:bold;text-decoration:none;padding:14px 28px;border-radius:14px;display:inline-block">Entrar a Quiz_Rush</a>
      </p>
      <p style="font-size:12px;color:#a7a3cc">Si no pediste este correo, ignóralo.<br/>Hi! Click the button to sign in. If you didn't request this, ignore it.</p>
    </div>
  </div>`;
  await transporter.sendMail({
    from: FROM,
    to,
    subject: '⚡ Tu enlace para entrar a Quiz_Rush',
    text: `Entra a Quiz_Rush con este enlace (caduca en 5 minutos): ${url}`,
    html,
  });
}
