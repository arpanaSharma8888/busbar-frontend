import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Center, Checkbox, Paper, PasswordInput, Stack, Text, TextInput, ThemeIcon, Title } from '@mantine/core';
import { Zap } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { clearLoginError, login } from '../store/userSlice';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const { session, status, error } = useAppSelector(state => state.user);
  const dispatch = useAppDispatch();
  const location = useLocation();
  const from: unknown = location.state?.from;
  const destination = typeof from === 'string' && /^\/(?!\/)/.test(from)
    && !from.includes('\\') && !/^\/login(?:[/?#]|$)/.test(from) ? from : '/dashboard';
  if (session) return <Navigate to={destination} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password || status === 'loading') return;
    await dispatch(login({ username, password, remember }));
    setPassword('');
  }

  return (
    <Center mih="100dvh" p="md">
      <Paper withBorder shadow="sm" p="xl" radius="lg" w="100%" maw={440}>
        <form onSubmit={submit}>
          <Stack gap="md">
            <ThemeIcon size={48} radius="md" variant="light"><Zap size={28} /></ThemeIcon>
            <div><Title order={2}>Busbar Monitoring</Title><Text c="dimmed" size="sm">Sign in to your monitoring workspace</Text></div>
            {location.state?.passwordChanged === true && <Alert color="green">Password changed successfully. Please sign in again.</Alert>}
            {error && <Alert color="red" title="Sign-in failed" role="alert">{error}</Alert>}
            <TextInput label="Username" placeholder="Enter your username" autoComplete="username" required value={username} disabled={status === 'loading'} onChange={event => { setUsername(event.currentTarget.value); dispatch(clearLoginError()); }} />
            <PasswordInput label="Password" placeholder="Enter your password" autoComplete="current-password" required value={password} disabled={status === 'loading'} onChange={event => { setPassword(event.currentTarget.value); dispatch(clearLoginError()); }} />
            <Checkbox label="Remember me on this device" checked={remember} onChange={event => setRemember(event.currentTarget.checked)} disabled={status === 'loading'} />
            <Button type="submit" loading={status === 'loading'} disabled={!username.trim() || !password}>Sign in</Button>
            <Text size="xs" c="dimmed">Forgot your password? Contact your administrator.</Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
