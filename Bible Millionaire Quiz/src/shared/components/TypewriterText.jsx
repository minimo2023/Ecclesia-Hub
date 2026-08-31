import React, { useState, useEffect } from 'react';

const TypewriterText = ({ text, delay = 30 }) => {
    const [displayedText, setDisplayedText] = useState('');
    
    useEffect(() => {
        setDisplayedText('');
        let i = 0;
        if (!text) return;
        
        const timer = setInterval(() => {
            if (i < text.length) {
                setDisplayedText(text.substring(0, i + 1));
                i++;
            } else {
                clearInterval(timer);
            }
        }, delay);
        
        return () => clearInterval(timer);
    }, [text, delay]);

    return <span>{displayedText}</span>;
};

export default TypewriterText;
