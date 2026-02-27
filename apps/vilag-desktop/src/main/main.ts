/**
 * VILAG Desktop - Electron Main Process
 */
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { join } from 'path';
import { GUIAgent } from '@vilag/sdk';
import { DefaultBrowserOperator } from '@vilag/browser-operator';
import { createLogger } from '@vilag/logger';
import { StatusEnum } from '@vilag/shared/types';
import { NutJSElectronOperator } from './agent/operator';
import {
  showWidgetWindow,
  hideWidgetWindow,
  showScreenWaterFlow,
  hideScreenWaterFlow,
  closeScreenMarker,
} from './window/ScreenMarker';

const logger = createLogger('Main');
const isDev = !app.isPackaged;

// ===== App State =====
type OperatorMode = 'browser' | 'computer';

interface AppState {
  instructions: string | null;
  status: string;
  errorMsg: string | null;
  messages: any[];
  thinking: boolean;
  abortController: AbortController | null;
  settings: {
    vlmBaseUrl: string;
    vlmApiKey: string;
    vlmModelName: string;
    maxLoopCount: number;
    language: 'en' | 'tr';
    searchEngine: string;
    operator: OperatorMode;
  };
  operator: OperatorMode;
}

let appState: AppState = {
  instructions: null,
  status: StatusEnum.END,
  errorMsg: null,
  messages: [],
  thinking: false,
  abortController: null,
  settings: {
    vlmBaseUrl: 'http://localhost:1234/v1',
    vlmApiKey: 'lm-studio',
    vlmModelName: '',
    maxLoopCount: 25,
    language: 'en',
    searchEngine: 'google',
    operator: 'browser',
  },
  operator: 'browser',
};

let mainWindow: BrowserWindow | null = null;
let currentAgent: GUIAgent<any> | null = null;

