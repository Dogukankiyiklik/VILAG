/**
 * VILAG Desktop - React App UI-TARS Style
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Settings,
  Trash2,
  Play,
  Square,
  Globe,
  Monitor,
  Cpu,
  Bot,
  AlertCircle,
  Sun,
  Moon,
  ChevronRight,
  Terminal
} from 'lucide-react';

declare global {
  interface Window {
    vilagAPI: any;
  }
}

type Page = 'chat' | 'settings';

export default function App() {
  const [page, setPage] = useState<Page>('chat');
  const [status, setStatus] = useState('end');
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [settings, setSettings] = useState({
    vlmBaseUrl: 'http://localhost:1234/v1',
    vlmApiKey: 'lm-studio',
    vlmModelName: '',
    maxLoopCount: 25,
    language: 'en' as 'en' | 'tr',
    searchEngine: 'google',
  });
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('vilag-theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.setAttribute('data-theme', savedTheme);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('vilag-theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.vilagAPI?.getState().then((state: any) => {
      if (state) {
        setStatus(state.status || 'end');
        setThinking(state.thinking || false);
        setMessages(state.messages || []);
        setErrorMsg(state.errorMsg);
      }
    });

    window.vilagAPI?.getSettings().then((s: any) => {
      if (s) setSettings(s);
    });

    window.vilagAPI?.onStateUpdate((state: any) => {
      setStatus(state.status || 'end');
      setThinking(state.thinking || false);
      setMessages(state.messages || []);
      setErrorMsg(state.errorMsg);
    });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleRun = async () => {
    if (!instruction.trim()) return;
    await window.vilagAPI?.setInstructions(instruction.trim());
    await window.vilagAPI?.runAgent();
  };

  const handleStop = async () => {
    await window.vilagAPI?.stopAgent();
  };

  const handleClear = async () => {
    await window.vilagAPI?.clearHistory();
    setMessages([]);
    setInstruction('');
  };

  const handleSettingsChange = async (key: string, value: any) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await window.vilagAPI?.updateSettings(updated);
  };

  const getStatusInfo = () => {
    switch (status) {
      case 'running': return { label: 'Agent works', className: 'status-running' };
      case 'pause': return { label: 'Paused', className: 'status-running' };
      case 'error': return { label: 'Error', className: 'status-error' };
      case 'max_loop': return { label: 'Max Loops', className: 'status-finished' };
      case 'call_user': return { label: 'Needs Intervention', className: 'status-error' };
      default: return { label: 'Idle', className: 'status-idle' };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="brand">
          <div className="brand-logo">
            <Monitor size={20} />
          </div>
          <div className="brand-title">VILAG</div>
        </div>

        <div className="nav-menu">
          <div
            className={`nav-item ${page === 'chat' ? 'active' : ''}`}
            onClick={() => setPage('chat')}
          >
            <MessageSquare size={18} />
            <span>Chat</span>
          </div>
          <div
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => setPage('settings')}
          >
            <Settings size={18} />
            <span>Settings</span>
          </div>
        </div>

        <div className="nav-menu" style={{ marginTop: 'auto' }}>
          <div className="nav-item" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </div>
          <div className="nav-item danger" onClick={handleClear}>
            <Trash2 size={18} />
            <span>Clear History</span>
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="main-area">
        {/* Topbar (Draggable) */}
        <div className="topbar" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="topbar-title">
            <Bot size={18} />
            {page === 'chat' ? 'UI Tasks' : 'Preferences'}
          </div>
          
          <div className="topbar-right">
            <div className={`status-badge ${statusInfo.className}`} style={{ WebkitAppRegion: 'no-drag' } as any}>
              <span className="status-dot" />
              {statusInfo.label}
            </div>
            
            <div className="window-controls" style={{ WebkitAppRegion: 'no-drag' } as any}>
              <button className="win-btn" onClick={() => window.vilagAPI?.minimize()}>─</button>
              <button className="win-btn" onClick={() => window.vilagAPI?.maximize()}>□</button>
              <button className="win-btn close" onClick={() => window.vilagAPI?.close()}>✕</button>
            </div>
          </div>
        </div>

        {page === 'chat' ? (
          <>
            <div className="chat-container">
              {messages.length === 0 ? (
                <div className="welcome-screen">
                  <div className="welcome-icon">
                    <Monitor size={32} />
                  </div>
                  <h2>What would you like me to do?</h2>
                  <p>I can control the browser, click on elements, fill forms, and navigate pages for you. Just tell me what you need.</p>
                </div>
              ) : (
                <div className="message-row">
                  <div className="msg-user">
                    {instruction}
                  </div>
                  
                  {messages.map((msg, i) => (
                    <div className="msg-agent" key={i}>
                      <div className="agent-avatar">
                        <Bot size={18} color="var(--text-main)" />
                      </div>
                      
                      <div className="agent-content">
                        {msg.predictionParsed?.map((p: any, j: number) => (
                          <React.Fragment key={j}>
                            {p.thought && (
                              <div className="thought-box">
                                {p.thought}
                              </div>
                            )}
                            <div className="action-box">
                              <Terminal size={14} className="action-icon" />
                              <div>
                                <span style={{ color: 'var(--text-main)' }}>{p.action_type}</span>
                                ({JSON.stringify(p.action_inputs || {})})
                              </div>
                            </div>
                          </React.Fragment>
                        ))}
                        
                        {msg.screenshotBase64 && (
                          <div className="screenshot-box">
                            <img
                              src={`data:image/jpeg;base64,${msg.screenshotBase64}`}
                              alt={`Agent Vision ${i + 1}`}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {errorMsg && (
                    <div className="msg-agent">
                      <div className="agent-avatar" style={{ background: 'var(--error-bg)', color: 'var(--error)' }}>
                        <AlertCircle size={18} />
                      </div>
                      <div className="agent-content">
                        <div className="action-box" style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>
                          I encountered an error: {errorMsg}
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input Bar Fixed Bottom */}
            <div className="input-container">
              <div className="input-wrapper">
                <ChevronRight size={20} color="var(--text-muted)" style={{ marginLeft: '4px' }} />
                <input
                  type="text"
                  className="main-input"
                  placeholder="Ask me to click something or go to a website..."
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !thinking) handleRun();
                  }}
                  disabled={thinking}
                />
                
                {thinking ? (
                  <button className="btn btn-danger" onClick={handleStop}>
                    <Square size={14} fill="currentColor" /> Stop
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={handleRun}
                    disabled={!instruction.trim() || !settings.vlmModelName}
                  >
                    <Play size={14} fill="currentColor" /> Run
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="settings-container">
            <div className="settings-header">
              <h2>Agent Preferences</h2>
              <p>Configure your model endpoints, API keys, and behavioral parameters.</p>
            </div>

            <div className="settings-card">
              <h3><Cpu size={18} /> Model Configuration (LM Studio)</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>API Base URL</label>
                  <input
                    className="form-input"
                    type="text"
                    value={settings.vlmBaseUrl}
                    onChange={(e) => handleSettingsChange('vlmBaseUrl', e.target.value)}
                    placeholder="http://localhost:1234/v1"
                  />
                  <span className="form-hint">Default is http://localhost:1234/v1</span>
                </div>
                <div className="form-group">
                  <label>API Key</label>
                  <input
                    className="form-input"
                    type="text"
                    value={settings.vlmApiKey}
                    onChange={(e) => handleSettingsChange('vlmApiKey', e.target.value)}
                    placeholder="lm-studio"
                  />
                </div>
                <div className="form-group">
                  <label>Model Name</label>
                  <input
                    className="form-input"
                    type="text"
                    value={settings.vlmModelName}
                    onChange={(e) => handleSettingsChange('vlmModelName', e.target.value)}
                    placeholder="Enter model name (e.g., ui-tars-2b-q4)"
                  />
                  <span className="form-hint">Required. Must exactly match your active model name.</span>
                </div>
              </div>
            </div>

            <div className="settings-card">
              <h3><Globe size={18} /> Browser Controls</h3>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="form-group">
                  <label>Max Execution Steps</label>
                  <input
                    className="form-input"
                    type="number"
                    value={settings.maxLoopCount}
                    onChange={(e) =>
                      handleSettingsChange('maxLoopCount', parseInt(e.target.value) || 25)
                    }
                    min={1}
                    max={100}
                  />
                </div>
                <div className="form-group">
                  <label>Default Search Engine</label>
                  <select
                    className="form-select"
                    value={settings.searchEngine}
                    onChange={(e) => handleSettingsChange('searchEngine', e.target.value)}
                  >
                    <option value="google">Google</option>
                    <option value="bing">Bing</option>
                    <option value="baidu">Baidu</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Agent Instruction Language</label>
                  <select
                    className="form-select"
                    value={settings.language}
                    onChange={(e) => handleSettingsChange('language', e.target.value)}
                  >
                    <option value="en">English (Default)</option>
                    <option value="tr">Türkçe</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
