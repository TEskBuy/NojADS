'use client';

import { ActionForm, SubmitButton, fieldError, type ActionState } from './action-form';
import { Field, Input, Select } from '@/components/ui';
import type { Profile } from '@/types/models';

const TIMEZONES = [
  'Africa/Luanda', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Maputo',
  'Europe/Lisbon', 'Europe/London', 'America/Sao_Paulo', 'UTC',
];

const ROLE_LABEL = { ADMIN: 'Administrador', MANAGER: 'Gestor', CLIENT: 'Cliente' } as const;

export function ProfileForm({
  action, profile,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  profile: Profile;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      {(state) => (
        <>
          <Field label="Email" hint="O email nao pode ser alterado aqui.">
            <Input value={profile.email} disabled readOnly />
          </Field>

          <Field label="Papel" hint="Apenas um administrador pode alterar papeis.">
            <Input value={ROLE_LABEL[profile.role]} disabled readOnly />
          </Field>

          <Field label="Nome completo" required error={fieldError(state, 'full_name')}>
            <Input name="full_name" defaultValue={profile.full_name ?? ''} required />
          </Field>

          <Field label="Telefone">
            <Input name="phone" defaultValue={profile.phone ?? ''} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fuso horario">
              <Select name="timezone" defaultValue={profile.timezone}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </Select>
            </Field>
            <Field label="Idioma">
              <Select name="locale" defaultValue={profile.locale}>
                <option value="pt">Portugues</option>
                <option value="en">Ingles</option>
              </Select>
            </Field>
          </div>

          <div className="flex justify-end">
            <SubmitButton>Guardar perfil</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
