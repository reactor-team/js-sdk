"use client";

import { cn, Panel } from "./ui";

// Live readout of the model's drag pointer — the raw `set_pointer` fields as
// the model echoes them back in every `state_update` snapshot. Dragging on
// the edited output streams set_pointer(x, y, active); what renders here is
// the round trip, not the local gesture, so the numbers are exactly what the
// model is steering with. Available in every source mode.
export function PointerPanel({
  x,
  y,
  active,
}: {
  x: number;
  y: number;
  active: boolean;
}) {
  return (
    <Panel label="Pointer">
      {/* Named after set_pointer's params (x, y, active); state_update
          echoes the same values as pointer_x / pointer_y / pointer_active. */}
      <dl className="grid grid-cols-3 gap-2 font-mono text-xs">
        <Field name="x" value={x.toFixed(3)} live={active} />
        <Field name="y" value={y.toFixed(3)} live={active} />
        <Field name="active" value={active ? "true" : "false"} live={active} />
      </dl>
      <p className="mt-2 text-xs text-zinc-600">
        Drag on the edited output to steer the subject. Sent as{" "}
        <code className="text-zinc-500">set_pointer</code>, echoed back here via{" "}
        <code className="text-zinc-500">state_update</code>.
      </p>
    </Panel>
  );
}

function Field({
  name,
  value,
  live,
}: {
  name: string;
  value: string;
  live: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950/60 px-2 py-1.5">
      <dt className="truncate text-[10px] tracking-wide text-zinc-600">
        {name}
      </dt>
      <dd
        className={cn(
          "tabular-nums transition-colors",
          live ? "text-brand" : "text-zinc-300",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
