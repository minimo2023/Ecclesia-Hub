import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Common Avatar Component
 * [V8.8 Fix] Displays user avatar with fallback support and absolute URL normalization.
 */
const Avatar = ({ user, avatarId, size = 'md', className = '', showBorder = false }) => {
    const { normalizeUrl } = useAuth();
    
    // Determine Avatar ID
    let currentAvatarId = 'guest';

    if (avatarId) {
        currentAvatarId = avatarId;
    } else if (user?.settings?.avatar) {
        currentAvatarId = user.settings.avatar;
    } else if (user?.avatar) {
        currentAvatarId = user.avatar;
    }

    // Size Classes
    const sizeClasses = {
        sm: 'w-8 h-8',
        md: 'w-12 h-12',
        lg: 'w-16 h-16',
        xl: 'w-24 h-24',
        xxl: 'w-32 h-32',
        full: 'w-full h-full'
    };

    /**
     * getInitialSrc - [V8.8 Fix] Smart path detection
     */
    const getInitialSrc = (id) => {
        if (!id) return '/images/avatars/guest.svg?v=emoji';
        
        // [V8.8 Fix] If it starts with /uploads, it's a custom photo
        if (id.startsWith('/uploads')) {
            return normalizeUrl(id);
        }
        
        // Otherwise, it's a predefined ID
        return `/images/avatars/${id}.png`;
    };

    const [imgSrc, setImgSrc] = useState(getInitialSrc(currentAvatarId));
    const [attempt, setAttempt] = useState(0); // 0=png/custom, 1=svg, 2=fallback

    useEffect(() => {
        setImgSrc(getInitialSrc(currentAvatarId));
        setAttempt(0);
    }, [currentAvatarId]);

    const handleError = () => {
        // [V8.8 Fix] If custom upload failed, fallback to guest immediately
        if (currentAvatarId.startsWith('/uploads')) {
            setImgSrc('/images/avatars/guest.svg?v=emoji');
            setAttempt(2);
            return;
        }

        if (attempt === 0) {
            setImgSrc(`/images/avatars/${currentAvatarId}.svg?v=emoji`);
            setAttempt(1);
        } else if (attempt === 1) {
            setImgSrc('/images/avatars/guest.svg?v=emoji');
            setAttempt(2);
        }
    };

    return (
        <div className={`relative rounded-full overflow-hidden shrink-0 ${sizeClasses[size]} ${className} ${showBorder ? 'border-2 border-slate-600 shadow-md' : ''}`}>
            <img
                src={imgSrc}
                alt="Avatar"
                className="w-full h-full object-cover"
                onError={handleError}
            />
        </div>
    );
};

export default Avatar;
