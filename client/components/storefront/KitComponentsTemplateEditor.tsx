import React from 'react';
import { Button } from '@heroui/react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { HtmlCodeMirror } from '@/components/editor/HtmlCodeMirror';
import { getStorefrontDefaultBlockTemplate } from '@shared/constants/storefrontDefaults';

interface KitComponentsTemplateEditorProps {
  value: string;
  onChange: (template: string) => void;
  isDisabled?: boolean;
}

/** Raw loop-template editor — TipTap WYSIWYG strips {{#kitGroups}} tags. */
export function KitComponentsTemplateEditor({
  value,
  onChange,
  isDisabled,
}: KitComponentsTemplateEditorProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-500">
          Редагуйте loop-шаблон як текст. Для WYSIWYG використовуйте HTML-теги всередині циклів.
        </p>
        <Button
          size="sm"
          variant="flat"
          isDisabled={isDisabled}
          onPress={() =>
            onChange(getStorefrontDefaultBlockTemplate({ id: 'kitComponents', resolver: 'kitComponents' }))
          }
          startContent={<DynamicIcon name="rotate-ccw" size={14} />}
        >
          Скинути до типового
        </Button>
      </div>
      <HtmlCodeMirror
        value={value}
        onChange={onChange}
        readOnly={isDisabled}
        minHeight="240px"
        variant="embedded"
      />
    </div>
  );
}
