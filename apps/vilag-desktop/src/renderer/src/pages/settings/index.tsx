import { Cpu, Globe, BrainCircuit, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Card, CardHeader, CardTitle, CardContent } from '@renderer/components/ui/card';
import { Input } from '@renderer/components/ui/input';
import { Separator } from '@renderer/components/ui/separator';
import { useI18n, type UILanguage } from '@renderer/i18n';

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
  browserStartUrl?: string;
  ragEnabled: boolean;
  plannerEnabled: boolean;
  plannerBaseUrl: string;
  plannerApiKey: string;
  plannerModelName: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const { t, setLanguage } = useI18n();

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
    if (key === 'language' && (value === 'en' || value === 'tr')) {
      const lang = value as UILanguage;
      setLanguage(lang);
      window.dispatchEvent(new CustomEvent<UILanguage>('vilag-language-changed', { detail: lang }));
    }
  };

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('common.loadingSettings')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6 overflow-y-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t('settings.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('settings.subtitle')}
        </p>
      </div>

      <div className="flex flex-col gap-4 max-w-3xl">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4 text-muted-foreground" />
              {t('settings.modelConfig')}
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t('settings.apiBaseUrl')}
              </label>
              <Input
                value={settings.vlmBaseUrl}
                onChange={(e) => handleSettingsChange('vlmBaseUrl', e.target.value)}
                placeholder="http://localhost:1234/v1"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t('settings.apiKey')}
              </label>
              <Input
                value={settings.vlmApiKey}
                onChange={(e) => handleSettingsChange('vlmApiKey', e.target.value)}
                placeholder="lm-studio"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t('settings.modelName')}
              </label>
              <Input
                value={settings.vlmModelName}
                onChange={(e) => handleSettingsChange('vlmModelName', e.target.value)}
                placeholder={t('settings.modelNamePlaceholder')}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-muted-foreground" />
              {t('settings.browserControls')}
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t('settings.maxExecutionSteps')}
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
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t('settings.defaultSearchEngine')}
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={settings.searchEngine}
                onChange={(e) => handleSettingsChange('searchEngine', e.target.value)}
              >
                <option value="google">Google</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t('settings.instructionLanguage')}
              </label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={settings.language}
                onChange={(e) => handleSettingsChange('language', e.target.value as 'en' | 'tr')}
              >
                <option value="en">{t('settings.englishDefault')}</option>
                <option value="tr">{t('settings.turkish')}</option>
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">
                {t('settings.browserStartUrl')}
              </label>
              <Input
                value={settings.browserStartUrl ?? ''}
                onChange={(e) => handleSettingsChange('browserStartUrl', e.target.value)}
                placeholder="https://teams.microsoft.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              {t('settings.ragTitle')}
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <span
                role="switch"
                aria-checked={settings.ragEnabled ?? false}
                onClick={() => handleSettingsChange('ragEnabled', !settings.ragEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${settings.ragEnabled
                    ? 'bg-primary border-primary'
                    : 'bg-input border-input'
                  }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${settings.ragEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                />
              </span>
              <span className="text-xs font-medium text-muted-foreground select-none">
                {settings.ragEnabled
                  ? t('settings.ragOn')
                  : t('settings.ragOff')}
              </span>
            </label>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit className="h-4 w-4 text-muted-foreground" />
              {t('settings.plannerTitle')}
            </CardTitle>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 space-y-4">
            <label className="flex items-center gap-3 cursor-pointer group">
              <span
                role="switch"
                aria-checked={settings.plannerEnabled ?? false}
                onClick={() => handleSettingsChange('plannerEnabled', !settings.plannerEnabled)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${settings.plannerEnabled
                    ? 'bg-primary border-primary'
                    : 'bg-input border-input'
                  }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform ${settings.plannerEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                />
              </span>
              <span className="text-xs font-medium text-muted-foreground select-none">
                {settings.plannerEnabled ? t('settings.plannerOn') : t('settings.plannerOff')}
              </span>
            </label>
            {settings.plannerEnabled && (
              <div className="space-y-4 pt-2 border-t border-border/60">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('settings.plannerApiBaseUrl')}
                  </label>
                  <Input
                    value={settings.plannerBaseUrl ?? ''}
                    onChange={(e) => handleSettingsChange('plannerBaseUrl', e.target.value)}
                    placeholder="https://generativelanguage.googleapis.com/v1beta/openai/"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('settings.plannerApiKey')}
                  </label>
                  <Input
                    value={settings.plannerApiKey ?? ''}
                    onChange={(e) => handleSettingsChange('plannerApiKey', e.target.value)}
                    placeholder="Gemini API key"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('settings.plannerModelName')}
                  </label>
                  <Input
                    value={settings.plannerModelName ?? ''}
                    onChange={(e) => handleSettingsChange('plannerModelName', e.target.value)}
                    placeholder={t('settings.plannerModelPlaceholder')}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
