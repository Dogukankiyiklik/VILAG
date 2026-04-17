import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Settings, Sun, Moon, Minus, Square, X, History, Trash2, PanelLeftClose, PanelLeft } from 'lucide-react';

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
import { Button } from '@renderer/components/ui/button';
import { ScrollArea } from '@renderer/components/ui/scroll-area';

import logo from '../../../../resources/logo/icon-128.png';

declare global {
  interface Window {
    vilagAPI: any;
  }
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
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

function SidebarToggleBar() {
  const { state, toggleSidebar } = useSidebar();
  return (
    <div className="flex items-center h-10 px-3 shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={toggleSidebar}
        title={state === 'expanded' ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {state === 'expanded' ? (
          <PanelLeftClose className="h-4 w-4" />
        ) : (
          <PanelLeft className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}

function HistoryPanel({
  open,
  onClose,
  sessions,
  currentSessionId,
  isLocal,
  onSelect,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  isLocal: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const formatTime = (ts: number) => {
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return '--:--';
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '--:--';
    }
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-background/50 backdrop-blur-[2px]"
          onClick={onClose}
        />
      )}
      <div
        className={`fixed top-0 left-0 z-40 h-full w-72 bg-card border-r border-border shadow-lg flex flex-col transition-transform duration-200 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <History className="h-4 w-4 text-muted-foreground" />
            Chat history
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {sessions.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No sessions yet.
              </div>
            )}
            {sessions.map((session) => {
              const isActive = isLocal && currentSessionId === session.id;
              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-1 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-foreground'
                      : 'hover:bg-accent text-foreground'
                  }`}
                >
                  <button
                    className="flex flex-1 items-center gap-2.5 px-3 py-2.5 min-w-0 text-left"
                    onClick={() => {
                      onSelect(session.id);
                      onClose();
                    }}
                  >
                    <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-medium truncate">
                        {session.title || 'New Chat'}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(session.updatedAt)}
                      </span>
                    </div>
                  </button>
                  <button
                    className="mr-2 hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex transition-colors"
                    title="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(session.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === '/' || location.pathname === '';
  const isSettings = location.pathname === '/settings';
  const isLocal = location.pathname === '/local';
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem('vilag-theme') as 'light' | 'dark') || 'light';
    setTheme(stored);
    if (stored === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  useEffect(() => {
    window.vilagAPI?.getState().then((state: any) => {
      if (!state) return;
      setSessions(state.sessions || []);
      setCurrentSessionId(state.currentSessionId || null);
    });

    window.vilagAPI?.onStateUpdate((state: any) => {
      setSessions(state.sessions || []);
      setCurrentSessionId(state.currentSessionId || null);
    });
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

  const handleSessionSelect = async (sessionId: string) => {
    await window.vilagAPI?.selectSession(sessionId);
    navigate('/local');
  };

  const handleSessionDelete = async (sessionId: string) => {
    await window.vilagAPI?.deleteSession(sessionId);
    if (location.pathname !== '/local') {
      navigate('/local');
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
        <Sidebar className="transition-[width] duration-200">
          <SidebarHeader>
            <SidebarBrand />
          </SidebarHeader>
          <SidebarContent>
            <SidebarMenu className="px-1 pt-1">
              <SidebarMenuItem>
                <SidebarMenuButton isActive={isHome} onClick={() => navigate('/')}>
                  <MessageSquare className="h-4 w-4" />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setHistoryOpen(true)} title="Chat history">
                  <History className="h-4 w-4" />
                  <span>History</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="pb-3">
            <SidebarMenu className="px-1">
              <SidebarMenuItem>
                <SidebarMenuButton isActive={isSettings} onClick={() => navigate('/settings')}>
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton size="sm" onClick={toggleTheme}>
                  {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  <span>Theme</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="flex-1 flex flex-col min-h-0">
          {/* Global sidebar toggle — her sayfada görünür */}
          <SidebarToggleBar />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        isLocal={isLocal}
        onSelect={handleSessionSelect}
        onDelete={handleSessionDelete}
      />
    </div>
  );
}
