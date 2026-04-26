import { Monitor, Globe, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@renderer/components/ui/card';
import { Button } from '@renderer/components/ui/button';
import { Alert, AlertDescription } from '@renderer/components/ui/alert';
import { useI18n } from '@renderer/i18n';

import desktopPreview from '../../../../../resources/desktop.png';
import browserPreview from '../../../../../resources/browser.png';

declare global {
  interface Window {
    vilagAPI: any;
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const startWithOperator = async (operator: 'computer' | 'browser') => {
    await window.vilagAPI?.updateSettings({ operator });
    navigate('/local');
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-full w-full flex-col items-center justify-center px-8 py-8">
        <div className="flex flex-col items-center text-center gap-2 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('home.welcomeTitle')}
          </h1>
          <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
            {t('home.welcomeDesc')}
          </p>
        </div>

        <Alert className="mb-6 max-w-2xl border-primary/20 bg-primary/5">
          <Info className="h-4 w-4 mt-0.5 text-primary" />
          <AlertDescription>
            {t('home.modeInfo')}
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap justify-center gap-6">
          {/* Desktop Operator */}
          <Card className="w-[360px] py-5 shadow-none border-border/80 hover:border-primary/30 transition-colors flex flex-col">
            <CardHeader className="px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                {t('home.desktopTitle')}
              </CardTitle>
              <CardDescription className="leading-relaxed">
                {t('home.desktopDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 flex-1 flex items-center">
              <div className="aspect-video w-full rounded-lg overflow-hidden border border-border/40 bg-muted/30 flex items-center justify-center">
                <img src={desktopPreview} alt="Desktop preview" className="h-full w-full object-contain" />
              </div>
            </CardContent>
            <CardFooter className="px-5">
              <Button className="w-full" onClick={() => startWithOperator('computer')}>
                {t('home.useDesktop')}
              </Button>
            </CardFooter>
          </Card>

          {/* Browser Operator */}
          <Card className="w-[360px] py-5 shadow-none border-border/80 hover:border-primary/30 transition-colors flex flex-col">
            <CardHeader className="px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4 text-muted-foreground" />
                {t('home.browserTitle')}
              </CardTitle>
              <CardDescription className="leading-relaxed">
                {t('home.browserDesc')}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 flex-1 flex items-center">
              <div className="aspect-video w-full rounded-lg overflow-hidden border border-border/40 bg-muted/30 flex items-center justify-center">
                <img src={browserPreview} alt="Browser preview" className="h-full w-full object-contain" />
              </div>
            </CardContent>
            <CardFooter className="px-5">
              <Button variant="outline" className="w-full" onClick={() => startWithOperator('browser')}>
                {t('home.useBrowser')}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
