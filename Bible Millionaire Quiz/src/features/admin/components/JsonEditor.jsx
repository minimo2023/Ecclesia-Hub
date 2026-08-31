import React from 'react';

// A simple recursive JSON editor
export function JsonObjectEditor({ value, onChange, label }) {
    if (typeof value !== 'object' || value === null) {
        return (
            <div className="flex flex-col mb-2">
                <span className="text-xs text-stone-500 mb-1">{label}</span>
                <input
                    type={typeof value === 'number' ? 'number' : 'text'}
                    value={value}
                    onChange={e => {
                        const val = e.target.value;
                        onChange(typeof value === 'number' ? Number(val) : val);
                    }}
                    className="border border-stone-200 rounded px-2 py-1 text-sm outline-none focus:border-amber-400"
                />
            </div>
        );
    }

    if (Array.isArray(value)) {
        return (
            <div className="border border-stone-200 rounded-lg p-3 bg-stone-50/50 mb-3 space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-stone-700">{label}</span>
                    <button
                        onClick={() => {
                            const newItem = value.length > 0 ? JSON.parse(JSON.stringify(value[0])) : '';
                            onChange([...value, newItem]);
                        }}
                        className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded hover:bg-amber-200 transition"
                    >
                        + 新增一筆
                    </button>
                </div>
                {value.map((item, idx) => (
                    <div key={idx} className="bg-white p-3 border border-stone-200 rounded-lg relative">
                        <button
                            onClick={() => {
                                const newArr = [...value];
                                newArr.splice(idx, 1);
                                onChange(newArr);
                            }}
                            className="absolute top-2 right-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded"
                        >
                            刪除
                        </button>
                        <JsonObjectEditor
                            value={item}
                            label={`[項目 ${idx + 1}]`}
                            onChange={(newVal) => {
                                const newArr = [...value];
                                newArr[idx] = newVal;
                                onChange(newArr);
                            }}
                        />
                    </div>
                ))}
                {value.length === 0 && <p className="text-xs text-stone-400">目前沒有資料</p>}
            </div>
        );
    }

    // Object
    return (
        <div className="border border-stone-200 rounded-lg p-3 bg-stone-50/50 mb-3 space-y-2">
            <span className="text-sm font-bold text-stone-700 block mb-2">{label}</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2">
                {Object.keys(value).map(k => (
                    <div key={k}>
                        <JsonObjectEditor
                            value={value[k]}
                            label={k}
                            onChange={(newVal) => {
                                onChange({ ...value, [k]: newVal });
                            }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
