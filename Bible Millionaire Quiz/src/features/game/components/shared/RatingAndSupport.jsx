import React, { useState } from 'react';
import { Star, Heart } from 'lucide-react';

export default function RatingAndSupport({ onRate, onSupportClick }) {
    const [rating, setRating] = useState(0);
    const [hoveredRating, setHoveredRating] = useState(0);
    const [submitted, setSubmitted] = useState(false);

    const handleRate = (value) => {
        if (submitted) return;
        setRating(value);
        setSubmitted(true);
        if (onRate) {
            onRate(value);
        }
    };

    return (
        <div className="w-full max-w-sm mx-auto flex flex-col gap-3 mt-4">
            {/* Rating Section */}
            <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-sm text-center">
                <h3 className="text-sm font-bold text-slate-700 mb-2">
                    {submitted ? '感謝您的評價！' : '這場遊戲的體驗如何？'}
                </h3>
                <div className="flex justify-center gap-1">
                    {[1, 2, 3, 4, 5].map((value) => (
                        <button
                            key={value}
                            disabled={submitted}
                            onClick={() => handleRate(value)}
                            onMouseEnter={() => !submitted && setHoveredRating(value)}
                            onMouseLeave={() => !submitted && setHoveredRating(0)}
                            className={`p-1 transition-transform ${submitted ? 'cursor-default' : 'hover:scale-110 active:scale-95'}`}
                        >
                            <Star
                                className={`w-8 h-8 transition-colors ${
                                    value <= (hoveredRating || rating)
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'fill-slate-100 text-slate-200'
                                }`}
                            />
                        </button>
                    ))}
                </div>
            </div>

            {/* Support Section */}
            <button
                onClick={onSupportClick}
                className="w-full rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-left flex items-center justify-between active:bg-rose-100 transition-colors shadow-sm hover:shadow group"
            >
                <div>
                    <h3 className="text-[13px] font-black text-rose-900 group-hover:text-rose-700 transition-colors">支持「聖經智匯」</h3>
                    <p className="text-[11px] font-medium text-rose-700/80 mt-0.5">您的奉獻能幫助我們持續開發 🌱</p>
                </div>
                <Heart className="h-5 w-5 text-rose-400 group-hover:scale-110 transition-transform" />
            </button>
        </div>
    );
}
