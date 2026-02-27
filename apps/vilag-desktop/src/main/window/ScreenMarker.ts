/**
 * VILAG - Screen Marker & Widget Window
 *
 * Simplified version of UI-TARS ScreenMarker:
 * - screenWaterFlow: subtle blue border animation while the agent is running
 * - widgetWindow: small floating window that shows the widget UI (#widget route)
 */
import { app, BrowserWindow, screen } from 'electron';
import { join } from 'path';

import { createLogger } from '@vilag/logger';
import * as env from '@main/env';

const logger = createLogger('ScreenMarker');

class ScreenMarker {
  private static instance: ScreenMarker;
  private widgetWindow: BrowserWindow | null = null;
  private screenWaterFlow: BrowserWindow | null = null;

  static getInstance(): ScreenMarker {
    if (!ScreenMarker.instance) {
      ScreenMarker.instance = new ScreenMarker();
    }
    return ScreenMarker.instance;
  }

  showScreenWaterFlow() {
    if (this.screenWaterFlow) {
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

    this.screenWaterFlow = new BrowserWindow({
      width: screenWidth,
      height: screenHeight,
      x: 0,
      y: 0,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      paintWhenInitiallyHidden: true,
      type: 'panel',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    this.screenWaterFlow.setFocusable(false);
    this.screenWaterFlow.setContentProtection(false);
    this.screenWaterFlow.setIgnoreMouseEvents(true);

    this.screenWaterFlow.loadURL(`data:text/html;charset=UTF-8,
      <html>
        <head>
          <style id="water-flow-animation">
            html::before {
              content: "";
              position: fixed;
              top: 0; right: 0; bottom: 0; left: 0;
              pointer-events: none;
              z-index: 9999;
              background:
                linear-gradient(to right, rgba(30, 144, 255, 0.4), transparent 50%) left,
                linear-gradient(to left, rgba(30, 144, 255, 0.4), transparent 50%) right,
                linear-gradient(to bottom, rgba(30, 144, 255, 0.4), transparent 50%) top,
                linear-gradient(to top, rgba(30, 144, 255, 0.4), transparent 50%) bottom;
              background-repeat: no-repeat;
              background-size: 10% 100%, 10% 100%, 100% 10%, 100% 10%;
              animation: waterflow 5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
              filter: blur(8px);
            }

            @keyframes waterflow {
              0%, 100% {
                background-image:
                  linear-gradient(to right, rgba(30, 144, 255, 0.4), transparent 50%),
                  linear-gradient(to left, rgba(30, 144, 255, 0.4), transparent 50%),
                  linear-gradient(to bottom, rgba(30, 144, 255, 0.4), transparent 50%),
                  linear-gradient(to top, rgba(30, 144, 255, 0.4), transparent 50%);
                transform: scale(1);
              }
              25% {
                background-image:
                  linear-gradient(to right, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to left, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to bottom, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to top, rgba(30, 144, 255, 0.39), transparent 52%);
                transform: scale(1.03);
              }
              50% {
                background-image:
                  linear-gradient(to right, rgba(30, 144, 255, 0.38), transparent 55%),
                  linear-gradient(to left, rgba(30, 144, 255, 0.38), transparent 55%),
                  linear-gradient(to bottom, rgba(30, 144, 255, 0.38), transparent 55%),
                  linear-gradient(to top, rgba(30, 144, 255, 0.38), transparent 55%);
                transform: scale(1.05);
              }
              75% {
                background-image:
                  linear-gradient(to right, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to left, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to bottom, rgba(30, 144, 255, 0.39), transparent 52%),
                  linear-gradient(to top, rgba(30, 144, 255, 0.39), transparent 52%);
                transform: scale(1.03);
              }
            }
          </style>
        </head>
        <body></body>
      </html>
    `);
  }

  hideScreenWaterFlow() {
    if (this.screenWaterFlow) {
      this.screenWaterFlow.close();
      this.screenWaterFlow = null;
    }
  }

  showWidgetWindow() {
    if (this.widgetWindow) {
      this.widgetWindow.close();
      this.widgetWindow = null;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

    this.widgetWindow = new BrowserWindow({
      width: 400,
      height: 400,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      resizable: false,
      type: 'toolbar',
      visualEffectState: 'active',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        webSecurity: !!env.isDev,
      },
    });

    this.widgetWindow.setFocusable(false);
    this.widgetWindow.setContentProtection(true);
    this.widgetWindow.setPosition(
      Math.floor(screenWidth - 400 - 32),
      Math.floor(screenHeight - 400 - 32 - 64),
    );

    const devUrl = process.env['ELECTRON_RENDERER_URL'];

    if (!app.isPackaged && devUrl) {
      this.widgetWindow.loadURL(devUrl + '#widget');
    } else {
      this.widgetWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '#widget',
      });
    }

    logger.info('[ScreenMarker] widget window shown');
  }

  hideWidgetWindow() {
    if (this.widgetWindow) {
      this.widgetWindow.close();
      this.widgetWindow = null;
      logger.info('[ScreenMarker] widget window closed');
    }
  }

  closeAll() {
    this.hideWidgetWindow();
    this.hideScreenWaterFlow();
  }
}

export const showScreenWaterFlow = () => {
  ScreenMarker.getInstance().showScreenWaterFlow();
};

export const hideScreenWaterFlow = () => {
  ScreenMarker.getInstance().hideScreenWaterFlow();
};

export const showWidgetWindow = () => {
  ScreenMarker.getInstance().showWidgetWindow();
};

export const hideWidgetWindow = () => {
  ScreenMarker.getInstance().hideWidgetWindow();
};

export const closeScreenMarker = () => {
  ScreenMarker.getInstance().closeAll();
};

