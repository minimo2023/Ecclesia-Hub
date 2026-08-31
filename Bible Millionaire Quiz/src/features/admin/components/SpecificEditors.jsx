import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

export function ClassicRewardEditor({ value, onChange }) {
    const config = value || { perQuestion: 0, victoryBonus: 0, categoryBonuses: [] };

    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="text-xs text-stone-500 block mb-1">每題基礎分數</label>
                    <input type="number" value={config.perQuestion || 0} onChange={e => onChange({...config, perQuestion: Number(e.target.value)})} className="w-full border border-stone-200 rounded p-2 text-sm outline-none focus:border-amber-400" />
                </div>
                <div className="flex-1">
                    <label className="text-xs text-stone-500 block mb-1">勝利加成比例 (如 0.2 = 20%)</label>
                    <input type="number" step="0.01" value={config.victoryBonus || 0} onChange={e => onChange({...config, victoryBonus: Number(e.target.value)})} className="w-full border border-stone-200 rounded p-2 text-sm outline-none focus:border-amber-400" />
                </div>
            </div>
            
            <div className="bg-stone-50 p-3 rounded-lg border border-stone-200">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-stone-700">分類完成加成 (Category Bonuses)</span>
                    <button onClick={() => onChange({...config, categoryBonuses: [...(config.categoryBonuses||[]), {bonus: 0, minBooks: 0}]})} className="text-xs flex items-center gap-1 bg-white border border-stone-200 px-2 py-1 rounded hover:bg-stone-100">
                        <Plus size={14}/> 新增
                    </button>
                </div>
                {(config.categoryBonuses || []).map((cb, idx) => (
                    <div key={idx} className="flex gap-3 mb-2 items-center bg-white p-2 rounded border border-stone-200">
                        <div className="flex-1">
                            <label className="text-[10px] text-stone-400 block">所需卷數</label>
                            <input type="number" value={cb.minBooks} onChange={e => {
                                const arr = [...config.categoryBonuses];
                                arr[idx].minBooks = Number(e.target.value);
                                onChange({...config, categoryBonuses: arr});
                            }} className="w-full border-b border-stone-200 p-1 text-sm outline-none focus:border-amber-400" />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] text-stone-400 block">加成比例</label>
                            <input type="number" step="0.01" value={cb.bonus} onChange={e => {
                                const arr = [...config.categoryBonuses];
                                arr[idx].bonus = Number(e.target.value);
                                onChange({...config, categoryBonuses: arr});
                            }} className="w-full border-b border-stone-200 p-1 text-sm outline-none focus:border-amber-400" />
                        </div>
                        <button onClick={() => {
                            const arr = [...config.categoryBonuses];
                            arr.splice(idx, 1);
                            onChange({...config, categoryBonuses: arr});
                        }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SpeedRewardEditor({ value, onChange }) {
    const config = value || { perQuestion: 0, streakBonuses: [] };

    return (
        <div className="space-y-4">
            <div>
                <label className="text-xs text-stone-500 block mb-1">每題基礎分數</label>
                <input type="number" value={config.perQuestion || 0} onChange={e => onChange({...config, perQuestion: Number(e.target.value)})} className="w-1/2 border border-stone-200 rounded p-2 text-sm outline-none focus:border-amber-400" />
            </div>
            
            <div className="bg-stone-50 p-3 rounded-lg border border-stone-200">
                <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-stone-700">連對加成 (Streak Bonuses)</span>
                    <button onClick={() => onChange({...config, streakBonuses: [...(config.streakBonuses||[]), {bonus: 0, streak: 0}]})} className="text-xs flex items-center gap-1 bg-white border border-stone-200 px-2 py-1 rounded hover:bg-stone-100">
                        <Plus size={14}/> 新增
                    </button>
                </div>
                {(config.streakBonuses || []).map((sb, idx) => (
                    <div key={idx} className="flex gap-3 mb-2 items-center bg-white p-2 rounded border border-stone-200">
                        <div className="flex-1">
                            <label className="text-[10px] text-stone-400 block">連對題數</label>
                            <input type="number" value={sb.streak} onChange={e => {
                                const arr = [...config.streakBonuses];
                                arr[idx].streak = Number(e.target.value);
                                onChange({...config, streakBonuses: arr});
                            }} className="w-full border-b border-stone-200 p-1 text-sm outline-none focus:border-amber-400" />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] text-stone-400 block">加成比例</label>
                            <input type="number" step="0.01" value={sb.bonus} onChange={e => {
                                const arr = [...config.streakBonuses];
                                arr[idx].bonus = Number(e.target.value);
                                onChange({...config, streakBonuses: arr});
                            }} className="w-full border-b border-stone-200 p-1 text-sm outline-none focus:border-amber-400" />
                        </div>
                        <button onClick={() => {
                            const arr = [...config.streakBonuses];
                            arr.splice(idx, 1);
                            onChange({...config, streakBonuses: arr});
                        }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16}/></button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function StagesEditor({ value, onChange }) {
    const stages = Array.isArray(value) ? value : [];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-stone-700">遠征關卡列表</span>
                <button onClick={() => onChange([...stages, {
                    id: `stage_${stages.length+1}`, name: '新關卡', reward: 0, bgColor: '#ffffff', countdown: 7, milestone: 100, protection: 'none', perQuestionReward: 1
                }])} className="text-xs flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-200 font-bold">
                    <Plus size={14}/> 新增關卡
                </button>
            </div>
            
            <div className="grid grid-cols-1 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {stages.map((stage, idx) => (
                    <div key={idx} className="bg-stone-50 border border-stone-200 rounded-xl p-4 relative">
                        <button onClick={() => {
                            const arr = [...stages];
                            arr.splice(idx, 1);
                            onChange(arr);
                        }} className="absolute top-4 right-4 text-stone-400 hover:text-red-500 transition"><Trash2 size={18}/></button>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pr-8">
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">關卡 ID</label>
                                <input type="text" value={stage.id || ''} onChange={e => {
                                    const arr = [...stages]; arr[idx].id = e.target.value; onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400 font-mono" />
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">關卡名稱</label>
                                <input type="text" value={stage.name || ''} onChange={e => {
                                    const arr = [...stages]; arr[idx].name = e.target.value; onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400 font-bold" />
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">通關獎勵金幣</label>
                                <input type="number" value={stage.reward || 0} onChange={e => {
                                    const arr = [...stages]; arr[idx].reward = Number(e.target.value); onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400" />
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">每題答對金幣</label>
                                <input type="number" value={stage.perQuestionReward || 0} onChange={e => {
                                    const arr = [...stages]; arr[idx].perQuestionReward = Number(e.target.value); onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400" />
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">倒數時間 (秒)</label>
                                <input type="number" value={stage.countdown || 0} onChange={e => {
                                    const arr = [...stages]; arr[idx].countdown = Number(e.target.value); onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400" />
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">通關所需里程</label>
                                <input type="number" value={stage.milestone || 0} onChange={e => {
                                    const arr = [...stages]; arr[idx].milestone = Number(e.target.value); onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400" />
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">背景色</label>
                                <div className="flex items-center gap-2">
                                    <input type="color" value={stage.bgColor || '#ffffff'} onChange={e => {
                                        const arr = [...stages]; arr[idx].bgColor = e.target.value; onChange(arr);
                                    }} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                                    <input type="text" value={stage.bgColor || '#ffffff'} onChange={e => {
                                        const arr = [...stages]; arr[idx].bgColor = e.target.value; onChange(arr);
                                    }} className="flex-1 border border-stone-200 rounded p-1.5 text-sm outline-none font-mono text-xs uppercase" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">失敗保護 (Protection)</label>
                                <select value={stage.protection || 'none'} onChange={e => {
                                    const arr = [...stages]; arr[idx].protection = e.target.value; onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400">
                                    <option value="none">無保護 (扣血)</option>
                                    <option value="partial">部分保護</option>
                                    <option value="full">完全保護 (不扣血)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                ))}
                {stages.length === 0 && <div className="text-center text-stone-400 py-10 text-sm">目前沒有關卡</div>}
            </div>
        </div>
    );
}

export function ShopItemsEditor({ value, onChange }) {
    const items = Array.isArray(value) ? value : [];

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-stone-700">商城物品列表</span>
                <button onClick={() => onChange([...items, {
                    id: `item_${items.length+1}`, name: '新物品', price: 0, effect: '', description: ''
                }])} className="text-xs flex items-center gap-1 bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-200 font-bold">
                    <Plus size={14}/> 新增物品
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                {items.map((item, idx) => (
                    <div key={idx} className="bg-stone-50 border border-stone-200 rounded-xl p-4 relative">
                        <button onClick={() => {
                            const arr = [...items];
                            arr.splice(idx, 1);
                            onChange(arr);
                        }} className="absolute top-4 right-4 text-stone-400 hover:text-red-500 transition"><Trash2 size={18}/></button>
                        
                        <div className="grid grid-cols-2 gap-3 pr-8">
                            <div className="col-span-2">
                                <label className="text-xs text-stone-500 block mb-1">物品名稱</label>
                                <div className="flex gap-2">
                                    <input type="text" value={item.icon || ''} placeholder="圖示" onChange={e => {
                                        const arr = [...items]; arr[idx].icon = e.target.value; onChange(arr);
                                    }} className="w-12 text-center border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400" />
                                    <input type="text" value={item.name || ''} onChange={e => {
                                        const arr = [...items]; arr[idx].name = e.target.value; onChange(arr);
                                    }} className="flex-1 border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400 font-bold" />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">物品 ID</label>
                                <input type="text" value={item.id || ''} onChange={e => {
                                    const arr = [...items]; arr[idx].id = e.target.value; onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400 font-mono text-xs" />
                            </div>
                            <div>
                                <label className="text-xs text-stone-500 block mb-1">價格 (金幣)</label>
                                <input type="number" value={item.price || 0} onChange={e => {
                                    const arr = [...items]; arr[idx].price = Number(e.target.value); onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-stone-500 block mb-1">效果代碼 (Effect)</label>
                                <input type="text" value={item.effect || ''} onChange={e => {
                                    const arr = [...items]; arr[idx].effect = e.target.value; onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400 font-mono text-xs" placeholder="例如: eliminate_2, heal_1" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-stone-500 block mb-1">敘述</label>
                                <input type="text" value={item.description || ''} onChange={e => {
                                    const arr = [...items]; arr[idx].description = e.target.value; onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400" />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs text-stone-500 block mb-1">最大購買次數 (留空代表無限)</label>
                                <input type="number" value={item.maxPurchase ?? ''} onChange={e => {
                                    const arr = [...items]; 
                                    if(e.target.value === '') delete arr[idx].maxPurchase;
                                    else arr[idx].maxPurchase = Number(e.target.value); 
                                    onChange(arr);
                                }} className="w-full border border-stone-200 rounded p-1.5 text-sm outline-none focus:border-amber-400" />
                            </div>
                        </div>
                    </div>
                ))}
                {items.length === 0 && <div className="text-center text-stone-400 py-10 text-sm col-span-2">目前沒有物品</div>}
            </div>
        </div>
    );
}
