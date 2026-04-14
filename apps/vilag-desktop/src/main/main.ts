/**
 * VILAG Desktop - Electron Ana Süreci (Main Process)
 */
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { join } from 'path';
import { GUIAgent } from '@vilag/sdk';
import { DefaultBrowserOperator } from '@vilag/browser-operator';
import { createLogger, createSessionLogger, type SessionLogger } from '@vilag/logger';
import { StatusEnum } from '@vilag/shared/types';
import type { StepLogData } from '@vilag/shared/types';
import { NutJSElectronOperator } from './agent/operator';
import { createRetriever, injectScenario } from '@vilag/rag';
import { Planner, PlanExecutor } from '@vilag/planner';
import type { Subtask } from '@vilag/planner';
import { ApprovalManager } from '@vilag/hitl';
import {
  showWidgetWindow,
  hideWidgetWindow,
  showScreenWaterFlow,
  hideScreenWaterFlow,
  closeScreenMarker,
  getWidgetWindow,
} from './window/ScreenMarker';

const logger = createLogger('Main');
const isDev = !app.isPackaged;
const retriever = createRetriever();
logger.info(`[RAG] Loaded ${retriever ? 'retriever' : 'no retriever'} with scenarios`);

// Log dizini (proje kök dizini / logs)
const LOGS_DIR = join(app.getAppPath(), '..', '..', 'logs');
let currentSessionLogger: SessionLogger | null = null;

// HITL (Human-in-the-Loop) - Onay Yöneticisi
const approvalManager = new ApprovalManager((request) => {
  // Onay isteğini hem ana pencereye hem de widget penceresine gönder
  const payload = { ...request };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('approval-request', payload);
  }
  const widgetWindow = getWidgetWindow();
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('approval-request', payload);
    // Onay isteği geldiğinde widget'ı tıklanabilir yap
    widgetWindow.setFocusable(true);
    widgetWindow.focus();
  }
  logger.info(`[HITL] Approval requested for subtask ${request.subtaskId}: ${request.description}`);
});

// ===== Uygulama Durumu (App State) =====
type OperatorMode = 'browser' | 'computer';

interface AppState {
  instructions: string | null;
  status: string;
  errorMsg: string | null;
  messages: any[];
  screenshots: string[];
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
    plannerEnabled: boolean;
    plannerBaseUrl: string;
    plannerApiKey: string;
    plannerModelName: string;
  };
  operator: OperatorMode;
}

