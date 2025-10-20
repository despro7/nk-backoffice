import { useEffect } from 'react';

/**
 * Утіліти для плавного скролу
 */

export interface SmoothScrollOptions {
  duration?: number; // Тривалість анімації в мілісекундах (за замовчуванням 1000)
  delay?: number; // Затримка перед початком скролу в мілісекундах (за замовчуванням 300)
  offset?: number; // Відступ від цільової позиції в пікселях (за замовчуванням 50)
  position?: 'center' | 'top' | 'bottom'; // Позиція на екрані (за замовчуванням 'center')
}

/**
 * Плавно прокручує до вказаного елемента
 * @param element - DOM елемент або React ref
 * @param options - Параметри скролу
 */
export function smoothScrollToElement(
  element: HTMLElement | React.RefObject<HTMLElement> | null,
  options: SmoothScrollOptions = {}
): void {
  const {
    duration = 1000,
    delay = 300,
    offset = 50,
    position = 'center'
  } = options;

  // Отримуємо DOM елемент
  const targetElement: HTMLElement | null = element && 'current' in element ? element.current : element as HTMLElement;
  
  if (!targetElement) {
    console.warn('[smoothScrollToElement] Елемент не знайдено');
    return;
  }

  // Затримка для рендерингу
  setTimeout(() => {
    // Отримуємо позицію елемента та поточну позицію скролу
    const elementRect = targetElement.getBoundingClientRect();
    const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // Вираховуємо цільову позицію залежно від position
    let targetScrollTop: number;
    
    switch (position) {
      case 'center':
        targetScrollTop = currentScrollTop + elementRect.top - (window.innerHeight / 2) + (elementRect.height / 2);
        break;
      case 'top':
        targetScrollTop = currentScrollTop + elementRect.top - offset;
        break;
      case 'bottom':
      default:
        targetScrollTop = currentScrollTop + elementRect.top - window.innerHeight + elementRect.height + offset;
        break;
    }
    
    // Початкові параметри анімації
    const startScrollTop = currentScrollTop;
    const distance = targetScrollTop - startScrollTop;
    const startTime = performance.now();

    // Функція плавної анімації (easing)
    const easeInOutCubic = (t: number): number => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    // Анімаційна функція
    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const easedProgress = easeInOutCubic(progress);
      const currentPosition = startScrollTop + (distance * easedProgress);
      
      window.scrollTo(0, currentPosition);
      
      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  }, delay);
}

/**
 * Хук для плавного скролу до елемента при зміні умови
 * @param condition - Умова, при якій потрібно скролити
 * @param elementRef - React ref елемента
 * @param options - Параметри скролу
 */
export function useSmoothScrollOnCondition(
  condition: boolean,
  elementRef: React.RefObject<HTMLElement>,
  options: SmoothScrollOptions = {}
): void {
  useEffect(() => {
    if (condition) {
      smoothScrollToElement(elementRef, options);
    }
  }, [condition, elementRef, JSON.stringify(options)]); // Стабілізуємо options через JSON
}
