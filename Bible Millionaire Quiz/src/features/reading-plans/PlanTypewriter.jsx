import React, { useState, useEffect, useRef } from 'react';
import { BOOK_CHAPTERS } from '../../data/constants';

export default function PlanTypewriter({ userName, selectedBooks, duration = 30, mode = 'all' }) {
  const [displayText1, setDisplayText1] = useState('');
  const [displayText2, setDisplayText2] = useState('');
  const [displayText3, setDisplayText3] = useState('');
  const [phase, setPhase] = useState(0); 
  
  const totalChapters = selectedBooks.reduce((sum, book) => sum + (BOOK_CHAPTERS[book] || 1), 0);
  
  const text1 = mode === 'duration' 
    ? `${userName || '使用者'}，你選擇了 ${selectedBooks.length} 卷共 ${totalChapters} 章。` 
    : `${userName || '朋友'}，今天想計畫讀什麼呢？`;
    
  const text2 = mode === 'duration' ? '' : '選擇你想要的範圍，我會為你安排進度。';
  
  const prevSelectedRef = useRef('');
  const prevDurationRef = useRef(duration);
  const prevModeRef = useRef(mode);
  
  // Initialize sequence
  useEffect(() => {
    let timeoutId;
    
    if (phase === 0) {
      setPhase(1);
    } 
    else if (phase === 1) {
      if (displayText1.length < text1.length) {
        timeoutId = setTimeout(() => {
          setDisplayText1(text1.substring(0, displayText1.length + 1));
        }, 50);
      } else {
        timeoutId = setTimeout(() => setPhase(2), 600); // Pause after line 1
      }
    }
    else if (phase === 2) {
      timeoutId = setTimeout(() => setPhase(3), 200); // Short transition
    }
    else if (phase === 3) {
      if (displayText2.length < text2.length) {
        timeoutId = setTimeout(() => {
          setDisplayText2(text2.substring(0, displayText2.length + 1));
        }, 50);
      } else {
        setPhase(4);
      }
    }
    
    return () => clearTimeout(timeoutId);
  }, [phase, displayText1, displayText2, text1, text2, mode]);

  // Handle book selection & duration change
  useEffect(() => {
    const selectedStr = selectedBooks.join(',');
    if (phase >= 4 && selectedBooks.length > 0 && (selectedStr !== prevSelectedRef.current || duration !== prevDurationRef.current || mode !== prevModeRef.current)) {
      prevSelectedRef.current = selectedStr;
      prevDurationRef.current = duration;
      prevModeRef.current = mode;
      
      const chaptersPerDay = Math.max(1, Math.ceil(totalChapters / duration));
      
      let newText3 = '';
      if (mode === 'books') {
        newText3 = `${userName || '使用者'}，你選擇了 ${selectedBooks.length} 卷共 ${totalChapters} 章。`;
      } else if (mode === 'duration') {
        newText3 = `${duration} 天每天讀 ${chaptersPerDay} 章，就可以完成計畫！`;
      } else {
        newText3 = `${userName || '使用者'}，你選擇了 ${selectedBooks.length} 卷 ${totalChapters} 章，${duration} 天每天讀 ${chaptersPerDay} 章，就可以完成計畫！`;
      }
      
      // Reset line 3 and start typing
      setDisplayText3('');
      setPhase(5);
      
      let i = 0;
      const typeNextChar = () => {
        if (i < newText3.length) {
          setDisplayText3(newText3.substring(0, i + 1));
          i++;
          setTimeout(typeNextChar, 50);
        } else {
          setPhase(6);
        }
      };
      
      setTimeout(typeNextChar, 100);
    } else if (selectedBooks.length === 0 && mode !== 'duration') {
      prevSelectedRef.current = '';
      setDisplayText3('');
    }
  }, [selectedBooks, duration, phase, mode, userName, totalChapters]);

  return (
    <div className={`font-medium text-slate-700 space-y-1.5 text-center flex flex-col items-center ${mode === 'duration' ? 'min-h-[4rem]' : 'min-h-[5rem]'}`}>
      {/* Line 1 */}
      {(phase >= 1) && (
        <div className={`text-xl sm:text-2xl font-black ${mode === 'duration' ? 'text-slate-900' : 'text-slate-900'}`}>
          {displayText1}
          {phase === 1 && <span className="animate-pulse">|</span>}
        </div>
      )}
      
      {/* Line 2 */}
      {(phase >= 3 && mode !== 'duration') && (
        <div className="text-sm sm:text-base text-slate-500">
          {displayText2}
          {(phase === 3 || (phase === 4 && selectedBooks.length === 0)) && <span className="animate-pulse">|</span>}
        </div>
      )}
      
      {/* Line 3 (Selection) */}
      {(phase >= 5 && selectedBooks.length > 0) && (
        <div className={`text-sm sm:text-base font-bold mt-2 ${mode === 'duration' ? 'text-indigo-600' : 'text-indigo-600'}`}>
          {displayText3}
          {(phase === 5 || phase === 6) && <span className="animate-pulse">|</span>}
        </div>
      )}
    </div>
  );
}
