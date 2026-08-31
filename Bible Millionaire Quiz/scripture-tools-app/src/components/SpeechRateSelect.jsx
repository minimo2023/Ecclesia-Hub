import { SPEECH_RATE_OPTIONS } from '../scriptureText.js';

export function SpeechRateSelect({ value, onChange, className = '' }) {
    return (
        <label className={['speech-rate-select', className].filter(Boolean).join(' ')}>
            <span>速度</span>
            <select
                aria-label="朗讀速度"
                value={String(value)}
                onChange={event => onChange(Number(event.target.value))}
            >
                {SPEECH_RATE_OPTIONS.map(rate => (
                    <option key={rate} value={rate}>{String(rate)}×</option>
                ))}
            </select>
        </label>
    );
}
