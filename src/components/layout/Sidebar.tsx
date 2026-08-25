import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  Leaf,
  Settings,
  LogOut,
  Wind,
  X,
  Menu,
} from 'lucide-react';
import { cn } from '../ui/Button';
import { useAuth } from '../../context/AuthContext';

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'AI Assistant', href: '/ai', icon: MessageSquare },
  { name: 'Predictions', href: '/predictions', icon: TrendingUp },
  { name: 'Carbon Footprint', href: '/carbon', icon: Leaf },
  { name: 'Settings', href: '/settings', icon: Settings },
];

function NavItem({
  name,
  href,
  icon: Icon,
  onClick,
}: {
  name: string;
  href: string;
  icon: React.ElementType;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={href}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-brand-50 text-brand-700 shadow-sm'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              'h-5 w-5 flex-shrink-0 transition-colors',
              isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'
            )}
          />
          {name}
          {isActive && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-500" />
          )}
        </>
      )}
    </NavLink>
  );
}

interface SidebarProps {
  onClose?: () => void;
}

export default function Sidebar({ onClose }: SidebarProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const initials = (user?.name || user?.email || 'U')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const displayName = user?.name || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || '';

  return (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-sm">
            <Wind className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 leading-tight">AirGuard AI</div>
            <div className="text-xs text-slate-400 leading-tight">Air Intelligence</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1 rounded-lg hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="mb-2 px-3 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Main Menu
          </p>
        </div>
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} onClick={onClose} />
        ))}
      </nav>

      {/* User & Logout */}
      <div className="border-t border-slate-100 p-3 space-y-1">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-800 truncate">{displayName}</div>
            <div className="text-xs text-slate-400 truncate">{displayEmail}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          Logout
        </button>
      </div>
    </div>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100"
    >
      <Menu className="h-5 w-5" />
    </button>
  );
}
