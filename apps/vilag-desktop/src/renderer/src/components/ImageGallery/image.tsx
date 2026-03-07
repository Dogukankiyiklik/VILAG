import React, { useEffect, useRef } from 'react';
import mediumZoom, { type Zoom } from 'medium-zoom';
import { type PredictionParsed } from '@vilag/shared/types';

interface ImageProps {
    src: string;
    alt: string;
    predictions?: PredictionParsed[];
}

const parseBox = (boxStr: string, width: number, height: number) => {
    if (!boxStr) return null;
    const match = boxStr.match(/\((\d+),(\d+)\)/);
    if (match) {
        const px = parseInt(match[1], 10) / 1000;
        const py = parseInt(match[2], 10) / 1000;
        return { x: px * width, y: py * height };
    }
    return null;
};

export const SnapshotImage: React.FC<ImageProps> = ({ src, alt, predictions }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        let zoom: Zoom | undefined;
        const initZoom = () => {
            if (canvasRef.current) {
                zoom = mediumZoom(canvasRef.current, {
                    background: 'rgba(0,0,0,.7)',
                    margin: 50,
                });
            }
        };

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.src = src;
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const cw = img.width;
            const ch = img.height;

            if (!predictions || predictions.length === 0) {
                requestAnimationFrame(initZoom);
                return;
            }

            ctx.font = '16px -apple-system, BlinkMacSystemFont, Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            predictions.forEach((pred) => {
                let text = pred.action_type;
                const inputs = pred.action_inputs || {};
                const isClick = ['click', 'left_click', 'left_single', 'double_click', 'left_double'].includes(pred.action_type);

                let cx = cw / 2;
                let cy = ch / 2;
                let drawCircle = false;

                if (isClick && inputs.start_box) {
                    const pt = parseBox(inputs.start_box, cw, ch);
                    if (pt) {
                        cx = pt.x;
                        cy = pt.y;
                        drawCircle = true;
                    }
                } else if (pred.action_type === 'type') {
                    text = `Typing: "${inputs.content || ''}"`;
                } else if (pred.action_type === 'hotkey') {
                    const keys = (inputs.key || '').split(' ').join(' + ');
                    text = `Hotkey: ${keys}`;
                }

                if (drawCircle) {
                    // Outward dashed red circle
                    ctx.beginPath();
                    ctx.arc(cx, cy, 16, 0, 2 * Math.PI);
                    ctx.strokeStyle = 'red';
                    ctx.lineWidth = 3;
                    ctx.setLineDash([8, 2]); // simpler dash
                    ctx.stroke();

                    // inner solid red dot
                    ctx.beginPath();
                    ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
                    ctx.fillStyle = 'red';
                    ctx.fill();

                    // Add text next to the circle
                    ctx.textAlign = 'left';
                    ctx.fillStyle = 'red';
                    ctx.fillText(text, cx + 24, cy);
                } else {
                    // Center text
                    ctx.textAlign = 'center';
                    ctx.fillStyle = 'red';
                    // Add a small semi-transparent background for better text readability
                    const textWidth = ctx.measureText(text).width;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                    ctx.fillRect(cx - textWidth / 2 - 10, cy - 15, textWidth + 20, 30);

                    ctx.fillStyle = 'red';
                    ctx.fillText(text, cx, cy);
                }
            });

            requestAnimationFrame(initZoom);
        };

        return () => {
            zoom?.detach();
            zoom?.close();
        };
    }, [src, predictions]);

    return (
        <div className="max-w-full h-[calc(100vh-280px)] flex items-center justify-center relative">
            <canvas
                ref={canvasRef}
                className="block object-contain max-h-full select-none"
                aria-label={alt}
            />
        </div>
    );
};
