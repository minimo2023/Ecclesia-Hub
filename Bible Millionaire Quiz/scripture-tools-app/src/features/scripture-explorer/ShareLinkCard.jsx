import { useEffect, useState } from 'react';
import { Check, Copy, QrCode, Share2 } from 'lucide-react';
import QRCode from 'qrcode';

export function ShareLinkCard({ token, onClose }) {
    const [copied, setCopied] = useState(false);
    const [qrData, setQrData] = useState('');
    const url = new URL('share.html', window.location.href);
    url.searchParams.set('token', token);
    const shareUrl = url.toString();

    useEffect(() => {
        QRCode.toDataURL(shareUrl, { width: 190, margin: 1, color: { dark: '#17324d', light: '#fffdf9' } })
            .then(setQrData)
            .catch(() => setQrData(''));
    }, [shareUrl]);

    const copy = async () => {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
    };

    const share = async () => {
        if (!navigator.share) return copy();
        await navigator.share({ title: '經文朗讀分享', text: '邀請你聆聽這段經文朗讀', url: shareUrl });
    };

    return (
        <section className="share-link-card" aria-label="分享朗讀">
            <div>
                <strong><Share2 size={17} /> 分享播放頁</strong>
                <small>連結只提供線上播放，不提供音檔下載。</small>
            </div>
            <input value={shareUrl} readOnly aria-label="分享連結" />
            <div className="share-link-actions">
                <button type="button" className="secondary-button" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? '已複製' : '複製連結'}</button>
                <button type="button" className="primary-button" onClick={share}><Share2 size={16} /> 分享</button>
                {onClose && <button type="button" className="text-button" onClick={onClose}>關閉</button>}
            </div>
            {qrData && <div className="share-qr"><QrCode size={16} /><img src={qrData} alt="分享連結 QR Code" /></div>}
        </section>
    );
}

export default ShareLinkCard;
