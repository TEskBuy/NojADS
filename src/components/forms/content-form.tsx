'use client';

import { ActionForm, SubmitButton, fieldError, type ActionState } from './action-form';
import {
  Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea,
} from '@/components/ui';
import type { Content, SocialAccount } from '@/types/models';

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ContentForm({
  action, content, accounts, readOnly,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  content: Content;
  accounts: SocialAccount[];
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <Card>
        <CardHeader><div><CardTitle>Conteudo publicado</CardTitle></div></CardHeader>
        <CardBody className="space-y-3">
          <Alert tone="info">
            Conteudo ja publicado. O NojAds nao edita publicacoes existentes — a maioria das
            plataformas nao expoe essa operacao pela API oficial.
          </Alert>
          {content.title ? <p className="text-sm font-medium">{content.title}</p> : null}
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{content.body}</p>
          {content.hashtags.length ? (
            <p className="text-xs text-brand">{content.hashtags.map((h) => `#${h}`).join(' ')}</p>
          ) : null}
        </CardBody>
      </Card>
    );
  }

  return (
    <ActionForm action={action}>
      {(state) => (
        <Card>
          <CardHeader><div><CardTitle>Editar conteudo</CardTitle></div></CardHeader>
          <CardBody className="space-y-4">
            <input type="hidden" name="content_id" value={content.id} />
            <input type="hidden" name="platform" value={content.platform} />
            <input type="hidden" name="format" value={content.format} />
            <input type="hidden" name="timezone" value={content.timezone} />

            <Field label="Titulo" error={fieldError(state, 'title')}>
              <Input name="title" defaultValue={content.title ?? ''} />
            </Field>

            <Field label="Texto da publicacao" required error={fieldError(state, 'body')}>
              <Textarea name="body" rows={10} defaultValue={content.body ?? ''} required />
            </Field>

            <Field label="Hashtags" hint="Separadas por espaco ou virgula. O cardinal e opcional."
              error={fieldError(state, 'hashtags')}>
              <Input name="hashtags" defaultValue={content.hashtags.join(' ')} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Chamada para acao" error={fieldError(state, 'call_to_action')}>
                <Input name="call_to_action" defaultValue={content.call_to_action ?? ''} />
              </Field>
              <Field label="Link" error={fieldError(state, 'link_url')}>
                <Input name="link_url" type="url" defaultValue={content.link_url ?? ''} />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Conta de destino" required error={fieldError(state, 'social_account_id')}>
                <Select name="social_account_id" defaultValue={content.social_account_id ?? ''} required>
                  <option value="">Escolha uma conta</option>
                  {accounts
                    .filter((a) => a.platform === content.platform)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name ?? a.username ?? a.external_id}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Publicar em" hint={`Hora local de ${content.timezone}.`}
                error={fieldError(state, 'scheduled_for')}>
                <Input name="scheduled_for" type="datetime-local"
                  defaultValue={toLocalInput(content.scheduled_for)} />
              </Field>
            </div>

            <div className="flex justify-end">
              <SubmitButton>Guardar (cria nova versao)</SubmitButton>
            </div>
          </CardBody>
        </Card>
      )}
    </ActionForm>
  );
}
