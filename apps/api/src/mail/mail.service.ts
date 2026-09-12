import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { AppConfig } from '../config/configuration';

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends via SMTP when configured; otherwise logs the rendered email instead of
 * sending — see IMPLEMENTATION_DECISIONS.md D-016.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private from: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.from = this.configService.get('mail.from', { infer: true });
  }

  onModuleInit() {
    const host = this.configService.get('mail.host', { infer: true });
    if (!host) {
      this.logger.warn('SMTP_HOST not configured — MailService will log emails instead of sending them.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: this.configService.get('mail.port', { infer: true }),
      auth: {
        user: this.configService.get('mail.user', { infer: true }),
        pass: this.configService.get('mail.password', { infer: true }),
      },
    });
  }

  async send(input: SendMailInput): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `[DEV MODE — email not sent] To: ${input.to} | Subject: ${input.subject}\n${input.text ?? input.html}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    await this.send({
      to,
      subject: 'Reset your AbyteTex password',
      html: `<p>We received a request to reset your AbyteTex password.</p>
             <p><a href="${resetUrl}">Click here to reset your password</a>. This link expires in 1 hour.</p>
             <p>If you did not request this, you can safely ignore this email.</p>`,
      text: `Reset your AbyteTex password: ${resetUrl} (expires in 1 hour)`,
    });
  }

  async sendWelcome(to: string, firstName: string, setPasswordUrl: string): Promise<void> {
    await this.send({
      to,
      subject: 'Welcome to AbyteTex',
      html: `<p>Hi ${firstName},</p>
             <p>Your AbyteTex account has been created. <a href="${setPasswordUrl}">Click here to set your password</a> and get started.</p>`,
      text: `Hi ${firstName}, your AbyteTex account has been created. Set your password: ${setPasswordUrl}`,
    });
  }
}
