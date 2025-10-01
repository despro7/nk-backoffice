import { useState, useEffect } from 'react';
import NumberFlow, { NumberFlowGroup } from '@number-flow/react';

const CountdownTimer = () => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const nextDispatchTime = getNextDispatchTime(now);
      const difference = nextDispatchTime.getTime() - now.getTime();

      if (difference > 0) {
        const totalSeconds = Math.floor(difference / 1000);
        setSeconds(totalSeconds);
      } else {
        setSeconds(0);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const getNextDispatchTime = (now: Date) => {
    const dispatchDays = [1, 3, 5]; // Monday, Wednesday, Friday
    const dispatchHour = 16;
    const dispatchMinute = 0;

    const sortedDispatchTimes = dispatchDays.map(day => {
        const date = new Date(now);
        date.setHours(dispatchHour, dispatchMinute, 0, 0);
        const dayOfWeek = date.getDay();
        const diff = day - dayOfWeek;
        date.setDate(date.getDate() + diff);
        return date;
    })
    .flatMap(date => {
        const weekBefore = new Date(date);
        weekBefore.setDate(weekBefore.getDate() - 7);
        const weekAfter = new Date(date);
        weekAfter.setDate(weekAfter.getDate() + 7);
        return [weekBefore, date, weekAfter];
    })
    .filter(date => date.getTime() > now.getTime())
    .sort((a, b) => a.getTime() - b.getTime());

    return sortedDispatchTimes[0];
  };

  const hh = Math.floor(seconds / 3600);
  const mm = Math.floor((seconds % 3600) / 60);
  const ss = seconds % 60;

  return (
    <NumberFlowGroup>
      <div
        className="font-inter text-[22px] font-medium leading-[100%] flex items-baseline"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        <NumberFlow trend={-1} value={hh} format={{ minimumIntegerDigits: 2 }} />
        <NumberFlow
          prefix=":"
          trend={-1}
          value={mm}
          digits={{ 1: { max: 5 } }}
          format={{ minimumIntegerDigits: 2 }}
        />
        <NumberFlow
          prefix=":"
          trend={-1}
          value={ss}
          digits={{ 1: { max: 5 } }}
          format={{ minimumIntegerDigits: 2 }}
          animated={false}
        />
      </div>
    </NumberFlowGroup>
  );
};

export default CountdownTimer;