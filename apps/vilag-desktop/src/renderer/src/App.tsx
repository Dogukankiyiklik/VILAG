/**
 * VILAG Desktop - React App
 */
import React, { useState, useEffect, useRef } from 'react';

// Type for the preload API
declare global {
  interface Window {
    vilagAPI: {
      getState: () => Promise<any>;
      onStateUpdate: (callback: (state: any) => void) => void;
      runAgent: () => Promise<void>;
      stopAgent: () => Promise<void>;
      pauseAgent: () => Promise<void>;
      resumeAgent: () => Promise<void>;
      setInstructions: (instructions: string) => Promise<void>;
      clearHistory: () => Promise<void>;
      getSettings: () => Promise<any>;
      updateSettings: (settings: any) => Promise<any>;
    };
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
    language: 'en' as 'en' | 'zh',
    searchEngine: 'google',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen for state updates from main process
  useEffect(() => {
    // Load initial state
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

    // Subscribe to state updates
    window.vilagAPI?.onStateUpdate((state: any) => {
      setStatus(state.status || 'end');
      setThinking(state.thinking || false);
      setMessages(state.messages || []);
      setErrorMsg(state.errorMsg);
    });
  }, []);

  // Auto-scroll messages
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
      case 'running': return { label: 'Running', className: 'running' };
      case 'pause': return { label: 'Paused', className: 'running' };
      case 'error': return { label: 'Error', className: 'error' };
      case 'max_loop': return { label: 'Max Loops', className: 'finished' };
      case 'call_user': return { label: 'Needs Help', className: 'running' };
      default: return { label: 'Idle', className: 'idle' };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="logo">V</div>
          <h1>VILAG</h1>
        </div>

        <div
          className={`nav-item ${page === 'chat' ? 'active' : ''}`}
          onClick={() => setPage('chat')}
        >
          💬 Agent Chat
        </div>
        <div
          className={`nav-item ${page === 'settings' ? 'active' : ''}`}
          onClick={() => setPage('settings')}
        >
          ⚙️ Settings
        </div>

        <div style={{ flex: 1 }} />

        <div className="nav-item" onClick={handleClear} style={{ color: 'var(--text-muted)' }}>
          🗑️ Clear History
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {page === 'chat' ? (
          <div className="chat-panel">
            {/* Header */}
            <div className="chat-header">
              <h2>🤖 GUI Agent</h2>
              <div className={`status-badge ${statusInfo.className}`}>
                <span className="status-dot" />
                {statusInfo.label}
              </div>
            </div>

            {/* Messages */}
            <div className="messages-area">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">🖥️</div>
                  <p>Enter an instruction to start the agent</p>
                  <p style={{ fontSize: '12px' }}>
                    Example: "Go to google.com and search for 'VILAG AI'"
                  </p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div className="message-card" key={i}>
                    {msg.predictionParsed?.map((p: any, j: number) => (
                      <React.Fragment key={j}>
                        {p.thought && (
                          <div className="thought">
                            💭 {p.thought}
                          </div>
                        )}
                        <div className="action">
                          ▶ {p.action_type}({JSON.stringify(p.action_inputs || {})})
                        </div>
                      </React.Fragment>
                    ))}
                    {msg.screenshotBase64 && (
                      <div className="screenshot">
                        <img
                          src={`data:image/jpeg;base64,${msg.screenshotBase64}`}
                          alt={`Step ${i + 1}`}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}

              {errorMsg && (
                <div className="message-card" style={{ borderColor: 'var(--error)' }}>
                  <div style={{ color: 'var(--error)', fontSize: '13px' }}>
                    ❌ Error: {errorMsg}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="input-area">
              <input
                type="text"
                placeholder="Enter an instruction... (e.g., 'Open Teams and send a message')"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !thinking) handleRun();
                }}
                disabled={thinking}
              />
              {thinking ? (
                <button className="btn btn-danger" onClick={handleStop}>
                  ⏹ Stop
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleRun}
                  disabled={!instruction.trim() || !settings.vlmModelName}
                >
                  ▶ Run
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Settings Page */
          <div className="settings-panel">
            <h2>⚙️ Settings</h2>

            <div className="form-section">
              <h3>🔗 VLM Provider (LM Studio)</h3>
              <div className="form-group">
                <label>Base URL</label>
                <input
                  type="text"
                  value={settings.vlmBaseUrl}
                  onChange={(e) => handleSettingsChange('vlmBaseUrl', e.target.value)}
                  placeholder="http://localhost:1234/v1"
                />
                <div className="hint">LM Studio default: http://localhost:1234/v1</div>
              </div>
              <div className="form-group">
                <label>API Key</label>
                <input
                  type="text"
                  value={settings.vlmApiKey}
                  onChange={(e) => handleSettingsChange('vlmApiKey', e.target.value)}
                  placeholder="lm-studio"
                />
                <div className="hint">Use any string for LM Studio (e.g., "lm-studio")</div>
              </div>
              <div className="form-group">
                <label>Model Name</label>
                <input
                  type="text"
                  value={settings.vlmModelName}
                  onChange={(e) => handleSettingsChange('vlmModelName', e.target.value)}
                  placeholder="ui-tars-2b-q4"
                />
                <div className="hint">
                  Enter the model name exactly as shown in LM Studio
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>🤖 Agent Settings</h3>
              <div className="form-group">
                <label>Max Loop Count</label>
                <input
                  type="number"
                  value={settings.maxLoopCount}
                  onChange={(e) =>
                    handleSettingsChange('maxLoopCount', parseInt(e.target.value) || 25)
                  }
                  min={1}
                  max={100}
                />
                <div className="hint">Maximum number of steps the agent can take (default: 25)</div>
              </div>
              <div className="form-group">
                <label>Language</label>
                <select
                  value={settings.language}
                  onChange={(e) => handleSettingsChange('language', e.target.value)}
                >
                  <option value="en">English</option>
                  <option value="zh">Chinese</option>
                </select>
              </div>
              <div className="form-group">
                <label>Default Search Engine</label>
                <select
                  value={settings.searchEngine}
                  onChange={(e) => handleSettingsChange('searchEngine', e.target.value)}
                >
                  <option value="google">Google</option>
                  <option value="bing">Bing</option>
                  <option value="baidu">Baidu</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
