/**
 * ResourceBrowser - 經典功能（釋經資源）
 * 提供分類瀏覽聖經資源的功能
 */
import React, { useState, useEffect } from 'react';
import {
    Book,
    ChevronRight,
    Search,
    Filter,
    ArrowLeft,
    Loader2,
    ExternalLink,
    BookOpen,
    Tag
} from 'lucide-react';
import ContentService from '../../services/ContentService';

export default function ResourceBrowser({ onBack }) {
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [resources, setResources] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewingResource, setViewingResource] = useState(null);

    // 初始載入分類
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const response = await ContentService.resources.getCategories();
                if (response.success) {
                    setCategories(response.data);
                }
            } catch (error) {
                console.error('Failed to load categories:', error);
            }
        };
        loadCategories();
    }, []);

    // 當分類改變時載入資源
    useEffect(() => {
        if (selectedCategory) {
            loadResources(selectedCategory.id);
        } else {
            setResources([]);
        }
    }, [selectedCategory]);

    const loadResources = async (categoryId) => {
        setLoading(true);
        try {
            const response = await ContentService.resources.query({ category: categoryId, limit: 100 });
            if (response.success) {
                setResources(response.data);
            }
        } catch (error) {
            console.error('Failed to load resources:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setLoading(true);
        try {
            const response = await ContentService.search.searchLibrary(searchQuery);
            if (response.success) {
                setResources(response.data);
                setSelectedCategory(null);
            }
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleViewResource = async (resource) => {
        setLoading(true);
        try {
            const response = await ContentService.resources.getById(resource.id);
            if (response.success) {
                setViewingResource(response.data);
            }
        } catch (error) {
            console.error('Failed to load resource content:', error);
        } finally {
            setLoading(false);
        }
    };

    if (viewingResource) {
        return (
            <div className="min-h-screen bg-stone-50 flex flex-col">
                <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setViewingResource(null)} className="p-2 hover:bg-stone-100 rounded-full">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <div>
                            <h2 className="text-xl font-bold text-stone-800">{viewingResource.title}</h2>
                            <p className="text-sm text-stone-500">{viewingResource.category_name}</p>
                        </div>
                    </div>
                </div>
                <div className="flex-1 max-w-4xl mx-auto w-full p-6">
                    <div className="bg-white rounded-2xl p-8 shadow-sm border border-stone-100 prose prose-stone max-w-none">
                        <div className="whitespace-pre-wrap leading-relaxed text-stone-700">
                            {viewingResource.content}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-stone-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-stone-200 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 hover:bg-stone-100 rounded-full">
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">
                        經典功能庫
                    </h1>
                </div>

                <form onSubmit={handleSearch} className="flex-1 max-w-md relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                    <input
                        type="text"
                        placeholder="搜尋全書庫資源..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-stone-100 border-none rounded-xl focus:ring-2 focus:ring-blue-500"
                    />
                </form>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Sidebar - Categories */}
                <div className="w-full md:w-64 bg-white border-r border-stone-200 overflow-y-auto">
                    <div className="p-4 border-b border-stone-100 flex items-center gap-2 text-stone-500 font-bold text-sm">
                        <Filter className="w-4 h-4" /> 分類瀏覽
                    </div>
                    <div className="py-2">
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat)}
                                className={`w-full px-4 py-3 flex items-center justify-between hover:bg-stone-50 transition-colors
                                    ${selectedCategory?.id === cat.id ? 'bg-blue-50 text-blue-700 font-bold border-r-4 border-blue-600' : 'text-stone-600'}`}
                            >
                                <span className="truncate">{cat.name}</span>
                                <ChevronRight className={`w-4 h-4 transition-transform ${selectedCategory?.id === cat.id ? 'rotate-90' : ''}`} />
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Content - Resource List */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="h-full flex flex-center flex-col items-center justify-center text-stone-400">
                            <Loader2 className="w-12 h-12 animate-spin mb-4" />
                            <p>載入中...</p>
                        </div>
                    ) : resources.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4">
                            {resources.map((res) => (
                                <div
                                    key={res.id}
                                    onClick={() => handleViewResource(res)}
                                    className="bg-white p-6 rounded-2xl border border-stone-100 shadow-sm hover:shadow-md transition-all cursor-pointer group"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded uppercase">
                                                    {res.category_name}
                                                </span>
                                                {res.related_books && (
                                                    <span className="flex items-center gap-1 text-[10px] text-stone-400">
                                                        <BookOpen className="w-3 h-3" /> {res.related_books}
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="text-lg font-bold text-stone-800 group-hover:text-blue-700 transition-colors mb-2">
                                                {res.title}
                                            </h3>
                                            <p className="text-sm text-stone-500 line-clamp-2 leading-relaxed">
                                                {res.metadata?.description || '點擊查看全文內容...'}
                                            </p>
                                        </div>
                                        <div className="ml-4 p-2 bg-stone-50 rounded-lg group-hover:bg-blue-50 transition-colors">
                                            <ExternalLink className="w-5 h-5 text-stone-300 group-hover:text-blue-500" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-stone-400 text-center py-20">
                            <Book className="w-16 h-16 mb-4 opacity-20" />
                            <h3 className="text-xl font-bold mb-1">尚未選擇資源</h3>
                            <p>請從左側選擇分類，或使用上方搜尋框</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
