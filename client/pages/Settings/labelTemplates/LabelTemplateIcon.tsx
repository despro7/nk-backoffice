import { DynamicIcon } from 'lucide-react/dynamic';
import {
  DEFAULT_LABEL_TEMPLATE_ICON,
  resolveLabelTemplateIconKey,
} from '@shared/constants/labelTemplateIcons';

type LabelTemplateIconProps = {
  iconKey?: string | null;
  size?: number;
  className?: string;
};

export function LabelTemplateIcon({ iconKey, size = 16, className }: LabelTemplateIconProps) {
  const name = resolveLabelTemplateIconKey(iconKey ?? DEFAULT_LABEL_TEMPLATE_ICON);
  return <DynamicIcon name={name} size={size} className={className} />;
}
