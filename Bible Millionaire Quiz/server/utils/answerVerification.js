export function isVerifiedAnswerCorrect(decodedAnswerToken, selectedOption) {
    if (!decodedAnswerToken) return false;
    if (typeof selectedOption === 'number' && Number.isInteger(selectedOption)) {
        return Number(decodedAnswerToken.correctIndex) === selectedOption;
    }
    if (typeof selectedOption !== 'string') return false;

    const selected = selectedOption.trim();
    const expected = String(decodedAnswerToken.answer || '').trim();
    if (selected === expected) return true;
    if (/^[A-D]$/.test(selected)) {
        return Number(decodedAnswerToken.correctIndex) === selected.charCodeAt(0) - 65;
    }
    return false;
}
