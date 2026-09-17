'use client';

import { ActionForm, SubmitButton, fieldError, type ActionState } from './action-form';
import { Field, Input, Textarea } from '@/components/ui';
import type { BrandSettings } from '@/types/models';

export function BrandForm({
  action, clientId, brand,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  clientId: string;
  brand: BrandSettings | null;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      {(state) => (
        <>
          <input type="hidden" name="client_id" value={clientId} />

          <Field label="URL do logotipo" hint="Pode enviar o ficheiro no Creative Studio e colar aqui o URL."
            error={fieldError(state, 'logo_url')}>
            <Input name="logo_url" type="url" defaultValue={brand?.logo_url ?? ''} placeholder="https://" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cores principais" hint="Hexadecimais separados por virgula: #1A73E8, #0F172A"
              error={fieldError(state, 'primary_colors')}>
              <Input name="primary_colors" defaultValue={brand?.primary_colors?.join(', ') ?? ''} />
            </Field>
            <Field label="Cores secundarias" error={fieldError(state, 'secondary_colors')}>
              <Input name="secondary_colors" defaultValue={brand?.secondary_colors?.join(', ') ?? ''} />
            </Field>
          </div>

          {brand?.primary_colors?.length ? (
            <div className="flex flex-wrap gap-2">
              {[...brand.primary_colors, ...(brand.secondary_colors ?? [])].map((color) => (
                <span key={color} className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px]">
                  <span className="h-3 w-3 rounded-sm border border-line" style={{ background: color }} aria-hidden />
                  {color}
                </span>
              ))}
            </div>
          ) : null}

          <Field label="Tom de voz" hint="Ex.: proximo mas profissional, sem gírias, foco em confianca."
            error={fieldError(state, 'tone_of_voice')}>
            <Textarea name="tone_of_voice" rows={2} defaultValue={brand?.tone_of_voice ?? ''} />
          </Field>

          <Field label="Estilo visual" hint="Ex.: fotografia real, fundos claros, muito espaco branco."
            error={fieldError(state, 'visual_style')}>
            <Textarea name="visual_style" rows={2} defaultValue={brand?.visual_style ?? ''} />
          </Field>

          <Field label="Posicionamento" error={fieldError(state, 'positioning')}>
            <Textarea name="positioning" rows={2} defaultValue={brand?.positioning ?? ''} />
          </Field>

          <Field label="Audiencia da marca" error={fieldError(state, 'audience')}>
            <Textarea name="audience" rows={2} defaultValue={brand?.audience ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Palavras a privilegiar" hint="Separadas por virgula."
              error={fieldError(state, 'allowed_words')}>
              <Input name="allowed_words" defaultValue={brand?.allowed_words?.join(', ') ?? ''} />
            </Field>
            <Field label="Palavras proibidas" hint="A IA nunca as usa."
              error={fieldError(state, 'forbidden_words')}>
              <Input name="forbidden_words" defaultValue={brand?.forbidden_words?.join(', ') ?? ''} />
            </Field>
          </div>

          <Field label="Chamadas para acao preferidas" hint='Ex.: "Fale connosco", "Encomende hoje"'
            error={fieldError(state, 'calls_to_action')}>
            <Input name="calls_to_action" defaultValue={brand?.calls_to_action?.join(', ') ?? ''} />
          </Field>

          <div className="flex justify-end">
            <SubmitButton>Guardar marca</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
