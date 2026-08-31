import React from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';

// 既有模組
import DashboardModule from './modules/DashboardModule';
import KnowledgeModule from './modules/KnowledgeModule';
import BIUsersGovernanceModule from './modules/BIUsersGovernanceModule';
import EconomyModule from './modules/EconomyModule';
import FeedbackModule from './modules/FeedbackModule';
import ExpeditionModule from './modules/ExpeditionModule';
import SettingsModule from './modules/SettingsModule';
import AuditModule from './modules/AuditModule';
import AIGovModule from './modules/AIGovModule';

// 新建模組
import DevotionModule from './modules/DevotionModule';
import PatrolModule from './modules/PatrolModule';

function AdminLayoutWrapper({ children, onLogout }) {
    const navigate = useNavigate();
    const location = useLocation();
    const currentView = location.pathname.substring(1) || 'dashboard';

    return (
        <AdminLayout
            currentView={currentView}
            onNavigate={(view) => navigate(`/${view}`)}
            onLogout={onLogout}
        >
            {children}
        </AdminLayout>
    );
}

export default function AdminPanel({ onLogout }) {
    return (
        <HashRouter>
            <AdminLayoutWrapper onLogout={onLogout}>
                <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />

                    {/* 指揮艦橋 */}
                    <Route path="/dashboard" element={<DashboardModule />} />

                    {/* 資料庫主權 */}
                    <Route path="/content"   element={<KnowledgeModule />} />
                    <Route path="/users"     element={<BIUsersGovernanceModule />} />
                    <Route path="/devotions" element={<DevotionModule />} />

                    {/* 成本主權 */}
                    <Route path="/economy"  element={<EconomyModule />} />
                    <Route path="/ai-gov"   element={<AIGovModule />} />

                    {/* 遊戲主權 */}
                    <Route path="/expedition"  element={<ExpeditionModule />} />
                    <Route path="/patrol"      element={<PatrolModule />} />

                    {/* 其他 */}
                    <Route path="/support" element={<FeedbackModule />} />
                    <Route path="/audit"   element={<AuditModule />} />
                    <Route path="/system"  element={<SettingsModule />} />

                    {/* 舊路由兼容 */}
                    <Route path="/knowledge" element={<Navigate to="/content" replace />} />

                    {/* Catch-all */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </AdminLayoutWrapper>
        </HashRouter>
    );
}
