import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { useAuth } from '../../../contexts/AuthContext';
import { BarChart3, AlertTriangle, Clock, ArrowRight } from 'lucide-react';

export default function BookOverviewTab({ onSwitchToBook }) {
    const { getToken } = useAuth();
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortField, setSortField] = useState('count'); // 'count', 'suspected', 'last_added', 'book'
    const [sortDirection, setSortDirection] = useState('desc');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const token = getToken();
            console.log('BookOverview: Loading data...', { API_BASE_URL, hasToken: !!token });

            const res = await fetch(`${API_BASE_URL}/api/admin/books/overview-stats`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });

            console.log('BookOverview: Response status:', res.status);

            if (res.ok) {
                const data = await res.json();
                console.log('BookOverview: Data received:', data);
                if (data.success && data.books) {
                    setBooks(data.books);
                }
            } else {
                const text = await res.text();
                console.error('BookOverview: Fetch failed', text);
            }
        } catch (error) {
            console.error('Failed to load book stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc'); // Default desc for stats
        }
    };

    const getSortedBooks = () => {
        return [...books].sort((a, b) => {
            let valA = a[sortField];
            let valB = b[sortField];

            // Handle numeric vs string
            if (sortField === 'book') {
                return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }

            if (sortField === 'last_added') {
                // last_added timestamp
                valA = a.last_added || 0;
                valB = b.last_added || 0;
            }

            return sortDirection === 'asc' ? valA - valB : valB - valA;
        });
    };

    const sortedData = getSortedBooks();

    if (loading) {
        return <div className="p-12 text-center text-stone-400">載入書卷數據中...</div>;
    }

    return (
        <div className="bg-white border border-stone-200 rounded-lg overflow-hidden shadow-sm">
            <div className="p-4 bg-stone-50 border-b border-stone-200 flex justify-between items-center">
                <h3 className="font-bold text-stone-700 flex items-center gap-2">
                    <BarChart3 size={18} />
                    書卷出題總覽
                </h3>
                <span className="text-sm text-stone-500">共 {books.length} 卷書有資料</span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-stone-50 text-stone-600 text-left border-b border-stone-200">
                        <tr>
                            <th
                                className="px-4 py-3 font-semibold cursor-pointer hover:bg-stone-100 transition-colors"
                                onClick={() => handleSort('book')}
                            >
                                書卷 {sortField === 'book' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                                className="px-4 py-3 font-semibold cursor-pointer hover:bg-stone-100 transition-colors text-center w-24"
                                onClick={() => handleSort('count')}
                            >
                                總題數 {sortField === 'count' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-4 py-3 font-semibold text-center hidden md:table-cell">
                                難度分布 (簡/中/難/獄)
                            </th>
                            <th
                                className="px-4 py-3 font-semibold cursor-pointer hover:bg-stone-100 transition-colors text-center w-24 text-amber-600"
                                onClick={() => handleSort('suspected')}
                            >
                                ⚠️ 可疑 {sortField === 'suspected' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                                className="px-4 py-3 font-semibold cursor-pointer hover:bg-stone-100 transition-colors text-right w-32"
                                onClick={() => handleSort('last_added')}
                            >
                                最近新增 {sortField === 'last_added' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-4 py-3 w-16"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                        {sortedData.map((row) => (
                            <tr
                                key={row.book}
                                className="hover:bg-blue-50 transition-colors cursor-pointer group"
                                onClick={() => onSwitchToBook(row.book)}
                            >
                                <td className="px-4 py-3 font-medium text-stone-800">{row.book}</td>
                                <td className="px-4 py-3 text-center font-bold text-stone-700">{row.count}</td>
                                <td className="px-4 py-3 hidden md:table-cell">
                                    <div className="flex items-center justify-center gap-1 text-xs text-stone-500">
                                        <span className="text-green-600 font-medium px-1 bg-green-50 rounded">{row.easy}</span>
                                        <span className="text-stone-300">/</span>
                                        <span className="text-blue-600 font-medium px-1 bg-blue-50 rounded">{row.medium}</span>
                                        <span className="text-stone-300">/</span>
                                        <span className="text-orange-600 font-medium px-1 bg-orange-50 rounded">{row.hard}</span>
                                        <span className="text-stone-300">/</span>
                                        <span className="text-red-600 font-medium px-1 bg-red-50 rounded">{row.very_hard}</span>
                                    </div>
                                    {/* Mini Bar */}
                                    <div className="flex h-1 mt-1.5 w-full max-w-[140px] mx-auto rounded-full overflow-hidden bg-stone-100">
                                        <div style={{ width: `${(row.easy / row.count) * 100}%` }} className="bg-green-400" />
                                        <div style={{ width: `${(row.medium / row.count) * 100}%` }} className="bg-blue-400" />
                                        <div style={{ width: `${(row.hard / row.count) * 100}%` }} className="bg-orange-400" />
                                        <div style={{ width: `${(row.very_hard / row.count) * 100}%` }} className="bg-red-400" />
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    {row.suspected > 0 ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold">
                                            <AlertTriangle size={12} />
                                            {row.suspected}
                                        </span>
                                    ) : (
                                        <span className="text-stone-300">-</span>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right text-stone-500 text-xs font-mono">
                                    {row.lastAddedText}
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <ArrowRight size={16} className="text-stone-300 group-hover:text-blue-500 transition-colors" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
