import React, { useState } from 'react';
import { 
    X, BookOpen, Zap, Users, Compass, 
    Trophy, ChevronRight, HelpCircle, 
    Info, Star, Shield, 
    Coffee, MousePointer2,
    Tent, Scroll, Heart, Coins
} from 'lucide-react';

export default function HelpModal({ isOpen, onClose }) {
    const [activeMode, setActiveMode] = useState('classic');

    if (!isOpen) return null;

    const modes = [
        { id: 'classic', label: '經典挑戰', icon: <Trophy size={18} />, color: 'text-amber-500' },
        { id: 'speed', label: '快問快答', icon: <Zap size={18} />, color: 'text-yellow-500' },
        { id: 'expedition', label: '聖經遠征', icon: <Compass size={18} />, color: 'text-rose-500' },
        { id: 'online', label: '區域連線', icon: <Users size={18} />, color: 'text-indigo-500' },
        { id: 'casual', label: '練習模式', icon: <Coffee size={18} />, color: 'text-emerald-500' }
    ];

    const renderModeContent = () => {
        switch (activeMode) {
            case 'classic':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h3 className="text-xl font-black text-stone-800 mb-3 flex items-center gap-2">
                                <Trophy className="text-amber-500" /> 經典問答：智力巔峰
                            </h3>
                            <p className="text-stone-600 leading-relaxed mb-4">
                                這是仿照「百萬富翁」設計的終極聖經考驗。挑戰 15 道題目，難度隨級別提升，目標是贏得最高榮譽與獎金。
                            </p>
                            
                            <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
                                <h4 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
                                    <MousePointer2 size={16} /> 如何操作 (How to Play)
                                </h4>
                                <ol className="space-y-3 text-sm text-amber-800/80">
                                    <li className="flex gap-2">
                                        <span className="font-black bg-amber-200/50 w-5 h-5 rounded-full flex items-center justify-center text-xs">1</span>
                                        <span>在模式選擇頁設定經卷範圍與起始等級。</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="font-black bg-amber-200/50 w-5 h-5 rounded-full flex items-center justify-center text-xs">2</span>
                                        <span>閱讀題目後，點擊您認為正確的選項（會變為黃色）。</span>
                                    </li>
                                    <li className="flex gap-2 text-rose-600 font-bold">
                                        <span className="font-black bg-amber-200/50 w-5 h-5 rounded-full flex items-center justify-center text-xs text-amber-800">3</span>
                                        <span>**關鍵操作**：您必須點擊下方的「確認作答」按鈕，系統才會進行判定。</span>
                                    </li>
                                    <li className="flex gap-2">
                                        <span className="font-black bg-amber-200/50 w-5 h-5 rounded-full flex items-center justify-center text-xs">4</span>
                                        <span>如不確定，可隨時點擊右側的求救道具欄。</span>
                                    </li>
                                </ol>
                            </div>

                            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-white border border-stone-100 rounded-2xl shadow-sm">
                                    <div className="text-xs font-black text-stone-400 mb-2 uppercase tracking-tighter">50:50 求助</div>
                                    <div className="text-sm text-stone-600">系統自動排除兩個錯誤選項，留下正確與一個干擾項。</div>
                                </div>
                                <div className="p-4 bg-white border border-stone-100 rounded-2xl shadow-sm">
                                    <div className="text-xs font-black text-stone-400 mb-2 uppercase tracking-tighter">打給專家</div>
                                    <div className="text-sm text-stone-600">連線至雲端智庫，屬靈專家會給出針對性的解經建議。</div>
                                </div>
                                <div className="p-4 bg-white border border-stone-100 rounded-2xl shadow-sm">
                                    <div className="text-xs font-black text-stone-400 mb-2 uppercase tracking-tighter">問觀眾</div>
                                    <div className="text-sm text-stone-600">參考所有玩家的大數據選擇比例，輔助您的決策。</div>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            case 'speed':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h3 className="text-xl font-black text-stone-800 mb-3 flex items-center gap-2">
                                <Zap className="text-yellow-500" /> 快問快答：靈命反應力
                            </h3>
                            <p className="text-stone-600 leading-relaxed mb-4">
                                專為熟習經文者設計。在極短時間內連續答題，挑戰長連勝以獲得高額「智匯金幣」報酬。
                            </p>
                            
                            <div className="bg-yellow-50 rounded-2xl p-5 border border-yellow-100">
                                <h4 className="font-bold text-yellow-900 mb-3 flex items-center gap-2">
                                    <MousePointer2 size={16} /> 操作差異 (Important!)
                                </h4>
                                <ul className="space-y-3 text-sm text-yellow-800/80">
                                    <li className="flex gap-2 items-center text-rose-600 font-black">
                                        <ChevronRight size={14} />
                                        <span>本模式「無確認按鈕」：點擊選項即立刻提交作答。</span>
                                    </li>
                                    <li className="flex gap-2 items-center">
                                        <ChevronRight size={14} />
                                        <span>頂端有隨機增益道具（如 +5s），点击可立即消耗金幣延長作答時間。</span>
                                    </li>
                                </ul>
                            </div>
                            
                            <div className="mt-4 p-4 bg-purple-50 rounded-2xl border border-purple-100">
                                <h5 className="text-sm font-black text-purple-800 mb-1">💡 企劃師攻略</h5>
                                <p className="text-xs text-purple-600/80">
                                    反應速度是本模式的核心。遇到生疏題目建議快速「猜測」而非長思，因為維持連勝節奏能帶來極高的倍數獎勵。
                                </p>
                            </div>
                        </section>
                    </div>
                );
            case 'expedition':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h3 className="text-xl font-black text-stone-800 mb-3 flex items-center gap-2">
                                <Compass className="text-rose-500" /> 聖經遠征：多人團隊冒險
                            </h3>
                            <p className="text-stone-600 leading-relaxed mb-4">
                                首創多人合作闖關模式，與夥伴橫跨平安平原、曠野行軍與死蔭幽谷，最終抵達「至聖之巔」。
                            </p>

                            <div className="bg-gradient-to-r from-rose-500 to-orange-500 rounded-3xl p-6 text-white shadow-lg mb-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Trophy size={24} />
                                    <h4 className="text-lg font-black tracking-tight">👑 管理者大寶藏 (Kingdom Treasure)</h4>
                                </div>
                                <p className="text-white/80 text-sm leading-relaxed">
                                    每個賽季管理員都會在至聖之巔存放巨額挑戰獎金。成功登頂的遠征隊將平分享受這份天國般的獎勵。通關層級越高，分紅比例越驚人！
                                </p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200">
                                    <h4 className="font-bold text-stone-800 mb-2 flex items-center gap-2">
                                        <Users size={16} /> 如何組隊
                                    </h4>
                                    <p className="text-xs text-stone-500 leading-relaxed">
                                        由「隊長」點選「聖經遠征」建立房間，將畫面上方的五碼隊伍碼分享給夥伴。夥伴在主頁點選「遠征」並輸入代碼即可加入。
                                    </p>
                                </div>
                                <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200">
                                    <h4 className="font-bold text-stone-800 mb-2 flex items-center gap-2">
                                        <Tent size={16} /> 安息與存檔
                                    </h4>
                                    <p className="text-xs text-stone-500 leading-relaxed">
                                        冒險過於艱難？點解「安息帳篷」道具將暫停遊戲並保存當前進度回到大廳。隊長下次進入時可點擊「恢復進度」接續挑戰。
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 bg-white border border-stone-100 rounded-2xl flex gap-3">
                                    <Scroll className="text-rose-400 shrink-0" />
                                    <div>
                                        <h5 className="font-black text-xs">聖靈卷軸</h5>
                                        <p className="text-[10px] text-stone-400">消除選項，助隊伍在歧路找到真理。</p>
                                    </div>
                                </div>
                                <div className="p-4 bg-white border border-stone-100 rounded-2xl flex gap-3">
                                    <Heart className="text-rose-400 shrink-0" />
                                    <div>
                                        <h5 className="font-black text-xs">恩典藥水 / 盾牌</h5>
                                        <p className="text-[10px] text-stone-400">恢復 HP 或抵擋一次答錯造成的傷害。</p>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            case 'online':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h3 className="text-xl font-black text-stone-800 mb-3 flex items-center gap-2">
                                <Users className="text-indigo-500" /> 區域連線：現場多人搶答
                            </h3>
                            <p className="text-stone-600 leading-relaxed mb-4">
                                適用於聚會、小組或大型活動。一台裝置負責「大螢幕顯示」，其他玩家透過手機掃碼參與搶答。
                            </p>

                            <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100 mb-6">
                                <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                                    <Coins size={16} className="text-yellow-600" /> 房主獎金池 (Host Prize Pool)
                                </h4>
                                <p className="text-sm text-indigo-800/80 leading-relaxed">
                                    本場活動的房主可以自訂撥出個人「智匯金幣」作為獎金池。結算時，前三名玩家將共同分配這筆獎勵，這讓現場氣氛更加白熱化！
                                </p>
                            </div>
                            
                            <div className="space-y-4">
                                <div className="flex gap-4 p-4 bg-white border border-stone-100 rounded-2xl shadow-sm">
                                    <div className="p-2 bg-stone-100 rounded-lg h-fit text-stone-400 font-black text-xs">主持人</div>
                                    <div className="text-sm text-stone-600">
                                        點擊「建立房間」並投放至電視或投影幕，引導玩家掃描畫面上的 QR Code 加入。
                                    </div>
                                </div>
                                <div className="flex gap-4 p-4 bg-white border border-stone-100 rounded-2xl shadow-sm">
                                    <div className="p-2 bg-stone-100 rounded-lg h-fit text-stone-400 font-black text-xs">參加者</div>
                                    <div className="text-sm text-stone-600">
                                        手機掃碼進入後，觀察題目顯現。當畫面出現 **3..2..1..GO** 的瞬間，最快點擊手機「搶答按鈕」者獲得答題權。
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>
                );
            case 'casual':
                return (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                        <section>
                            <h3 className="text-xl font-black text-stone-800 mb-3 flex items-center gap-2">
                                <Coffee className="text-emerald-500" /> 練習模式：無壓力的自習
                            </h3>
                            <p className="text-stone-600 leading-relaxed mb-4">
                                如果您是剛開始接觸聖經，練習模式是您的最佳選擇。沒有金幣消耗、沒有時限壓力，您可以根據您的步調熟習真理。
                            </p>
                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-4">
                                <Star className="text-emerald-500" />
                                <span className="text-sm text-emerald-800">適合每日靈修、兒童主日學或新朋友初次進入遊戲時使用。</span>
                            </div>
                        </section>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm transition-all animate-in fade-in">
            <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="px-8 py-6 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-3xl font-black text-stone-800 flex items-center gap-3">
                            <BookOpen className="text-rose-500" size={32} />
                            遊戲手冊
                        </h2>
                        <p className="text-xs text-stone-400 mt-1 font-bold uppercase tracking-widest">Official Bible Quiz Manual v2.5</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-3 hover:bg-white rounded-2xl text-stone-400 hover:text-stone-800 transition-all active:scale-95 shadow-sm border border-transparent hover:border-stone-100"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="px-8 mt-6">
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                            {modes.map(mode => (
                                <button
                                    key={mode.id}
                                    onClick={() => setActiveMode(mode.id)}
                                    className={`px-6 py-3 rounded-2xl font-black text-sm whitespace-nowrap transition-all flex items-center gap-2 border-2 ${
                                        activeMode === mode.id
                                            ? `bg-white ${mode.color.replace('text-', 'border-')} ${mode.color} shadow-lg shadow-stone-200`
                                            : 'bg-stone-50 border-transparent text-stone-400 hover:text-stone-600 hover:bg-stone-100'
                                    }`}
                                >
                                    {mode.icon}
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-8">
                        {renderModeContent()}
                    </div>
                </div>

                <div className="px-8 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs text-stone-400 font-bold">
                        <span className="flex items-center gap-1"><Shield size={14} /> 數據加密</span>
                        <span className="flex items-center gap-1"><Info size={14} /> 持續更新</span>
                    </div>
                    <div className="text-xs text-stone-400 font-black tracking-widest">
                        © 2024 BIBLEMILLIONAIRE TEAM
                    </div>
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #e5e7eb;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #d1d5db;
                }
                .scrollbar-none::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-none {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    );
}
