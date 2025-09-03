import { useState, useEffect } from 'react';

const CountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const nextDispatchTime = getNextDispatchTime(now);
      const difference = nextDispatchTime.getTime() - now.getTime();

      if (difference > 0) {
        const totalHours = Math.floor(difference / (1000 * 60 * 60));
        const minutes = Math.floor((difference / 1000 / 60) % 60);
        const seconds = Math.floor((difference / 1000) % 60);
        setTimeLeft(
          `${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(
            2,
            '0'
          )}:${String(seconds).padStart(2, '0')}`
        );
      } else {
        setTimeLeft('00:00:00');
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

  return (
    <span className="font-inter text-[22px] font-medium leading-[100%]">
      {timeLeft}
    </span>
  );
};

export default CountdownTimer;