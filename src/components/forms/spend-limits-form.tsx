'use client';

import { ActionForm, SubmitButton, fieldError, type ActionState } from './action-form';
import { Alert, Checkbox, Field, Input, Select } from '@/components/ui';
import type { SpendLimits } from '@/types/models';

const CURRENCIES = ['USD', 'EUR', 'AOA', 'BRL', 'ZAR', 'GBP'];

export function SpendLimitsForm({
  action, clientId, limits,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  clientId: string;
  limits: SpendLimits | null;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      {(state) => (
        <>
          <input type="hidden" name="client_id" value={clientId} />

          <Field label="Moeda dos limites" error={fieldError(state, 'currency')}>
            <Select name="currency" defaultValue={limits?.currency ?? 'USD'}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Limite diario" hint="Vazio = sem limite." error={fieldError(state, 'daily_limit')}>
              <Input name="daily_limit" type="number" min={0} step="0.01"
                defaultValue={limits?.daily_limit ?? ''} />
            </Field>
            <Field label="Limite mensal" error={fieldError(state, 'monthly_limit')}>
              <Input name="monthly_limit" type="number" min={0} step="0.01"
                defaultValue={limits?.monthly_limit ?? ''} />
            </Field>
            <Field label="Limite por campanha" error={fieldError(state, 'per_campaign_limit')}>
              <Input name="per_campaign_limit" type="number" min={0} step="0.01"
                defaultValue={limits?.per_campaign_limit ?? ''} />
            </Field>
            <Field label="Limite por transacao" error={fieldError(state, 'per_transaction_limit')}>
              <Input name="per_transaction_limit" type="number" min={0} step="0.01"
                defaultValue={limits?.per_transaction_limit ?? ''} />
            </Field>
          </div>

          <Field label="Exigir aprovacao acima de"
            hint="Acima deste valor, o pagamento passa por aprovacao explicita."
            error={fieldError(state, 'require_approval_above')}>
            <Input name="require_approval_above" type="number" min={0} step="0.01"
              defaultValue={limits?.require_approval_above ?? ''} />
          </Field>

          <Field
            label="Aumento maximo de orcamento pela automacao (%)"
            hint="0 significa que a IA nunca aumenta orcamentos sozinha — apenas propoe."
            error={fieldError(state, 'ai_max_budget_increase_pct')}
          >
            <Input name="ai_max_budget_increase_pct" type="number" min={0} max={100} step="1"
              defaultValue={limits?.ai_max_budget_increase_pct ?? 0} />
          </Field>

          <Checkbox
            name="block_automatic_payments"
            label="Bloquear pagamentos automaticos"
            description="Recomendado. Com isto ativo, nenhuma tarefa automatica pode desencadear uma cobranca."
            defaultChecked={limits?.block_automatic_payments ?? true}
          />

          <Alert tone="info">
            Estes limites sao verificados no servidor antes de qualquer cobranca ou publicacao de
            campanha. Nao dependem da interface.
          </Alert>

          <div className="flex justify-end">
            <SubmitButton>Guardar limites</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
