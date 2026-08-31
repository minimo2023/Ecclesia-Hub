import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Heart, Gamepad2, BookOpen, User } from 'lucide-react';
import { useGuestGameExitGuard } from '../../../../src/features/game/components/shared/useGuestGameExitGuard';

const navItems = [
  { path: '/', label: '首頁', icon: Home },
  { path: '/devotion', label: '靈修', icon: Heart },
  { path: '/games', label: '遊戲', icon: Gamepad2, featured: true },
  { path: '/bible', label: '聖經', icon: BookOpen },
  { path: '/profile', label: '會員', icon: User },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { requestGuestGameExit, guestGameExitDialog } = useGuestGameExitGuard();

  return (
    <>
    <nav className="flex-shrink-0 border-t border-slate-200 bg-white/95 backdrop-blur-xl shadow-[0_-14px_32px_rgba(15,23,42,0.08)] pb-safe">
      <ul className="flex items-center justify-around gap-1 px-3 pt-2 h-[104px]">
        {navItems.map(({ path, label, icon: Icon, featured }) => (
          <li key={path} className="flex-1 h-full">
            <NavLink
              to={path}
              onClick={event => {
                if (location.pathname === '/games' && path !== '/games') {
                  event.preventDefault();
                  requestGuestGameExit(() => navigate(path));
                }
              }}
              className={({ isActive }) => {
                if (featured) {
                  return `flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl transition-all active:scale-95 ${
                    isActive ? 'text-rose-600' : 'text-slate-500'
                  }`;
                }

                return `flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-2xl transition-all active:scale-95 ${
                  isActive ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'
                }`;
              }}
            >
              {({ isActive }) => (
                <>
                  {featured ? (
                    <span
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg transition-all ${
                        isActive
                          ? 'bg-gradient-to-br from-orange-400 via-rose-500 to-fuchsia-600 shadow-rose-500/35 ring-4 ring-rose-100'
                          : 'bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 shadow-orange-500/30'
                      }`}
                    >
                      <Icon className="h-8 w-8" strokeWidth={2.6} />
                    </span>
                  ) : (
                    <Icon
                      className={`h-7 w-7 ${isActive ? 'fill-indigo-100' : ''}`}
                      strokeWidth={isActive ? 2.7 : 2.2}
                    />
                  )}
                  <span
                    className={`text-[11px] font-black tracking-wide ${
                      featured ? 'text-orange-600' : isActive ? 'text-indigo-600' : 'text-slate-500'
                    }`}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
    {guestGameExitDialog}
    </>
  );
}
