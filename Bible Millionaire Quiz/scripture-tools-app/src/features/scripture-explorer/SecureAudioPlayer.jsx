import { useState } from 'react';
import { Headphones, LoaderCircle } from 'lucide-react';
import { fetchRecordingPlaybackTicket, fetchSharePlaybackTicket, playbackUrl } from '../../api.js';

export function SecureAudioPlayer({ recordingId, shareToken, ticketLoader, label = '播放朗讀', onPlay }) {
    const [src, setSrc] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const prepare = async () => {
        setLoading(true);
        setError('');
        try {
            const result = ticketLoader
                ? await ticketLoader(recordingId)
                : shareToken
                ? await fetchSharePlaybackTicket(shareToken)
                : await fetchRecordingPlaybackTicket(recordingId);
            setSrc(playbackUrl(result.ticket));
        } catch (nextError) {
            setError(nextError.message);
        } finally {
            setLoading(false);
        }
    };

    if (!src) {
        return (
            <div className="secure-audio-placeholder">
                <button type="button" className="secondary-button" onClick={prepare} disabled={loading}>
                    {loading ? <LoaderCircle className="spin" size={17} /> : <Headphones size={17} />}
                    {loading ? '準備中…' : label}
                </button>
                {error && <small className="inline-error" role="alert">{error}</small>}
            </div>
        );
    }

    return (
        <audio
            className="secure-audio"
            controls
            controlsList="nodownload noremoteplayback"
            disableRemotePlayback
            preload="metadata"
            src={src}
            onPlay={onPlay}
            onContextMenu={event => event.preventDefault()}
        >你的瀏覽器不支援音訊播放。</audio>
    );
}

export default SecureAudioPlayer;
