import { Check, CircleAlert, Loader2 } from "lucide-react";

// The tools the AI assistant is running (or ran) for a reply.
const AiToolSteps = ({ steps }) => {
  if (!steps?.length) return null;

  return (
    <ul className="flex flex-col gap-1 mb-2 text-xs opacity-80">
      {steps.map((step) => (
        <li key={step.id} className="flex items-center gap-1.5">
          {step.status === "running" && <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden="true" />}
          {step.status === "done" && <Check className="size-3.5 shrink-0" aria-hidden="true" />}
          {step.status === "error" && <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />}
          <span>
            {step.label}
            {step.status === "done" && typeof step.resultCount === "number" && ` · ${step.resultCount} found`}
            {step.status === "error" && " · couldn't look this up"}
          </span>
        </li>
      ))}
    </ul>
  );
};

export default AiToolSteps;
