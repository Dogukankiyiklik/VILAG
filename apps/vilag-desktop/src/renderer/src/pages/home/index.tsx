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
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to VILAG Desktop
          </h1>
          <p className="text-sm text-muted-foreground max-w-xl">
            Choose how the agent should operate: control your whole desktop or stay
            inside a browser window. You can switch the operator later from the
            settings.
          </p>
        </div>

        <Alert className="mb-6 max-w-2xl">
          <Info className="h-4 w-4 mt-0.5" />
          <AlertDescription>
            VILAG can either control your entire desktop or stay confined to a
            single browser window. Start with the mode that best matches your task.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap justify-center gap-6">
          <Card className="w-[360px] py-5 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Monitor className="h-4 w-4" />
                Desktop Operator
              </CardTitle>
              <CardDescription>
                Let the agent control your local desktop: click, type, drag and
                scroll anywhere on the screen.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              <div className="aspect-video w-full rounded-lg bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center text-xs text-slate-100 border border-border/60">
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

          <Card className="w-[360px] py-5 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="px-5">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4" />
                Browser Operator
              </CardTitle>
              <CardDescription>
                Keep automation inside a single browser window for safer,
                tab-based workflows.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5">
              <div className="aspect-video w-full rounded-lg bg-gradient-to-br from-indigo-500 via-sky-500 to-cyan-400 dark:from-indigo-400 dark:via-sky-500 dark:to-cyan-500 flex items-center justify-center text-xs text-slate-50 border border-border/60">
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

