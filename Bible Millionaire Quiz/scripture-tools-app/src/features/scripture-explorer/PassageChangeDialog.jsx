import { AlertTriangle } from 'lucide-react';

export function PassageChangeDialog({ open, busy, onKeep, onDiscard, onCancel }) {
    if (!open) return null;
    return (
        <div className="explorer-dialog-backdrop" role="presentation">
            <section className="explorer-dialog" role="dialog" aria-modal="true" aria-labelledby="passage-change-title">
                <AlertTriangle size={26} />
                <h2 id="passage-change-title">目前正在錄音</h2>
                <p>切換經文前，需要先決定如何處理這段錄音。系統不會自動丟棄。</p>
                <div className="button-stack">
                    <button type="button" className="primary-button" onClick={onKeep} disabled={busy}>停止並保留錄音</button>
                    <button type="button" className="danger-button" onClick={onDiscard} disabled={busy}>停止並丟棄錄音</button>
                    <button type="button" className="secondary-button" onClick={onCancel} disabled={busy}>繼續目前錄音</button>
                </div>
            </section>
        </div>
    );
}
