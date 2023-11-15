import { useState } from "react";

export function ReactCounter() {
  const [count, setCount] = useState(1);

  return (
    <button
      className="border px-2 py-1 rounded"
      onClick={() => setCount((c) => c + 1)}
    >
      Click me: {count}
    </button>
  )
}
