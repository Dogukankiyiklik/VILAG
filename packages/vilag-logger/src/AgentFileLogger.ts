/**
 * VILAG - Agent File Logger
 * 
 * Writes structured JSON trace files for each agent run, keeping a full history
 * of screenshots, prompts, model predictions, parsed actions, and executions.
 */
import fs from 'fs';
import path from 'path';
import type { GUIAgentData } from '@vilag/shared/types';
import { StatusEnum } from '@vilag/shared/types';

export interface TraceRecord {
    timestamp: string;
    loopCount: number;
    status: StatusEnum;
    data: any;
}

export class AgentFileLogger {
    private logFilePath: string;
    private isEnabled: boolean;

    constructor(options: { logDir?: string; enabled?: boolean } = {}) {
        this.isEnabled = options.enabled !== false;

        // Default to project root/logs/traces
        const logDir = options.logDir || path.join(process.cwd(), 'logs', 'traces');

        if (this.isEnabled && !fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        this.logFilePath = path.join(logDir, `trace_${dateStr}.jsonl`);

        if (this.isEnabled) {
            this.writeSystemRecord('session_start', { logFilePath: this.logFilePath });
        }
    }

    public get path(): string {
        return this.logFilePath;
    }

    public disable() {
        this.isEnabled = false;
    }

    public enable() {
        this.isEnabled = true;
    }

    /**
     * Main entry point to log events emitted directly from the GUIAgent's onData callback.
     */
    public logAgentData(event: GUIAgentData, error?: any) {
        if (!this.isEnabled) return;

        // We want to avoid writing 2MB base64 images to the JSON log
        const cleanConversations = (event.conversations || []).map(conv => ({
            ...conv,
            screenshotBase64: conv.screenshotBase64 ? '[BASE64_IMAGE_OMITTED_FOR_TRACE]' : undefined
        }));

        const record: TraceRecord = {
            timestamp: new Date().toISOString(),
            loopCount: cleanConversations.length,
            status: event.status,
            data: {
                conversations: cleanConversations,
                costTime: event.costTime,
                costTokens: event.costTokens,
                sessionId: event.sessionId,
                ...(error ? { error } : {})
            },
        };

        this.appendToFile(record);
    }

    private writeSystemRecord(event: string, meta: any = {}) {
        if (!this.isEnabled) return;
        this.appendToFile({
            timestamp: new Date().toISOString(),
            loopCount: 0,
            status: 'SYSTEM_EVENT' as any,
            data: { event, ...meta }
        });
    }

    private appendToFile(record: any) {
        try {
            fs.appendFileSync(this.logFilePath, JSON.stringify(record) + '\n', 'utf8');
        } catch (err) {
            console.error('[AgentFileLogger] Failed to write to trace file:', err);
        }
    }
}

// Global default instance
export const traceLogger = new AgentFileLogger();
