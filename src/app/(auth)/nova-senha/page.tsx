'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Field, Input } from '@/components/ui';

export default function NewPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) { setError('A palavra-passe tem de ter pelo menos 8 caracteres.'); return; }
    if (password !== confirm) { setError('As palavras-passe nao coincidem.'); return; }

    setLoading(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(
        `Nao foi possivel definir a nova palavra-passe: ${updateError.message}. ` +
        'O link de recuperacao pode ter expirado — peca um novo.',
      );
      return;
    }
    router.push('/painel');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader><div><CardTitle>Definir nova palavra-passe</CardTitle></div></CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <Alert tone="error" title="Erro">{error}</Alert> : null}
          <Field label="Nova palavra-passe" hint="Minimo 8 caracteres." required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          </Field>
          <Field label="Confirmar" required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </Field>
          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Guardar
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