let appState: AppState = {
  instructions: null,
  status: StatusEnum.END,
  errorMsg: null,
  messages: [],
  screenshots: [],
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
    plannerEnabled: false,
    plannerBaseUrl: '',
    plannerApiKey: '',
    plannerModelName: '',
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
    icon: join(__dirname, '../../resources/icon.ico'),
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

  // Renderer'ı (arayüzü) yükle
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

// ===== IPC İşleyicileri (Arayüz - Arka Plan İletişimi) =====
function registerIpcHandlers(): void {
  // Mevcut durumu al
  ipcMain.handle('getState', () => {
    return { ...appState, abortController: undefined };
  });

  // Ayarları güncelle
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
    appState.screenshots = [];
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
      appState.status = 'pause';
      appState.thinking = false;
      broadcastState();
    }
  });

  // Resume agent
  ipcMain.handle('resumeAgent', () => {
    if (currentAgent) {
      currentAgent.resume();
      appState.status = StatusEnum.RUNNING;
      appState.thinking = true;
      broadcastState();
    }
  });

  // Clear history
  ipcMain.handle('clearHistory', () => {
    appState.messages = [];
    appState.screenshots = [];
    appState.status = StatusEnum.END;
    appState.errorMsg = null;
    appState.instructions = '';
    broadcastState();
  });

  // HITL - Approval response from UI
  ipcMain.handle('approvalResponse', (_event, approved: boolean) => {
    if (approved) {
      logger.info('[HITL] User approved');
      approvalManager.approve();
    } else {
      logger.info('[HITL] User rejected');
      approvalManager.reject();
    }
    // Onay tamamlandı, widget'ı tekrar non-focusable yap
    const widgetWin = getWidgetWindow();
    if (widgetWin && !widgetWin.isDestroyed()) {
      widgetWin.setFocusable(false);
    }
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

// ===== Agent Çalıştırıcı (Runner) =====
async function runAgent(): Promise<void> {
  const { instructions, settings, operator } = appState;
  if (!instructions) throw new Error('Instructions are required');

  logger.info('[runAgent] Starting with:', instructions);

  const mode: OperatorMode = operator || 'browser';

  beforeAgentRun(mode);

  try {
    // Temiz bir sayfa sağlamak için önceki tarayıcı örneğini yok et
    if (mode === 'browser') {
      await DefaultBrowserOperator.destroyInstance();
    }

    // Moda göre operatörü oluştur (browser veya computer)
    const operatorInstance =
      mode === 'browser'
        ? await DefaultBrowserOperator.getInstance(
          settings.searchEngine as any,
        )
        : new NutJSElectronOperator();

    // Bu çalışma için oturum loglayıcısını oluştur
    const sessionId = `vilag-${Date.now()}`;
    currentSessionLogger = createSessionLogger(LOGS_DIR, sessionId);
    currentSessionLogger.logSessionInfo({
      sessionId,
      startedAt: new Date().toISOString(),
      instruction: instructions,
      operator: mode,
      model: {
        baseURL: settings.vlmBaseUrl,
        modelName: settings.vlmModelName,
      },
      systemPrompt: buildSystemPrompt(settings.language, mode).substring(0, 500) + '...',
    });

    // Planlayıcının (Planner) açık ve yapılandırılmış olup olmadığını kontrol et
    const usePlanner =
      settings.plannerEnabled &&
      settings.plannerBaseUrl &&
      settings.plannerModelName;

    if (usePlanner) {
      await runWithPlanner(instructions, settings, operatorInstance, mode);
    } else {
      await runDirect(instructions, settings, operatorInstance, mode);
    }
  } finally {
    currentSessionLogger = null;
    afterAgentRun(mode);
  }
}

/**
 * Planlayıcı olmadan doğrudan çalıştırır (orijinal davranış + RAG).
 */
async function runDirect(
  instructions: string,
  settings: AppState['settings'],
  operatorInstance: any,
  mode: OperatorMode,
): Promise<void> {
  const basePrompt = buildSystemPrompt(settings.language, mode);
  const scenario = retriever.retrieve(instructions);
  if (scenario) {
    logger.info('[RAG] Matched scenario:', scenario.id, scenario.title);
  } else {
    logger.info('[RAG] No matching scenario found, using base prompt');
  }
  const systemPrompt = injectScenario(basePrompt, scenario);

  const agent = createAgent(settings, systemPrompt, operatorInstance);
  currentAgent = agent;
  await agent.run(instructions);
  currentAgent = null;
}

/**
 * Planlayıcı ile çalıştırır: plan oluştur → her alt görevi RAG ile çalıştır.
 */
async function runWithPlanner(
  instructions: string,
  settings: AppState['settings'],
  operatorInstance: any,
  mode: OperatorMode,
): Promise<void> {
  // 1. Planı oluştur
  logger.info('[Planner] Creating plan...');
  const planner = new Planner({
    baseURL: settings.plannerBaseUrl,
    apiKey: settings.plannerApiKey || 'planner',
    model: settings.plannerModelName,
  });

  // Optionally give planner the RAG scenario for context
  const overallScenario = retriever.retrieve(instructions);
  const scenarioContext = overallScenario
    ? overallScenario.steps.map((s) => `${s.order}. ${s.action}`).join('\n')
    : undefined;

  let plan;
  try {
    plan = await planner.createPlan(instructions, scenarioContext);
    logger.info('[Planner] Plan created with', plan.subtasks.length, 'subtasks');
    for (const st of plan.subtasks) {
      logger.info(`  [${st.id}] ${st.instruction} (${st.riskLevel}, approval: ${st.requiresApproval})`);
    }
  } catch (e) {
    logger.error('[Planner] Failed to create plan, falling back to direct:', e);
    await runDirect(instructions, settings, operatorInstance, mode);
    return;
  }

  // 2. Her alt görevi yürüt
  const executor = new PlanExecutor();
  await executor.executePlan(plan, {
    onSubtaskStart: async (subtask: Subtask) => {
      logger.info(`[PlanExecutor] Starting subtask ${subtask.id}: ${subtask.instruction}`);
      broadcastState();
    },
    onApprovalNeeded: async (subtask: Subtask) => {
      logger.info(`[HITL] Subtask ${subtask.id} requires approval: ${subtask.instruction}`);
      const approved = await approvalManager.request(
        subtask.id,
        subtask.instruction,
        subtask.riskLevel,
      );
      logger.info(`[HITL] Subtask ${subtask.id} ${approved ? 'approved' : 'rejected'} by user`);
      return approved;
    },
    onExecute: async (subtask: Subtask) => {
      // Durdurulup durdurulmadığını kontrol et
      if (appState.abortController?.signal.aborted) return;

      // RAG for this subtask
      const basePrompt = buildSystemPrompt(settings.language, mode);
      const scenario = retriever.retrieve(subtask.instruction);
      if (scenario) {
        logger.info(`[RAG] Subtask ${subtask.id} matched scenario: ${scenario.id}`);
      }
      const systemPrompt = injectScenario(basePrompt, scenario);

      // Run agent for this subtask
      const agent = createAgent(settings, systemPrompt, operatorInstance);
      currentAgent = agent;
      await agent.run(subtask.instruction);
      currentAgent = null;
    },
    onSubtaskComplete: async (subtask: Subtask) => {
      logger.info(`[PlanExecutor] Subtask ${subtask.id} completed`);
    },
    onSubtaskError: async (subtask: Subtask, error: Error) => {
      logger.error(`[PlanExecutor] Subtask ${subtask.id} failed:`, error.message);
      return true; // Continue to next subtask
    },
  });

  logger.info('[PlanExecutor] All subtasks completed');
}

/**
 * Yardımcı fonksiyon: Ortak yapılandırma ile bir GUIAgent (Yapay Zeka Ajanı) oluşturur.
 */
function createAgent(
  settings: AppState['settings'],
  systemPrompt: string,
  operatorInstance: any,
): GUIAgent<any> {
  // Önceki alt görevlerin mesajlarını korumak için mevcut mesaj sayısını kaydet
  const baseOffset = appState.messages.length;

  return new GUIAgent({
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
      // Kullanıcının başlattığı 'pause' (duraklatma) durumunun 'running' (çalışıyor) ile ezilmesine izin verme
      if (!(appState.status === 'pause' && status === StatusEnum.RUNNING)) {
        appState.status = status;
      }
      // conversations kümülatif gelir — önceki mesajları koru, sadece bu ajanın kısmını güncelle
      appState.messages = [...appState.messages.slice(0, baseOffset), ...conversations];
      broadcastState();
    },
    onScreenshot: (base64: string) => {
      appState.screenshots.push(`data:image/png;base64,${base64}`);
      broadcastState();
    },
    onStepLog: (stepData: StepLogData) => {
      if (!currentSessionLogger) return;
      try {
        // Ekran görüntüsünü PNG olarak kaydet
        if (stepData.screenshotBase64) {
          currentSessionLogger.saveScreenshot(stepData.loopNumber, stepData.screenshotBase64);
        }
        // Save step log as JSON
        currentSessionLogger.logStep(stepData);
      } catch (e) {
        logger.error('[SessionLog] Error saving step log:', e);
      }
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
}

function beforeAgentRun(operator: OperatorMode): void {
  hideMainWindow();
  showWidgetWindow();
  showScreenWaterFlow();
}

function afterAgentRun(operator: OperatorMode): void {
  hideWidgetWindow();
  closeScreenMarker();
  hideScreenWaterFlow();
  showMainWindow();
}

function buildSystemPrompt(language: 'en' | 'tr', mode: OperatorMode = 'browser'): string {
  const lang = language === 'tr' ? 'Turkish' : 'English';

  // Moda göre aksiyonları ve bağlamı ayarla
  if (mode === 'computer') {
    return `You are a desktop GUI agent. You control the user's computer via mouse and keyboard. You see screenshots of the full desktop and perform actions to complete the task.

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
hotkey(key='ctrl c')
type(content='xxx')
scroll(start_box='<|box_start|>(x1,y1)<|box_end|>', direction='down or up or right or left')
wait()
finished()
call_user()

## Note
- Use ${lang} in \`Thought\` part.
- Summarize your next action in one sentence in \`Thought\` part.
- You are operating on the full desktop, not a browser.

## User Instruction
`;
  }

  // Browser modu prompt'u
  return `You are a browser GUI agent. You control a web browser to complete tasks. You see screenshots of the browser viewport and perform actions to navigate and interact with web pages.

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
hotkey(key='ctrl c')
type(content='xxx')
scroll(start_box='<|box_start|>(x1,y1)<|box_end|>', direction='down or up or right or left')
navigate(content='xxx')
navigate_back()
wait()
finished()
call_user()

## Note
- Use ${lang} in \`Thought\` part.
- Summarize your next action in one sentence in \`Thought\` part.

## User Instruction
`;
}

function broadcastState(): void {
  const statePayload = { ...appState, abortController: undefined };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stateUpdate', statePayload);
  }
  const widgetWindow = getWidgetWindow();
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.webContents.send('stateUpdate', statePayload);
  }
}

// ===== Uygulama Yaşam Döngüsü (App Lifecycle) =====
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
