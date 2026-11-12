import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { Link, Navigate } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { signupRequest } from '../services/authApi';

export default function Signup() {
  const session = useAppSelector(state => state.user.session);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  if (session) return <Navigate to="/dashboard" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      await signupRequest({ username, name, password });
      setSuccess(true); setPassword(''); setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account.');
    } finally { setLoading(false); }
  }

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="lg" w="100%" maw={440}>
        <Stack gap="md">
          <div><Title order={2}>Create an account</Title><Text c="dimmed" size="sm">Busbar Monitoring — user access</Text></div>
          {success ? (
            <><Alert color="green">Account created successfully. You can now sign in.</Alert><Button component={Link} to="/login">Go to sign in</Button></>
          ) : (
            <form onSubmit={submit}>
              <Stack gap="md">
                {error && <Alert color="red" role="alert">{error}</Alert>}
                <TextInput label="Username" autoComplete="username" required minLength={3} maxLength={64} value={username} onChange={e => setUsername(e.currentTarget.value)} disabled={loading} />
                <TextInput label="Display name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e => setName(e.currentTarget.value)} disabled={loading} />
                <PasswordInput label="Password" autoComplete="new-password" required minLength={12} value={password} onChange={e => setPassword(e.currentTarget.value)} disabled={loading} />
                <PasswordInput label="Confirm password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.currentTarget.value)} disabled={loading} />
                <Button type="submit" loading={loading}>Sign up</Button>
                <Text size="sm">Already registered? <Link to="/login">Sign in</Link></Text>
              </Stack>
            </form>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
