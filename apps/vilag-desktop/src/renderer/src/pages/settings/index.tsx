import { Cpu, Globe } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card';
import { Input } from '@renderer/components/ui/input';
import { Separator } from '@renderer/components/ui/separator';

declare global {
  interface Window {
    vilagAPI: any;
  }
}

interface SettingsState {
  vlmBaseUrl: string;
  vlmApiKey: string;
  vlmModelName: string;
  maxLoopCount: number;
  language: 'en' | 'tr';
  searchEngine: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState | null>(null);

  useEffect(() => {
    window.vilagAPI?.getSettings().then((s: SettingsState) => {
      if (s) setSettings(s);
    });
  }, []);

  const handleSettingsChange = async (key: keyof SettingsState, value: any) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await window.vilagAPI?.updateSettings(updated);
  };

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <div className="settings-header">
        <h2 className="text-2xl font-semibold tracking-tight">Agent Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Configure your model endpoints, API keys, and behavioral parameters.
        </p>
      </div>

      <div className="flex flex-col gap-4 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4" />
              Model Configuration (LM Studio)
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                API Base URL
              </label>
              <Input
                value={settings.vlmBaseUrl}
                onChange={(e) => handleSettingsChange('vlmBaseUrl', e.target.value)}
                placeholder="http://localhost:1234/v1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                API Key
              </label>
              <Input
                value={settings.vlmApiKey}
                onChange={(e) => handleSettingsChange('vlmApiKey', e.target.value)}
                placeholder="lm-studio"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Model Name
              </label>
              <Input
                value={settings.vlmModelName}
                onChange={(e) => handleSettingsChange('vlmModelName', e.target.value)}
                placeholder="Enter model name (e.g., ui-tars-2b-q4)"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4" />
              Browser Controls
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Max Execution Steps
              </label>
              <Input
                type="number"
                value={settings.maxLoopCount}
                onChange={(e) =>
                  handleSettingsChange('maxLoopCount', parseInt(e.target.value) || 25)
                }
                min={1}
                max={100}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Default Search Engine
              </label>
              <select
                className="form-select bg-background border border-input rounded-md px-2 py-1 text-sm"
                value={settings.searchEngine}
                onChange={(e) => handleSettingsChange('searchEngine', e.target.value)}
              >
                <option value="google">Google</option>
                <option value="bing">Bing</option>
                <option value="baidu">Baidu</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Agent Instruction Language
              </label>
              <select
                className="form-select bg-background border border-input rounded-md px-2 py-1 text-sm"
                value={settings.language}
                onChange={(e) => handleSettingsChange('language', e.target.value as 'en' | 'tr')}
              >
                <option value="en">English (Default)</option>
                <option value="tr">Türkçe</option>
              </select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

