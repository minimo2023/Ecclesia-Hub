(() => {
    const choices = new Set(['和', '新', '現']);
    const badgeClass = 'mixed-translation-game-badge';

    const replaceTranslationPicker = () => {
        for (const container of document.querySelectorAll('div, section')) {
            if (container.querySelector(`.${badgeClass}`)) continue;
            const buttons = [...container.children].filter(child => child.tagName === 'BUTTON');
            const labels = new Set(buttons.map(button => button.textContent.trim()));
            if (buttons.length !== 3 || labels.size !== 3 || ![...choices].every(label => labels.has(label))) continue;

            const badge = document.createElement('div');
            badge.className = badgeClass;
            badge.setAttribute('role', 'status');
            badge.textContent = '四譯本混合出題';
            container.replaceChildren(badge);
        }
    };

    const style = document.createElement('style');
    style.textContent = `
        .${badgeClass} {
            grid-column: 1 / -1;
            width: 100%;
            box-sizing: border-box;
            padding: 0.65rem 0.9rem;
            border: 1px solid rgba(245, 158, 11, 0.35);
            border-radius: 0.75rem;
            background: rgba(245, 158, 11, 0.1);
            color: inherit;
            font-size: 0.9rem;
            font-weight: 700;
            text-align: center;
        }
    `;
    document.head.appendChild(style);

    let scheduled = false;
    const scheduleReplacement = () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            replaceTranslationPicker();
        });
    };

    new MutationObserver(scheduleReplacement).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    scheduleReplacement();
})();
