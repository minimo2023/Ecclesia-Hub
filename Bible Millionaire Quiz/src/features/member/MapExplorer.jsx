import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, Search, BookOpen } from 'lucide-react';
// Correct Import
import ContentService from '../../services/ContentService';

// Use relative path for API calls (Vite proxy handles this)
const API_BASE = '/api';

// Book name mapping
const BOOK_ENG_MAPPING = {
    '創世記': 'Gen', '出埃及記': 'Exod', '利未記': 'Lev', '民數記': 'Num', '申命記': 'Deut',
    '約書亞記': 'Josh', '士師記': 'Judg', '路得記': 'Ruth', '撒母耳記上': '1Sam', '撒母耳記下': '2Sam',
    '列王紀上': '1Kgs', '列王紀下': '2Kgs', '歷代志上': '1Chr', '歷代志下': '2Chr', '以斯拉記': 'Ezra',
    '尼希米記': 'Neh', '以斯帖記': 'Esth', '約伯記': 'Job', '詩篇': 'Ps', '箴言': 'Prov',
    '傳道書': 'Eccl', '雅歌': 'Song', '以賽亞書': 'Isa', '耶利米書': 'Jer', '耶利米哀歌': 'Lam',
    '以西結書': 'Ezek', '但以理書': 'Dan', '何西阿書': 'Hos', '約珥書': 'Joel', '阿摩司書': 'Amos',
    '俄巴底亞書': 'Obad', '約拿書': 'Jonah', '彌迦書': 'Mic', '那鴻書': 'Nah', '哈巴谷書': '哈',
    '西番雅書': 'Zeph', '哈該書': 'Hag', '撒迦利亞書': 'Zech', '瑪拉基書': 'Mal', '馬太福音': 'Matt',
    '馬可福音': 'Mark', '路加福音': 'Luke', '約翰福音': 'John', '使徒行傳': 'Acts', '羅馬書': 'Rom',
    '哥林多前書': '1Cor', '哥林多後書': '2Cor', '加拉太書': 'Gal', '以弗所書': 'Eph', '腓立比書': 'Phil',
    '歌羅西書': 'Col', '帖撒羅尼迦前書': '1Thess', '帖撒羅尼迦後書': '2Thess', '提摩太前書': '1Tim', '提摩太後書': '2Tim',
    '提多書': 'Titus', '腓利門書': 'Phlm', '希伯來書': 'Heb', '雅各書': 'Jas', '彼得前書': '1Pet',
    '彼得後書': '2Pet', '約翰一書': '1John', '約翰二書': '2John', '約翰三書': '3John', '猶大書': 'Jude',
    '啟示錄': 'Rev'
};

// Map Controller Component
function MapController({ center }) {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.flyTo(center, 9);
        }
    }, [center, map]);
    return null;
}

// Location Popup Content Component (Simplified - AI Guide removed)
function LocationPopupContent({ location }) {
    return (
        <div className="min-w-[200px]">
            <div className="text-lg font-bold text-stone-800 mb-1 flex items-center gap-2">
                {location.name_chinese || location.name_ch}
                <span className="text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded">{location.location_type || location.type}</span>
            </div>
            <div className="text-sm text-stone-500 mb-2 font-mono">{location.name_english || location.name_en}</div>

            {/* Images Carousel / Preview */}
            {(() => {
                let imgs = [];
                try {
                    if (Array.isArray(location.images)) imgs = location.images;
                    else if (typeof location.images === 'string' && location.images.startsWith('[')) {
                        imgs = JSON.parse(location.images);
                    }
                } catch (e) { console.error('Image parse error', e); }

                if (imgs.length > 0) {
                    return (
                        <div className="mb-3 overflow-hidden rounded-lg shadow-sm border border-stone-200">
                            <img
                                src={imgs[0]}
                                alt={location.name_ch}
                                className="w-full h-32 object-cover hover:scale-105 transition-transform duration-500"
                                onError={(e) => e.target.style.display = 'none'}
                            />
                            {imgs.length > 1 && (
                                <div className="bg-stone-50 text-[10px] text-stone-400 px-2 py-0.5 text-center border-t border-stone-100">
                                    還有 {imgs.length - 1} 張照片
                                </div>
                            )}
                        </div>
                    );
                }
                return null;
            })()}

            {(location.description) && (
                <div className="text-sm text-stone-600 bg-stone-50 p-2 rounded border border-stone-100 leading-relaxed mb-2 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-stone-200">
                    {location.description}
                </div>
            )}

            {location.source && (
                <div className="text-xs text-stone-400 italic">
                    資料來源: {location.source}
                </div>
            )}
        </div>
    );
}

