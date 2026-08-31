import nodemailer from 'nodemailer';

const requiredKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'];

function htmlEscape(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

class MailService {
    constructor() {
        this.transporter = null;
    }

    getConfig() {
        const missing = requiredKeys.filter(key => !String(process.env[key] || '').trim());
        if (missing.length > 0) {
            const error = new Error(`SMTP 尚未完成設定：${missing.join(', ')}`);
            error.code = 'SMTP_NOT_CONFIGURED';
            throw error;
        }

        return {
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: String(process.env.SMTP_SECURE || 'true').toLowerCase() === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD
            },
            tls: { rejectUnauthorized: true }
        };
    }

    getTransporter() {
        if (!this.transporter) {
            this.transporter = nodemailer.createTransport(this.getConfig());
        }
        return this.transporter;
    }

    publicUrl(pathname = '/') {
        const base = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
        if (!/^https?:\/\//i.test(base)) {
            const error = new Error('PUBLIC_APP_URL 尚未正確設定');
            error.code = 'PUBLIC_APP_URL_NOT_CONFIGURED';
            throw error;
        }
        return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
    }

    async send({ to, subject, text, html, from = process.env.SMTP_FROM }) {
        return this.getTransporter().sendMail({ from, to, subject, text, html });
    }

    async sendVerificationEmail({ to, displayName, token }) {
        const url = this.publicUrl(`/?auth=verify-email&token=${encodeURIComponent(token)}`);
        const safeName = htmlEscape(displayName || '會員');
        await this.send({
            to,
            subject: '【聖經智匯】請驗證您的 Email',
            text: `您好 ${displayName || '會員'}，請在 24 小時內開啟以下連結完成 Email 驗證：${url}`,
            html: `<p>您好 ${safeName}：</p><p>請在 24 小時內完成 Email 驗證。</p><p><a href="${htmlEscape(url)}">驗證 Email</a></p><p>若您沒有提出此要求，請忽略這封信。</p>`
        });
    }

    async sendPasswordResetEmail({ to, displayName, token }) {
        const url = this.publicUrl(`/?auth=reset-password&token=${encodeURIComponent(token)}`);
        const safeName = htmlEscape(displayName || '會員');
        await this.send({
            to,
            subject: '【聖經智匯】重設密碼',
            text: `您好 ${displayName || '會員'}，請在 30 分鐘內開啟以下連結重設密碼：${url}`,
            html: `<p>您好 ${safeName}：</p><p>請在 30 分鐘內重設密碼。</p><p><a href="${htmlEscape(url)}">重設密碼</a></p><p>若您沒有提出此要求，請忽略這封信。</p>`
        });
    }
}

export default new MailService();
