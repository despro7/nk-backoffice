import React from 'react';
import { Button, ButtonGroup } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';

type DrawTool = 'rect' | 'ellipse';
export type AnnotateTool = 'pan' | DrawTool;

export interface ScreenshotAnnotatorToolbarProps {
  scale: number;
  tool: AnnotateTool;
  strokesCount: number;
  zoomMin: number;
  zoomMax: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onToolChange: (tool: AnnotateTool) => void;
  onClear: () => void;
  className?: string;
}

export function ScreenshotAnnotatorToolbar({
  scale,
  tool,
  strokesCount,
  zoomMin,
  zoomMax,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onToolChange,
  onClear,
  className = 'flex shrink-0 flex-wrap items-center justify-center gap-1.5',
}: ScreenshotAnnotatorToolbarProps) {
  return (
    <div className={className}>
      <ButtonGroup className="rounded-small border border-default-200 p-0.5">
        <Button
          isIconOnly
          size="sm"
          variant="light"
          aria-label="Зменшити"
          isDisabled={scale <= zoomMin}
          onPress={onZoomOut}
          className="h-7 min-w-8"
        >
          <DynamicIcon name="minus" size={14} />
        </Button>
        <button
          type="button"
          onClick={onZoomReset}
          className="h-7 min-w-11 px-1 text-center text-xs tabular-nums text-default-600 hover:text-default-900"
          aria-label="Скинути масштаб"
          title="Скинути масштаб"
        >
          {Math.round(scale * 100)}%
        </button>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          aria-label="Збільшити"
          isDisabled={scale >= zoomMax}
          onPress={onZoomIn}
          className="h-7 min-w-8"
        >
          <DynamicIcon name="plus" size={14} />
        </Button>
      </ButtonGroup>
      <ButtonGroup color="danger" variant="flat">
        <Button
          size="sm"
          variant={tool === 'pan' ? 'solid' : 'flat'}
          color={tool === 'pan' ? 'danger' : 'default'}
          onPress={() => onToolChange('pan')}
          startContent={<DynamicIcon name="hand" size={14} />}
        >
          Pan
        </Button>
        <Button
          size="sm"
          variant={tool === 'rect' ? 'solid' : 'flat'}
          color={tool === 'rect' ? 'danger' : 'default'}
          onPress={() => onToolChange('rect')}
          startContent={<DynamicIcon name="square" size={14} />}
        >
          Прямокутник
        </Button>
        <Button
          size="sm"
          variant={tool === 'ellipse' ? 'solid' : 'flat'}
          color={tool === 'ellipse' ? 'danger' : 'default'}
          onPress={() => onToolChange('ellipse')}
          startContent={<DynamicIcon name="circle" size={14} />}
        >
          Овал
        </Button>
      </ButtonGroup>
      {strokesCount > 0 ? (
        <Button
          size="sm"
          variant="light"
          color="danger"
          onPress={onClear}
          startContent={<DynamicIcon name="eraser" size={14} />}
        >
          Очистити
        </Button>
      ) : null}
    </div>
  );
}
