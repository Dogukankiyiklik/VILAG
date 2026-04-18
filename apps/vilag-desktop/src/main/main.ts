/**
 * VILAG Desktop - Electron Ana Süreci (Main Process)
 */
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { join } from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
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
const SESSION_STORE_FILE = 'chat-sessions.json';
let persistTimer: NodeJS.Timeout | null = null;

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
  currentSessionId: string;
  sessions: ChatSession[];
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  instructions: string;
  messages: any[];
  screenshots: string[];
}

function createSession(title = 'New Chat'): ChatSession {
  const now = Date.now();
  return {
    id: `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt: now,
    updatedAt: now,
    instructions: '',
    messages: [],
    screenshots: [],
  };
}

function normalizeSession(raw: Partial<ChatSession>): ChatSession {
  const now = Date.now();
  const title = typeof raw.title === 'string' ? raw.title : 'New Chat';
  const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : now;
  const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : now;
  return {
    id: raw.id || `session-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    createdAt,
    updatedAt,
    instructions: typeof raw.instructions === 'string' ? raw.instructions : '',
    messages: Array.isArray(raw.messages) ? raw.messages : [],
    screenshots: Array.isArray(raw.screenshots) ? raw.screenshots : [],
  };
}

function summarizeSessionTitle(instructions: string): string {
  const compact = instructions
    .replace(/\s+/g, ' ')
    .replace(/[`*_#>[\]()-]+/g, ' ')
    .trim();

  if (!compact) return 'New Chat';

  const firstSentence = compact.split(/[.!?]/)[0]?.trim() || compact;
  const words = firstSentence.split(/\s+/).filter(Boolean);
  const shortByWords = words.slice(0, 4).join(' ');
  const candidate = shortByWords || firstSentence;

  if (candidate.length <= 26) return candidate;
  return `${candidate.slice(0, 23).trimEnd()}...`;
}

function stopCurrentAgentIfRunning(): void {
  appState.abortController?.abort();
  if (currentAgent) {
    currentAgent.resume();
    currentAgent.stop();
    currentAgent = null;
  }
}

function getSessionStorePath(): string {
  return join(app.getPath('userData'), SESSION_STORE_FILE);
}

async function saveSessionsToDisk(): Promise<void> {
  try {
    const storePath = getSessionStorePath();
    await mkdir(app.getPath('userData'), { recursive: true });
    const payload = JSON.stringify({
      currentSessionId: appState.currentSessionId,
      sessions: appState.sessions,
    });
    await writeFile(storePath, payload, 'utf-8');
  } catch (error) {
    logger.error('[SessionStore] Failed to save sessions:', error);
  }
}

function scheduleSaveSessions(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void saveSessionsToDisk();
  }, 250);
}

async function loadSessionsFromDisk(): Promise<void> {
  try {
    const storePath = getSessionStorePath();
    const raw = await readFile(storePath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      currentSessionId?: string;
      sessions?: Partial<ChatSession>[];
    };
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.map((session) => normalizeSession(session))
      : [];

    if (sessions.length === 0) return;

    appState.sessions = sessions;
    const nextCurrentId = parsed.currentSessionId;
    const hasCurrent = nextCurrentId
      ? sessions.some((s) => s.id === nextCurrentId)
      : false;
    appState.currentSessionId = hasCurrent ? (nextCurrentId as string) : sessions[0].id;
    syncCurrentSessionToAppState();
    logger.info(`[SessionStore] Loaded ${sessions.length} sessions`);
  } catch (error: any) {
    // İlk açılışta dosya olmayabilir, hata loglamaya gerek yok.
    if (error?.code !== 'ENOENT') {
      logger.error('[SessionStore] Failed to load sessions:', error);
    }
  }
}

function getCurrentSession(): ChatSession | undefined {
  return appState.sessions.find((session) => session.id === appState.currentSessionId);
}

function syncCurrentSessionToAppState(): void {
  const current = getCurrentSession();
  if (!current) return;
  const safeCurrent = normalizeSession(current);
  appState.instructions = safeCurrent.instructions;
  appState.messages = safeCurrent.messages;
  appState.screenshots = safeCurrent.screenshots;
}

function updateCurrentSession(patch: Partial<ChatSession>): void {
  const idx = appState.sessions.findIndex((session) => session.id === appState.currentSessionId);
  if (idx < 0) return;
  appState.sessions[idx] = {
    ...appState.sessions[idx],
    ...patch,
    updatedAt: Date.now(),
  };
  scheduleSaveSessions();
}

const initialSession = createSession();

let appState: AppState = {
  instructions: null,
  status: StatusEnum.END,
  errorMsg: null,
  messages: initialSession.messages,
  screenshots: initialSession.screenshots,
  thinking: false,
  abortController: null,
  settings: {
    vlmBaseUrl: 'https://nonsynesthetic-letty-nonparasitically.ngrok-free.dev/v1/',
    vlmApiKey: 'lm-studio',
    vlmModelName: 'UI-TARS-1.5 7B',
    maxLoopCount: 25,
    language: 'en',
    searchEngine: 'google',
    operator: 'browser',
    plannerEnabled: false,
    plannerBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    plannerApiKey: '',
    plannerModelName: 'gemini-2.5-flash',
  },
  operator: 'browser',
  currentSessionId: initialSession.id,
  sessions: [initialSession],
};

let mainWindow: BrowserWindow | null = null;
let currentAgent: GUIAgent<any> | null = null;
const RUNTIME_HITL_REJECTED_ERROR = 'User rejected high-risk action';
const RUNTIME_HITL_SKIP_SUBTASK_ERROR = 'Runtime HITL rejected - skip subtask';

function shouldRequireRuntimeApproval(prediction: string, parsed: any): boolean {
  const actionType = String(parsed?.action_type || '').toLowerCase();
  const actionInputs = parsed?.action_inputs || {};
  const key = String(actionInputs?.key || '').toLowerCase();
  const context = `${prediction || ''} ${parsed?.thought || ''}`.toLowerCase();

  // Enter/Return (submit) is always high-risk.
  if (actionType === 'hotkey' && (key.includes('enter') || key.includes('return'))) {
    return true;
  }

  // Runtime confirmation keywords for destructive/submit-like click actions.
  const riskyIntent =
    /submit|send|confirm|approve|delete|remove|purchase|buy|pay|checkout|place order|transfer|sign in|login/.test(context);

  if ((actionType === 'click' || actionType === 'left_double' || actionType === 'right_single') && riskyIntent) {
    return true;
  }

  return false;
}

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

function loadMainRenderer(win: BrowserWindow): void {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function ensureMainWindowVisible(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow();
    return;
  }

  // If a bad hash/navigation state leaked, force main renderer route.
  const currentUrl = mainWindow.webContents.getURL();
  if (currentUrl.includes('#widget') || currentUrl.includes('#/widget')) {
    loadMainRenderer(mainWindow);
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function showMainWindow() {
  ensureMainWindowVisible();
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
    const current = getCurrentSession();
    const maybeAutoTitle =
      current?.title === 'New Chat' || current?.title.trim() === '';
    updateCurrentSession({
      instructions,
      title: maybeAutoTitle
        ? summarizeSessionTitle(instructions)
        : current?.title || 'New Chat',
    });
  });

  ipcMain.handle('createSession', () => {
    stopCurrentAgentIfRunning();
    const session = createSession();
    appState.sessions = [session, ...appState.sessions];
    appState.currentSessionId = session.id;
    appState.status = StatusEnum.END;
    appState.errorMsg = null;
    appState.thinking = false;
    syncCurrentSessionToAppState();
    broadcastState();
    scheduleSaveSessions();
    return session;
  });

  ipcMain.handle('selectSession', (_event, sessionId: string) => {
    stopCurrentAgentIfRunning();
    appState.sessions = appState.sessions.map((session) => normalizeSession(session));
    const exists = appState.sessions.some((session) => session.id === sessionId);
    if (!exists) return null;
    appState.currentSessionId = sessionId;
    appState.status = StatusEnum.END;
    appState.errorMsg = null;
    appState.thinking = false;
    syncCurrentSessionToAppState();
    broadcastState();
    scheduleSaveSessions();
    return getCurrentSession();
  });

  ipcMain.handle('deleteSession', (_event, sessionId: string) => {
    stopCurrentAgentIfRunning();
    appState.sessions = appState.sessions.filter((session) => session.id !== sessionId);

    if (appState.sessions.length === 0) {
      const fresh = createSession();
      appState.sessions = [fresh];
      appState.currentSessionId = fresh.id;
    } else if (appState.currentSessionId === sessionId) {
      appState.currentSessionId = appState.sessions[0].id;
    }

    appState.status = StatusEnum.END;
    appState.errorMsg = null;
    appState.thinking = false;
    syncCurrentSessionToAppState();
    broadcastState();
    scheduleSaveSessions();
    return { currentSessionId: appState.currentSessionId, sessions: appState.sessions };
  });

  ipcMain.handle('clearAllSessions', () => {
    stopCurrentAgentIfRunning();
    const fresh = createSession();
    appState.sessions = [fresh];
    appState.currentSessionId = fresh.id;
    appState.status = StatusEnum.END;
    appState.errorMsg = null;
    appState.thinking = false;
    syncCurrentSessionToAppState();
    broadcastState();
    scheduleSaveSessions();
    return { currentSessionId: appState.currentSessionId, sessions: appState.sessions };
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
      if (e?.message === RUNTIME_HITL_REJECTED_ERROR) {
        appState.status = StatusEnum.CALL_USER;
        appState.errorMsg = 'High-risk action rejected. Waiting for your next instruction.';
      } else {
        appState.status = StatusEnum.ERROR;
        appState.errorMsg = e.message;
      }
    } finally {
      appState.thinking = false;
      broadcastState();
    }
  });

  // Stop agent
  ipcMain.handle('stopAgent', () => {
    appState.abortController?.abort();
    appState.abortController = null;
    try {
      if (currentAgent) {
        currentAgent.resume();
        currentAgent.stop();
      }
    } catch (error) {
      logger.error('[stopAgent] Failed to stop current agent cleanly:', error);
    } finally {
      currentAgent = null;
      // Ensure UI is restored immediately even if agent loop exits late.
      afterAgentRun(appState.operator);
      // Extra recovery pass for rare race conditions after cancellation.
      setTimeout(() => {
        ensureMainWindowVisible();
      }, 150);
    }
    appState.status = StatusEnum.END;
    appState.thinking = false;
    appState.errorMsg = null;
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
    stopCurrentAgentIfRunning();
    appState.messages = [];
    appState.screenshots = [];
    appState.status = StatusEnum.END;
    appState.errorMsg = null;
    appState.instructions = '';
    updateCurrentSession({
      title: 'New Chat',
      instructions: '',
      messages: [],
      screenshots: [],
    });
    broadcastState();
    scheduleSaveSessions();
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
    appState.abortController = null;
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

  const agent = createAgent(settings, systemPrompt, operatorInstance, {
    skipRuntimeApproval: false,
  });
  currentAgent = agent;
  await agent.run(instructions);
  if (appState.status === StatusEnum.CALL_USER) {
    throw new Error(RUNTIME_HITL_REJECTED_ERROR);
  }
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

      // Run agent for this subtask.
      // If planner already asked approval for this subtask, skip runtime re-approval.
      const agent = createAgent(settings, systemPrompt, operatorInstance, {
        skipRuntimeApproval: !!subtask.requiresApproval,
      });
      currentAgent = agent;
      try {
        await agent.run(subtask.instruction);
      } finally {
        currentAgent = null;
      }
      if (appState.status === StatusEnum.CALL_USER) {
        throw new Error(RUNTIME_HITL_SKIP_SUBTASK_ERROR);
      }
    },
    onSubtaskComplete: async (subtask: Subtask) => {
      logger.info(`[PlanExecutor] Subtask ${subtask.id} completed`);
    },
    onSubtaskError: async (subtask: Subtask, error: Error) => {
      logger.error(`[PlanExecutor] Subtask ${subtask.id} failed:`, error.message);
      if (error.message === RUNTIME_HITL_SKIP_SUBTASK_ERROR) {
        logger.warn(`[PlanExecutor] Subtask ${subtask.id} skipped by runtime HITL rejection`);
        // Continue with next subtask instead of cancelling the entire plan.
        appState.status = StatusEnum.RUNNING;
        appState.errorMsg = null;
        broadcastState();
        return true;
      }
      if (error.message === RUNTIME_HITL_REJECTED_ERROR) {
        logger.warn('[PlanExecutor] Stopping plan due to runtime HITL rejection');
        return false;
      }
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
  options?: {
    skipRuntimeApproval?: boolean;
  },
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
      updateCurrentSession({ messages: appState.messages });
      broadcastState();
    },
    onScreenshot: (base64: string) => {
      appState.screenshots.push(`data:image/png;base64,${base64}`);
      updateCurrentSession({ screenshots: appState.screenshots });
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
    onBeforeExecuteAction: async ({ prediction, parsedPrediction, loopNumber, actionIndex }) => {
      if (options?.skipRuntimeApproval) {
        return true;
      }
      if (!shouldRequireRuntimeApproval(prediction, parsedPrediction)) {
        return true;
      }

      const actionType = parsedPrediction.action_type;
      const actionInputs = parsedPrediction.action_inputs || {};
      const actionLabel = `${actionType}(${JSON.stringify(actionInputs)})`;
      const approvalId = Number(`${Date.now()}`.slice(-6)) + loopNumber + actionIndex;

      logger.info(`[HITL][Runtime] Approval required for action: ${actionLabel}`);
      const approved = await approvalManager.request(
        approvalId,
        `Approve high-risk action: ${actionLabel}`,
        'high',
      );

      if (!approved) {
        logger.info(`[HITL][Runtime] Action rejected by user: ${actionLabel}`);
        appState.status = StatusEnum.CALL_USER;
        appState.errorMsg = 'High-risk action rejected. Agent paused for manual decision.';
        broadcastState();
        return false;
      }

      logger.info(`[HITL][Runtime] Action approved by user: ${actionLabel}`);
      return true;
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

  await loadSessionsFromDisk();
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
