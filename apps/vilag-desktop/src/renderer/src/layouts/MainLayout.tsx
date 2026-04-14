import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Settings, Sun, Moon, Minus, Square, X } from 'lucide-react';

import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@renderer/components/ui/sidebar';

import logo from '../../../../resources/logo/icon-128.png';

declare global {
  interface Window {
    vilagAPI: any;
  }
}

function SidebarBrand() {
  const { state } = useSidebar();
  const isCollapsed = state === 'collapsed';

  return (
    <div className={`flex items-center ${isCollapsed ? 'justify-center py-3' : 'gap-2 px-2 py-3'}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden">
        <img src={logo} alt="VILAG Logo" className="h-full w-full object-cover" />
      </div>
      {!isCollapsed && (
        <div className="flex flex-col overflow-hidden">
          <span className="text-sm font-semibold leading-tight truncate">VILAG</span>
          <span className="text-xs text-muted-foreground truncate">Desktop & Browser Agent</span>
        </div>
      )}
    </div>
  );
}

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === '/' || location.pathname === '';
  const isSettings = location.pathname === '/settings';
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = (localStorage.getItem('vilag-theme') as 'light' | 'dark') || 'light';
    setTheme(stored);
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('vilag-theme', next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">
      {/* Custom Titlebar */}
      <div
        className="flex items-center justify-between h-9 bg-sidebar border-b border-sidebar-border select-none shrink-0 z-10"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center gap-2 px-3">
          <span className="text-xs font-semibold text-sidebar-foreground/60">VILAG</span>
        </div>
        <div
          className="flex items-center h-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <button
            onClick={() => window.vilagAPI?.minimize()}
            className="h-full w-11 flex items-center justify-center hover:bg-sidebar-accent transition-colors"
            title="Minimize"
          >
            <Minus className="h-4 w-4 text-sidebar-foreground/50" />
          </button>
          <button
            onClick={() => window.vilagAPI?.maximize()}
            className="h-full w-11 flex items-center justify-center hover:bg-sidebar-accent transition-colors"
            title="Maximize"
          >
            <Square className="h-3 w-3 text-sidebar-foreground/50" />
          </button>
          <button
            onClick={() => window.vilagAPI?.close()}
            className="h-full w-11 flex items-center justify-center hover:bg-destructive transition-colors group"
            title="Close"
          >
            <X className="h-4 w-4 text-sidebar-foreground/50 group-hover:text-primary-foreground" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <SidebarProvider className="flex flex-1 w-full !min-h-0 bg-background text-foreground overflow-hidden">
        <Sidebar>
          <SidebarHeader>
            <SidebarBrand />
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className="px-1 pt-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isHome}
                  onClick={() => navigate('/')}
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="pb-3">
            <SidebarMenu className="px-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isSettings}
                  onClick={() => navigate('/settings')}
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="sm"
                  onClick={toggleTheme}
                >
                  {theme === 'light' ? (
                    <Moon className="h-4 w-4" />
                  ) : (
                    <Sun className="h-4 w-4" />
                  )}
                  <span>Theme</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="flex-1 flex flex-col min-h-0">
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
