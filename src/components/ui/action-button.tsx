'use client';
/**
 * Button that calls a server action and shows the outcome inline.
 * Confirm-first for destructive or money-adjacent actions.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, type ButtonProps } from './index';
import type { ActionState } from '@/server/actions/clients';

export function ActionButton({
  action, confirm, onDone, children, ...props
}: Omit<ButtonProps, 'onClick'> & {
  action: () => Promise<ActionState>;
  confirm?: string;
  onDone?: (state: ActionState) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<ActionState | null>(null);

  function run() {
    if (confirm && !window.confirm(confirm)) return;
    startTransition(async () => {
      const result = await action();
      setFeedback(result);
      onDone?.(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" loading={pending} onClick={run} {...props}>
        {children}
      </Button>
      {feedback?.message ? (
        <span className={`max-w-xs text-[11px] leading-relaxed ${feedback.ok ? 'text-ok' : 'text-danger'}`}>
          {feedback.message}
          {feedback.hint ? <span className="block opacity-80">{feedback.hint}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
