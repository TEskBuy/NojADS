'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Field, Input } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await createClient().auth
      .signInWithPassword({ email: email.trim(), password });

    if (signInError) {
      setLoading(false);
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Email ou palavra-passe incorretos. Verifique os dados e tente novamente.'
          : signInError.message === 'Email not confirmed'
            ? 'A conta ainda nao foi confirmada. Verifique o email de confirmacao.'
            : `Nao foi possivel iniciar sessao: ${signInError.message}`,
      );
      return;
    }

    router.push(params.get('redirect') ?? '/painel');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Iniciar sessao</CardTitle>
        </div>
      </CardHeader>
      <CardBody>
        <form onSubmit={onSubmit} className="space-y-4">
          {error ? <Alert tone="error" title="Nao foi possivel entrar">{error}</Alert> : null}

          <Field label="Email" required>
            <Input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" placeholder="nome@empresa.com"
            />
          </Field>

          <Field label="Palavra-passe" required>
            <Input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required autoComplete="current-password" placeholder="••••••••"
            />
          </Field>

          <Button type="submit" variant="primary" className="w-full" loading={loading}>
            Entrar
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between text-xs">
          <Link href="/recuperar-senha" className="text-muted hover:text-brand">
            Esqueci a palavra-passe
          </Link>
          <Link href="/registar" className="font-medium text-brand hover:underline">
            Criar conta
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Card><CardBody>A carregar…</CardBody></Card>}>
      <LoginForm />
    </Suspense>
  );
}