function createMainWindow(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  const win = new BrowserWindow({
    width: Math.min(1200, width),
    height: Math.min(800, height),
    minWidth: 800,
    minHeight: 600,
    title: 'VILAG - GUI Agent',
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // Load renderer
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ===== IPC Handlers =====
function registerIpcHandlers(): void {
  // Get current state
  ipcMain.handle('getState', () => {
    return { ...appState, abortController: undefined };
  });

  // Update settings
  ipcMain.handle('updateSettings', (_event, settings) => {
    appState.settings = { ...appState.settings, ...settings };
    if (settings.operator) {
      appState.operator = settings.operator as OperatorMode;
    }
    broadcastState();
    return appState.settings;
  });

  // Get settings
  ipcMain.handle('getSettings', () => {
    return appState.settings;
  });

  // Set instructions
  ipcMain.handle('setInstructions', (_event, instructions: string) => {
    appState.instructions = instructions;
  });

  // Run agent
  ipcMain.handle('runAgent', async () => {
    if (appState.thinking) return;

    appState.thinking = true;
    appState.abortController = new AbortController();
    appState.errorMsg = null;
    appState.status = StatusEnum.RUNNING;
    broadcastState();

    try {
      await runAgent();
    } catch (e: any) {
      logger.error('[runAgent error]', e);
      appState.status = StatusEnum.ERROR;
      appState.errorMsg = e.message;
    } finally {
      appState.thinking = false;
      broadcastState();
    }
  });

  // Stop agent
  ipcMain.handle('stopAgent', () => {
    appState.abortController?.abort();
    if (currentAgent) {
      currentAgent.resume();
      currentAgent.stop();
    }
    appState.status = StatusEnum.END;
    appState.thinking = false;
    broadcastState();
  });

  // Pause agent
  ipcMain.handle('pauseAgent', () => {
    if (currentAgent) {
      currentAgent.pause();
      appState.thinking = false;
      broadcastState();
    }
  });

  // Resume agent
  ipcMain.handle('resumeAgent', () => {
    if (currentAgent) {
      currentAgent.resume();
      appState.thinking = true;
      broadcastState();
    }
  });

  // Clear history
  ipcMain.handle('clearHistory', () => {
    appState.messages = [];
    appState.status = StatusEnum.END;
    appState.errorMsg = null;
    appState.instructions = '';
    broadcastState();
  });

  // Window controls
  ipcMain.on('window:minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow?.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('window:close', () => {
    mainWindow?.close();
  });
}

// ===== Agent Runner =====
async function runAgent(): Promise<void> {
  const { instructions, settings, operator } = appState;
  if (!instructions) throw new Error('Instructions are required');

  logger.info('[runAgent] Starting with:', instructions);

  const mode: OperatorMode = operator || 'browser';

  beforeAgentRun(mode);

  try {
    // Destroy previous browser instance to ensure fresh page
    if (mode === 'browser') {
      await DefaultBrowserOperator.destroyInstance();
    }

    // Create operator based on mode
    const operatorInstance =
      mode === 'browser'
        ? await DefaultBrowserOperator.getInstance(
            settings.searchEngine as any,
          )
        : new NutJSElectronOperator();

    // Build system prompt
    const systemPrompt = buildSystemPrompt(settings.language);

    // Create agent
    const agent = new GUIAgent({
      model: {
        baseURL: settings.vlmBaseUrl,
        apiKey: settings.vlmApiKey,
        model: settings.vlmModelName,
      },
      systemPrompt,
      operator: operatorInstance,
      signal: appState.abortController?.signal,
      logger,
      maxLoopCount: settings.maxLoopCount,
      onData: ({ data }) => {
        const { status, conversations } = data;
        logger.info(
          '[onData] status:',
          status,
          'conversations:',
          conversations.length,
        );
        appState.status = status;
        appState.messages = [...appState.messages, ...conversations];
        broadcastState();
      },
      onError: ({ error }) => {
        logger.error('[onError]', error);
        appState.status = StatusEnum.ERROR;
        appState.errorMsg = error?.message || 'Unknown error';
        broadcastState();
      },
      retry: {
        model: { maxRetries: 3 },
        screenshot: { maxRetries: 3 },
        execute: { maxRetries: 1 },
      },
    });

    currentAgent = agent;
    await agent.run(instructions);
    currentAgent = null;
  } finally {
    afterAgentRun(mode);
  }
}

function beforeAgentRun(operator: OperatorMode): void {
  switch (operator) {
    case 'computer':
      hideMainWindow();
      showWidgetWindow();
      showScreenWaterFlow();
      break;
    case 'browser':
    default:
      hideMainWindow();
      showWidgetWindow();
      break;
  }
}

function afterAgentRun(operator: OperatorMode): void {
  switch (operator) {
    case 'computer':
      hideWidgetWindow();
      closeScreenMarker();
      hideScreenWaterFlow();
      showMainWindow();
      break;
    case 'browser':
    default:
      hideWidgetWindow();
      showMainWindow();
      break;
  }
}

function buildSystemPrompt(language: 'en' | 'tr'): string {
  return `You are a GUI agent. You are given a task and your action history, with screenshots. You need to perform the next action to complete the task.

## Output Format
\`\`\`
Thought: ...
Action: ...
\`\`\`

## Action Space

click(start_box='<|box_start|>(x1,y1)<|box_end|>')
left_double(start_box='<|box_start|>(x1,y1)<|box_end|>')
right_single(start_box='<|box_start|>(x1,y1)<|box_end|>')
drag(start_box='<|box_start|>(x1,y1)<|box_end|>', end_box='<|box_start|>(x3,y3)<|box_end|>')
hotkey(key='ctrl c') # Split keys with a space and use lowercase.
type(content='xxx') # Use escape characters \\', \\", and \\n in content part.
scroll(start_box='<|box_start|>(x1,y1)<|box_end|>', direction='down or up or right or left')
navigate(content='xxx') # The content is the target URL
navigate_back() # Go back to the previous page
wait() # Sleep for 5s and take a screenshot to check for any changes.
finished()
call_user() # Call the user when the task is unsolvable.

## Note
- Use ${language === 'tr' ? 'Turkish' : 'English'} in \`Thought\` part.
- Write a small plan and finally summarize your next action in one sentence in \`Thought\` part.

## User Instruction
`;
}

function broadcastState(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stateUpdate', {
      ...appState,
      abortController: undefined,
    });
  }
}

// ===== App Lifecycle =====
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.vilag.agent');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerIpcHandlers();
  mainWindow = createMainWindow();

  logger.info('VILAG Desktop started');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
  }
});