export default function MapExplorer({ onBack }) {
    // State
    const [selectedBookZh, setSelectedBookZh] = useState('使徒行傳');
    const [chapter, setChapter] = useState(13);
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState([]);
    const [mapCenter, setMapCenter] = useState([31.7683, 35.2137]); // Jerusalem
    const [dataSource, setDataSource] = useState('holylight'); // 'holylight' | 'openbible' (AI mode removed)

    const fetchLocations = async (bookZh, chap) => {
        setLoading(true);
        setLocations([]);

        try {
            if (dataSource === 'holylight') {
                // 原生聖光地理資料 (New ContentManager API)
                const response = await ContentService.geography.getLocationsByVerse(bookZh, chap);
                if (response.success && Array.isArray(response.data)) {
                    const parsedData = response.data.map(item => ({
                        ...item,
                        name_chinese: item.name_ch,
                        name_english: item.name_en,
                        points: [[item.lat, item.lon]]
                    }));
                    setLocations(parsedData);
                    if (parsedData.length > 0) setMapCenter(parsedData[0].points[0]);
                }
            } else if (dataSource === 'openbible') {
                // OpenBible Mode (Frontend GeoJSON)
                const bookEng = BOOK_ENG_MAPPING[bookZh];
                if (!bookEng) { alert('Book mapping not found'); return; }

                try {
                    // Try different possible paths for the static file
                    let response = await fetch('/data/places.geojson');
                    if (!response.ok) response = await fetch('/places.geojson');
                    if (!response.ok) throw new Error('Failed to load places.geojson');
                    const geoJson = await response.json();

                    if (geoJson.features && Array.isArray(geoJson.features)) {
                        let searchBook = bookEng;
                        if (/^\d/.test(searchBook) && !searchBook.includes(' ')) {
                            searchBook = searchBook.replace(/^(\d)([A-Za-z]+)/, '$1 $2');
                        }
                        const mapping = { 'Exod': 'Ex', 'Ezek': 'Ezek', 'Deut': 'Deut', 'Phil': 'Phil' };
                        if (mapping[searchBook]) searchBook = mapping[searchBook];

                        const regex = new RegExp(`\\b${searchBook}\\s${chap}:`);
                        const filtered = geoJson.features.filter(f => {
                            const verses = f.properties.verses || '';
                            return regex.test(verses);
                        });

                        const parsedData = filtered.map(f => {
                            const [lng, lat] = f.geometry.coordinates;
                            return {
                                name_chinese: f.properties.name,
                                name_english: f.properties.name,
                                location_type: 'Location',
                                description: f.properties.comment,
                                source: 'OpenBible.info',
                                points: [[lat, lng]]
                            };
                        });

                        setLocations(parsedData);
                        if (parsedData.length > 0) setMapCenter(parsedData[0].points[0]);
                    }
                } catch (err) {
                    console.error('OpenBible fetch error:', err);
                }
            }
        } catch (error) {
            console.error('Failed to fetch locations:', error);
        } finally {
            setLoading(false);
        }
    };

    // Auto-search logic
    useEffect(() => {
        fetchLocations(selectedBookZh, chapter);
    }, [selectedBookZh, chapter, dataSource]);

    const handleSearch = async (e) => {
        const query = e.target.value;
        if (e.key === 'Enter') {
            if (!query.trim()) return;
            setLoading(true);
            try {
                // 原生 SQL 搜尋 (Search by Name)
                const response = await ContentService.geography.searchLocations(query);
                if (response.success && Array.isArray(response.data)) {
                    const parsedData = response.data.map(item => ({
                        ...item,
                        name_chinese: item.name_ch,
                        name_english: item.name_en,
                        points: [[item.lat, item.lon]]
                    }));
                    setLocations(parsedData);
                    if (parsedData.length > 0) {
                        setMapCenter(parsedData[0].points[0]);
                    }
                } else {
                    alert('未找到地點');
                }
            } catch (error) {
                console.error('Search failed:', error);
                alert('搜尋失敗，請稍後再試');
            } finally {
                setLoading(false);
            }
        }
    };

    return (
        <div className="h-full flex flex-col relative" style={{ zIndex: 0 }}>
            {/* Top Bar */}
            <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none">
                <div className="flex gap-2 pointer-events-auto">
                    {/* Source Selector */}
                    <div className="flex bg-white rounded-lg shadow-md p-1">
                        <button
                            onClick={() => setDataSource('holylight')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${dataSource === 'holylight' ? 'bg-amber-100 text-amber-900' : 'text-stone-500 hover:bg-stone-50'}`}
                        >
                            聖光地理
                        </button>

                        <button
                            onClick={() => setDataSource('openbible')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${dataSource === 'openbible' ? 'bg-blue-100 text-blue-900' : 'text-stone-500 hover:bg-stone-50'}`}
                        >
                            OpenBible
                        </button>
                    </div>

                    {/* Book/Chapter Selector */}
                    <div className="flex-1 bg-white rounded-lg shadow-md p-1 flex gap-2 overflow-x-auto">
                        <select
                            value={selectedBookZh}
                            onChange={(e) => {
                                setSelectedBookZh(e.target.value);
                                setChapter(1);
                            }}
                            className="bg-transparent text-sm font-bold text-stone-700 px-2 outline-none cursor-pointer hover:bg-stone-50 rounded"
                        >
                            {Object.keys(BOOK_ENG_MAPPING).map(b => (
                                <option key={b} value={b}>{b}</option>
                            ))}
                        </select>
                        <div className="h-full w-px bg-stone-200"></div>
                        <div className="flex gap-1">
                            {[...Array(28).keys()].map(i => ( // Simplify chapter render for demo
                                <button
                                    key={i + 1}
                                    onClick={() => setChapter(i + 1)}
                                    className={`px-2 py-1 rounded text-sm font-medium transition-colors ${chapter === i + 1 ? 'bg-amber-500 text-white shadow-sm' : 'text-stone-400 hover:bg-stone-100'}`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="pointer-events-auto w-full max-w-sm">
                    <div className="bg-white rounded-lg shadow-lg flex items-center p-2 gap-2 border border-stone-100">
                        <Search className="w-4 h-4 text-stone-400 ml-2" />
                        <input
                            type="text"
                            placeholder="搜尋地名 (如: 耶路撒冷, 伊甸)..."
                            className="flex-1 outline-none text-sm text-stone-700 placeholder:text-stone-300"
                            onKeyDown={handleSearch}
                        />
                    </div>
                </div>
            </div>

            {/* Map Container */}
            <div className="flex-1 relative z-0">
                <MapContainer
                    center={mapCenter}
                    zoom={9}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={false}
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapController center={mapCenter} />

                    {locations.map((loc, idx) => (
                        <Marker
                            key={idx}
                            position={loc.points[0]}
                            icon={createCustomIcon(loc.location_type || 'Location')}
                        >
                            <Popup className="custom-popup" maxWidth={320} minWidth={280}>
                                <LocationPopupContent location={loc} />
                            </Popup>
                        </Marker>
                    ))}
                </MapContainer>
            </div>

            {/* Back Button */}
            <button
                onClick={onBack}
                className="absolute bottom-6 left-6 z-[1000] bg-white p-3 rounded-full shadow-lg text-stone-400 hover:text-stone-600 hover:bg-stone-50 transition-all active:scale-95"
            >
                <ArrowLeft className="w-5 h-5" />
            </button>
        </div>
    );
}

// Icon helper
import L from 'leaflet';
import iconMarker from 'leaflet/dist/images/marker-icon.png';
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const createCustomIcon = (type) => {
    // Default blue marker for now
    return new L.Icon({
        iconUrl: iconMarker,
        iconRetinaUrl: iconRetina,
        shadowUrl: iconShadow,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });
};
