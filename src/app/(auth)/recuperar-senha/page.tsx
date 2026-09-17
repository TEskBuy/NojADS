'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Field, Input } from '@/components/ui';

export default function RecoverPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: resetError } = await createClient().auth
      .resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/nova-senha` });

    setLoading(false);
    if (resetError) { setError(resetError.message); return; }
    setSent(true);
  }

  return (
    <Card>
      <CardHeader><div><CardTitle>Recuperar palavra-passe</CardTitle></div></CardHeader>
      <CardBody>
        {sent ? (
          <Alert tone="success" title="Email enviado">
            Se existir uma conta com esse endereco, enviamos um link para definir uma nova
            palavra-passe. O link e valido por 1 hora.
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error ? <Alert tone="error" title="Nao foi possivel enviar">{error}</Alert> : null}
            <Field label="Email da conta" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Button type="submit" variant="primary" className="w-full" loading={loading}>
              Enviar link de recuperacao
            </Button>
          </form>
        )}
        <p className="mt-4 text-center text-xs">
          <Link href="/login" className="text-muted hover:text-brand">Voltar ao inicio de sessao</Link>
        </p>
      </CardBody>
    </Card>
  );
}
