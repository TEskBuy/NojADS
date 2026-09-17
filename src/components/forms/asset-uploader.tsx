'use client';
/** Uploads media through the API route, which enforces authorisation and limits. */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { Alert, Button, Field, Select } from '@/components/ui';

export function AssetUploader({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [area, setArea] = useState('content');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; hint?: string } | null>(null);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;

    setBusy(true);
    setResult(null);

    const body = new FormData();
    body.set('client_id', clientId);
    body.set('area', area);
    body.set('file', file);

    try {
      const response = await fetch('/api/assets/upload', { method: 'POST', body });
      const payload = await response.json();
      if (!response.ok) {
        setResult({
          ok: false,
          message: payload?.error?.message ?? 'Nao foi possivel enviar o ficheiro.',
          hint: payload?.error?.hint,
        });
      } else {
        setResult({ ok: true, message: 'Ficheiro enviado.' });
        setFile(null);
        router.refresh();
      }
    } catch (err) {
      setResult({ ok: false, message: `Falha de rede: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={upload} className="space-y-3">
      {result ? (
        <Alert tone={result.ok ? 'success' : 'error'} title={result.ok ? 'Enviado' : 'Nao foi possivel enviar'}>
          <p>{result.message}</p>
          {result.hint ? <p className="mt-1 opacity-90">{result.hint}</p> : null}
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Destino">
          <Select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="content">Conteudo</option>
            <option value="ads">Anuncios</option>
            <option value="videos">Videos</option>
            <option value="logos">Logotipos</option>
          </Select>
        </Field>
        <Field label="Ficheiro">
          <input
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-xs file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs"
          />
        </Field>
      </div>

      <Button type="submit" variant="primary" icon={Upload} loading={busy} disabled={!file}>
        Enviar
      </Button>
    </form>
  );
}
