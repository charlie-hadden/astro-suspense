import { useState } from "react";

export function ReactCounter() {
  const [count, setCount] = useState(1);

  return (
    <button
      className="rounded border px-2 py-1"
      onClick={() => setCount((c) => c + 1)}
    >
      Click me: {count}
    </button>
  );
}
