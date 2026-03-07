import React, { useState, useMemo, useEffect } from 'react';
import {
    MousePointerClick, SkipBack, SkipForward, Hand, Keyboard,
    Type, ScrollText, AlertCircle, CheckSquare, RotateCcw,
    Hourglass, Camera
} from 'lucide-react';
import ms from 'ms';

import { Button } from '@renderer/components/ui/button';
import { Slider } from '@renderer/components/ui/slider';
import { type Conversation } from '@vilag/shared/types';
import { SnapshotImage } from './image';

const ActionIconMap: Record<string, any> = {
    scroll: ScrollText,
    drag: Hand,
    hotkey: Keyboard,
    type: Type,
    click: MousePointerClick,
    left_double: MousePointerClick,
    right_single: MousePointerClick,
    error_env: AlertCircle,
    finished: CheckSquare,
    call_user: RotateCcw,
    wait: Hourglass,
    screenshot: Camera,
};

interface ImageGalleryProps {
    selectImgIndex?: number;
    messages: Conversation[];
}

interface Action {
    type: string;
    action: string;
    cost?: number;
    input?: string;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({ messages, selectImgIndex }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    const imageEntries = useMemo(() => {
        return messages
            .filter((msg) => msg && !!msg.screenshotBase64)
            .map((msg, index) => {
                let actions: Action[] = [];

                if (msg.predictionParsed && msg.predictionParsed.length > 0) {
                    actions = msg.predictionParsed.map((item) => {
                        let input = '';
                        if (item.action_inputs?.start_box) {
                            input += `(start_box: ${item.action_inputs.start_box})`;
                        }
                        if (item.action_inputs?.content) {
                            input += ` (${item.action_inputs.content})`;
                        }
                        if (item.action_inputs?.key) {
                            input += ` (${item.action_inputs.key})`;
                        }
                        return {
                            action: 'Action',
                            type: item.action_type,
                            cost: msg.timing?.actionTime,
                            input,
                        };
                    });
                }

                return {
                    originalIndex: index,
                    message: msg,
                    imageData: msg.screenshotBase64,
                    actions,
                };
            });
    }, [messages]);

    useEffect(() => {
        if (typeof selectImgIndex === 'number') {
            const targetIndex = imageEntries.findIndex((e) => e.originalIndex === selectImgIndex);
            if (targetIndex !== -1) setCurrentIndex(targetIndex);
        }
    }, [selectImgIndex, imageEntries]);

    useEffect(() => {
        if (imageEntries.length > 0) {
            setCurrentIndex(imageEntries.length - 1);
        }
    }, [imageEntries.length]);

    if (imageEntries.length === 0) {
        return <div className="flex items-center justify-center h-full text-muted-foreground text-xs">No images to display</div>;
    }

    const currentEntry = imageEntries[currentIndex];
    if (!currentEntry) return null;

    const mime = 'image/jpeg';

    // Clean the base64 string just in case it already contains the data uri prefix
    const cleanBase64 = currentEntry.imageData.replace(/^data:image\/\w+;base64,/, '');

    return (
        <div className="h-full flex flex-col py-4 w-full">
            <div className="flex overflow-x-auto gap-4 pb-2 mb-2 scrollbar-thin">
                {currentEntry.actions.map((action, idx) => {
                    const ActionIcon = ActionIconMap[action.type] || MousePointerClick;
                    return (
                        <div key={idx} className="flex items-start gap-2 min-w-fit flex-shrink-0">
                            <div className="text-muted-foreground"><ActionIcon className="w-8 h-8" /></div>
                            <div className="flex-1">
                                <div className="text-sm font-medium leading-tight">{action.action}</div>
                                <div className="text-xs text-muted-foreground max-w-full">
                                    <span className="font-medium text-primary/70">{action.type}</span>
                                    {action.input && <span className="text-primary/70 break-all ml-1">{action.input}</span>}
                                    {action.cost && <span className="ml-2 text-muted-foreground/70">{ms(action.cost)}</span>}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <SnapshotImage
                src={`data:${mime};base64,${cleanBase64}`}
                alt={`screenshot ${currentEntry.originalIndex + 1}`}
                predictions={currentEntry.message.predictionParsed}
            />

            <div className="flex items-center mt-4 gap-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCurrentIndex((c) => (c - 1 + imageEntries.length) % imageEntries.length)}
                    disabled={imageEntries.length <= 1 || currentIndex === 0}
                >
                    <SkipBack className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCurrentIndex((c) => (c + 1) % imageEntries.length)}
                    disabled={imageEntries.length <= 1 || currentIndex === imageEntries.length - 1}
                >
                    <SkipForward className="h-4 w-4" />
                </Button>
                <div className="flex-1 px-4">
                    <Slider
                        value={[currentIndex]}
                        min={0}
                        max={imageEntries.length - 1}
                        step={1}
                        onValueChange={(v) => setCurrentIndex(v[0])}
                        disabled={imageEntries.length <= 1}
                    />
                </div>
            </div>
        </div>
    );
};

export default ImageGallery;
