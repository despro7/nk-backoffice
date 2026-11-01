import React, { useEffect, useRef } from 'react';
import { Tabs } from '@heroui/react';

interface Props {
  selectedKey: any;
  onSelectionChange: (key: any) => void;
  children: React.ReactNode;
  className?: string;
  [key: string]: any;
}

/** Ширина затухання країв і відступ, ближче якого активна вкладка прокручується до центру, px. */
const EDGE_FADE_PX = 32;

/** Затухання країв tabList там, де є вкладки за межами видимої області. */
function applyEdgeFade(tabList: HTMLElement) {
  const maxScroll = tabList.scrollWidth - tabList.clientWidth;
  const fadeLeft = tabList.scrollLeft > 1;
  const fadeRight = maxScroll - tabList.scrollLeft > 1;
  const mask =
    fadeLeft || fadeRight
      ? `linear-gradient(to right, ${fadeLeft ? 'transparent' : '#000'} 0, #000 ${EDGE_FADE_PX}px, #000 calc(100% - ${EDGE_FADE_PX}px), ${fadeRight ? 'transparent' : '#000'} 100%)`
      : '';
  tabList.style.maskImage = mask;
  tabList.style.webkitMaskImage = mask;
}

/** Активна вкладка біля краю (або за ним) — прокрутити, щоб вона стала по центру. */
function scrollActiveTabIntoView(tabList: HTMLElement, behavior: ScrollBehavior) {
  const tab = tabList.querySelector<HTMLElement>('[role="tab"][data-selected="true"]');
  if (!tab) return;
  const left = tab.offsetLeft - tabList.scrollLeft;
  const right = left + tab.offsetWidth;
  if (left >= EDGE_FADE_PX * 2 && right <= tabList.clientWidth - EDGE_FADE_PX * 2) return;
  tabList.scrollTo({ left: tab.offsetLeft - (tabList.clientWidth - tab.offsetWidth) / 2, behavior });
}

export default function PageTabs({ selectedKey, onSelectionChange, children, className, classNames, variant = 'solid', color = 'default', size = 'lg', ...rest }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tabList = wrapperRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (!tabList) return;
    const update = () => applyEdgeFade(tabList);
    update();
    tabList.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(tabList);
    return () => {
      tabList.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, []);

  const isFirstScroll = useRef(true);
  useEffect(() => {
    const tabList = wrapperRef.current?.querySelector<HTMLElement>('[role="tablist"]');
    if (!tabList) return;
    // Після кадру: HeroUI ставить data-selected на новій вкладці вже після рендеру.
    const frame = requestAnimationFrame(() => {
      scrollActiveTabIntoView(tabList, isFirstScroll.current ? 'auto' : 'smooth');
      isFirstScroll.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedKey]);

  return (
    // contents: обгортка лише для ref, на розкладку не впливає.
    <div ref={wrapperRef} className="contents">
      <Tabs
        selectedKey={selectedKey}
        onSelectionChange={onSelectionChange}
        variant={variant}
        color={color}
        size={size}
        className={className}
        classNames={
          color === 'default' && !classNames
            ? {
                // Не ширше за батька: зайві вкладки гортаються всередині tabList (HeroUI: overflow-x-scroll).
                base: "max-w-full",
                tabList: "gap-2 p-[6px] bg-gray-100 rounded-lg",
                cursor: `${color === 'primary' ? 'bg-primary' : 'bg-slate-600'} text-white shadow-sm rounded-md`,
                tab: "px-3 py-1.5 text-sm font-normal data-[hover-unselected=true]:opacity-100",
                tabContent: "group-data-[selected=true]:text-white text-neutral-500",
              }
            : classNames ?? undefined
        }

        {...rest}
      >
        {children}
      </Tabs>
    </div>
  );
}
