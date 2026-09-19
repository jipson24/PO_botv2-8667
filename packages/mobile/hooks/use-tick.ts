import { useEffect, useState } from "react";

/** Перерисовывает компонент каждые `ms` — для живых таймеров экспирации. */
export function useTick(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
