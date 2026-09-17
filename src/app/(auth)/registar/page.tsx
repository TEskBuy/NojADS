'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A palavra-passe tem de ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As palavras-passe nao coincidem.');
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/painel`,
      },
    });
    setLoading(false);

    if (signUpError) {
      setError(`Nao foi possivel criar a conta: ${signUpError.message}`);
      return;
    }

    if (data.session) {
      router.push('/painel');
      router.refresh();
      return;
    }
    setNotice(
      'Conta criada. Verifique o seu email para confirmar o endereco antes de iniciar sessao.',
    );
  }

  return (
    <Card>
      <CardHeader><div><CardTitle>Criar conta</CardTitle></div></CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <Alert tone="error" title="Erro no registo">{error}</Alert> : null}
          {notice ? <Alert tone="success" title="Conta criada">{notice}</Alert> : null}

          <Alert tone="info">
            A primeira conta criada nesta instalacao recebe automaticamente o papel
            ADMIN. As seguintes ficam como CLIENT ate um administrador alterar.
          </Alert>

          <Field label="Nome completo" required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </Field>
          <Field label="Palavra-passe" hint="Minimo 8 caracteres." required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
          </Field>
          <Field label="Confirmar palavra-passe" required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </Field>

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Criar conta
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted">
          Ja tem conta?{' '}
          <Link href="/login" className="font-medium text-brand hover:underline">Iniciar sessao</Link>
        </p>
      </CardBody>
    </Card>
  );
}
