import React, { useState } from 'react';
import { Switch } from '@heroui/switch';
import { useAuth } from '../contexts/AuthContext';
import { useDebug } from '../contexts/DebugContext';
import { cn } from '../lib/utils';

interface DebugModeSwitchProps {
  onDebugModeChange?: (isEnabled: boolean) => void;
  className?: string;
}

export const DebugModeSwitch: React.FC<DebugModeSwitchProps> = ({
  onDebugModeChange,
  className = ''
}) => {
  const { user } = useAuth();
  const { isDebugMode, setDebugMode } = useDebug();
  const [transitionMode, setTransitionMode] = useState(false);

  // Проверяем, является ли пользователь админом
  const isAdmin = user && ['admin'].includes(user.role);

  // Если пользователь не админ, не показываем компонент
  if (!isAdmin) {
    return null;
  }

  const handleModeChange = (checked: boolean) => {
    setTransitionMode(true);
    
    setTimeout(() => {
      setDebugMode(checked);
      onDebugModeChange?.(checked);
      setTransitionMode(false);
    }, 100);
  };

  return (
    <div className={cn("flex items-center gap-3 w-full justify-start", className)}>
      <Switch
        isSelected={isDebugMode}
        onValueChange={handleModeChange}
        color="danger"
        size="sm"
        classNames={{
          wrapper: "bg-slate-600/50 transition-all duration-300",
          thumbIcon: "bg-white/50",
          base: "transition-all duration-300",
        }}
      >
        <span className={`text-sm font-medium transition-color duration-300 
          ${isDebugMode ? 'text-danger' : 'text-slate-600/80'}
          ${transitionMode ? 'opacity-70' : 'opacity-100'}`}>
          Debug mode
        </span>
      </Switch>
    </div>
  );
};
