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
    <div className={cn("flex items-center gap-3 w-full justify-center sm:w-auto ml-10", className)}>
      <Switch
        isSelected={isDebugMode}
        onValueChange={handleModeChange}
        color="danger"
        size="sm"
        classNames={{
          wrapper: "bg-grey-500/50 transition-all duration-300",
          thumbIcon: "bg-white/50",
          base: "transition-all duration-300",
        }}
      >
        <div className="flex items-center gap-2 transition-opacity duration-200">
          <span className={`text-sm font-medium text-neutral-600 transition-all duration-200 ${
            transitionMode ? 'opacity-70' : 'opacity-100'
          }`}>
            {transitionMode ? 'Зберігається...' : 'Дебаг-режим'}
          </span>
          {isDebugMode && (
            <span className="bg-danger rounded px-1 py-0.5 text-white text-[9px] tracking-wider">
              УВІМКНЕНО
            </span>
          )}
        </div>
      </Switch>
    </div>
  );
};
