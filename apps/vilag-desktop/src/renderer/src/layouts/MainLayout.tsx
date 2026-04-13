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
} from '@renderer/components/ui/sidebar';

declare global {
  interface Window {
    vilagAPI: any;
  }
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
    <div className="flex flex-col h-screen w-full">
      {/* Custom Titlebar */}
      <div
        className="flex items-center justify-between h-9 bg-sidebar border-b border-sidebar-border select-none shrink-0"
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
      <SidebarProvider className="flex flex-1 w-full bg-background text-foreground overflow-hidden">
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                V
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold leading-tight">VILAG</span>
                <span className="text-xs text-muted-foreground">Desktop Agent</span>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu>
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
          <SidebarFooter>
            <SidebarMenu>
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
        <SidebarInset className="flex-1 flex flex-col">
          <main className="flex-1 overflow-hidden">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
