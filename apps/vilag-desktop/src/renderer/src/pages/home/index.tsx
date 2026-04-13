import { Cpu, Monitor, Info } from 'lucide-react';
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

declare global {
  interface Window {
    vilagAPI: any;
  }
}

export default function HomePage() {
  const navigate = useNavigate();

  const startWithOperator = async (operator: 'computer' | 'browser') => {
    await window.vilagAPI?.updateSettings({ operator });
    navigate('/local');
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-full w-full flex-col items-center justify-center px-8 py-8">
        <div className="flex flex-col items-center text-center gap-3 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Welcome to VILAG Desktop
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
            Choose how the agent should operate: control your whole desktop or stay
            inside a browser window. You can switch the operator later from the
            settings.
          </p>
        </div>

        <Alert className="mb-6 max-w-2xl border-primary/20 bg-primary/5">
          <Info className="h-4 w-4 mt-0.5 text-primary" />
          <AlertDescription>
            VILAG can either control your entire desktop or stay confined to a
            single browser window. Start with the mode that best matches your task.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap justify-center gap-6">
          <Card className="w-[360px] py-5 shadow-none border-border/80 hover:border-primary/30 transition-colors">
            <CardHeader className="px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                Desktop Operator
              </CardTitle>
              <CardDescription className="leading-relaxed">
                Let the agent control your local desktop: click, type, drag and
                scroll anywhere on the screen.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              <div className="aspect-video w-full rounded-lg bg-[oklch(0.2_0.03_260)] dark:bg-[oklch(0.13_0.035_260)] flex items-center justify-center text-xs text-[oklch(0.7_0.03_260)] border border-border/40">
                Desktop preview
              </div>
            </CardContent>
            <CardFooter className="px-5">
              <Button
                className="w-full"
                onClick={() => startWithOperator('computer')}
              >
                Use Local Computer
              </Button>
            </CardFooter>
          </Card>

          <Card className="w-[360px] py-5 shadow-none border-border/80 hover:border-primary/30 transition-colors">
            <CardHeader className="px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                Browser Operator
              </CardTitle>
              <CardDescription className="leading-relaxed">
                Keep automation inside a single browser window for safer,
                tab-based workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              <div className="aspect-video w-full rounded-lg bg-gradient-to-br from-primary/80 via-primary/60 to-ring/40 flex items-center justify-center text-xs text-primary-foreground border border-border/40">
                Browser preview
              </div>
            </CardContent>
            <CardFooter className="px-5">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => startWithOperator('browser')}
              >
                Use Local Browser
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}
