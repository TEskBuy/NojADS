'use client';
/**
 * Form wrapper for server actions.
 *
 * Renders the action's result the way the error contract expects: what failed,
 * why, and what to do — never a bare "Erro."
 */
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert, Button, type ButtonProps } from '@/components/ui';
import type { ActionState } from '@/server/actions/clients';

export type { ActionState };

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" loading={pending} {...props}>
      {children}
    </Button>
  );
}

export function ActionForm({
  action, children, className, initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
  className?: string;
  initial?: ActionState;
}) {
  const [state, formAction] = useActionState(action, initial ?? { ok: false });

  return (
    <form action={formAction} className={className}>
      {state.message ? (
        <Alert
          tone={state.ok ? 'success' : 'error'}
          title={state.ok ? 'Guardado' : 'Nao foi possivel guardar'}
          className="mb-4"
        >
          <p>{state.message}</p>
          {state.hint ? <p className="mt-1 opacity-90">{state.hint}</p> : null}
          {state.code ? <p className="mt-1 font-mono text-[10px] opacity-70">Codigo: {state.code}</p> : null}
        </Alert>
      ) : null}
      {typeof children === 'function' ? children(state) : children}
    </form>
  );
}

/** First error for a field, if the action returned one. */
export function fieldError(state: ActionState, name: string): string | undefined {
  return state.fields?.[name]?.[0];
}
