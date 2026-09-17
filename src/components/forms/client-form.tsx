'use client';

import { ActionForm, SubmitButton, fieldError, type ActionState } from './action-form';
import { Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea } from '@/components/ui';
import type { Client } from '@/types/models';

const TIMEZONES = [
  'Africa/Luanda', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Maputo',
  'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'America/Sao_Paulo', 'UTC',
];

const CURRENCIES = ['AOA', 'USD', 'EUR', 'BRL', 'ZAR', 'MZN', 'GBP'];

export function ClientForm({
  action, client, submitLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  client?: Client;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      {(state) => (
        <>
          {client ? <input type="hidden" name="client_id" value={client.id} /> : null}

          <Card>
            <CardHeader><div><CardTitle>Identificacao</CardTitle></div></CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" required error={fieldError(state, 'name')}>
                <Input name="name" defaultValue={client?.name} required maxLength={120} />
              </Field>
              <Field label="Empresa" error={fieldError(state, 'company')}>
                <Input name="company" defaultValue={client?.company ?? ''} />
              </Field>
              <Field label="Categoria / setor" hint="Ex.: restauracao, imobiliario, retalho."
                error={fieldError(state, 'category')} className="sm:col-span-1">
                <Input name="category" defaultValue={client?.category ?? ''} />
              </Field>
              <Field label="Website" error={fieldError(state, 'website')}>
                <Input name="website" type="url" placeholder="https://" defaultValue={client?.website ?? ''} />
              </Field>
              <Field label="Descricao do negocio" className="sm:col-span-2"
                hint="Quanto mais concreto, menos generico fica o conteudo gerado pela IA."
                error={fieldError(state, 'description')}>
                <Textarea name="description" rows={3} defaultValue={client?.description ?? ''} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Publico e oferta</CardTitle></div></CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Publico-alvo" className="sm:col-span-2"
                hint="Quem compra, que idade, que problema resolve."
                error={fieldError(state, 'target_audience')}>
                <Textarea name="target_audience" rows={2} defaultValue={client?.target_audience ?? ''} />
              </Field>
              <Field label="Produtos" hint="Separados por virgula." error={fieldError(state, 'products')}>
                <Input name="products" defaultValue={client?.products?.join(', ') ?? ''} />
              </Field>
              <Field label="Servicos" hint="Separados por virgula." error={fieldError(state, 'services')}>
                <Input name="services" defaultValue={client?.services?.join(', ') ?? ''} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Contactos e localizacao</CardTitle></div></CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Email de contacto" error={fieldError(state, 'contact_email')}>
                <Input name="contact_email" type="email" defaultValue={client?.contact_email ?? ''} />
              </Field>
              <Field label="Telefone" error={fieldError(state, 'contact_phone')}>
                <Input name="contact_phone" defaultValue={client?.contact_phone ?? ''} />
              </Field>
              <Field label="Pais" error={fieldError(state, 'country')}>
                <Input name="country" defaultValue={client?.country ?? 'Angola'} />
              </Field>
              <Field label="Cidade" error={fieldError(state, 'city')}>
                <Input name="city" defaultValue={client?.city ?? ''} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Operacao</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  O fuso horario aqui definido e o que as tarefas usam por omissao — &quot;todos os
                  dias as 09:00&quot; passa a significar 09:00 onde o cliente esta.
                </p>
              </div>
            </CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Fuso horario" required error={fieldError(state, 'timezone')}>
                <Select name="timezone" defaultValue={client?.timezone ?? 'Africa/Luanda'}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </Select>
              </Field>
              <Field label="Moeda" hint="Moeda de referencia do cliente para relatorios."
                error={fieldError(state, 'currency')}>
                <Select name="currency" defaultValue={client?.currency ?? 'AOA'}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Idioma" error={fieldError(state, 'language')}>
                <Select name="language" defaultValue={client?.language ?? 'pt'}>
                  <option value="pt">Portugues</option>
                  <option value="en">Ingles</option>
                  <option value="es">Espanhol</option>
                  <option value="fr">Frances</option>
                </Select>
              </Field>
              <Field label="Estado" error={fieldError(state, 'status')}>
                <Select name="status" defaultValue={client?.status ?? 'ACTIVE'}>
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                  <option value="ARCHIVED">Arquivado</option>
                </Select>
              </Field>
              <Field
                label="Modo de trabalho por omissao"
                className="sm:col-span-2"
                hint="Aprovacao: tudo passa por si antes de sair. Automatico: o NojAds publica sozinho."
                error={fieldError(state, 'default_task_mode')}
              >
                <Select name="default_task_mode" defaultValue={client?.default_task_mode ?? 'APPROVAL'}>
                  <option value="APPROVAL">Aprovacao — rever antes de publicar</option>
                  <option value="AUTOMATIC">Automatico — publicar sem revisao</option>
                </Select>
              </Field>
            </CardBody>
          </Card>

          <div className="flex justify-end">
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
