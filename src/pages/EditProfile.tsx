import './EditProfile.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { changePasswordRequest, meRequest, updateProfileRequest } from '../services/authApi';
import { passwordChanged, profileUpdated } from '../store/userSlice';

export default function EditProfile() {
  const session = useAppSelector((state) => state.user.session);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const [name, setName] = useState(session?.user.name ?? '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [user, setUser] = useState(session?.user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const currentUser = await meRequest(session, controller.signal);
      if (!controller.signal.aborted) {
        setUser(currentUser);
        setName(currentUser.name ?? '');
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : 'Unable to load profile.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      request.current?.abort();
    };
  }, [load]);

  const save = async () => {
    const current = sessionRef.current;
    if (!current || saving || loading || changingPassword) {
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await updateProfileRequest(current, name, controller.signal);
      if (controller.signal.aborted || sessionRef.current?.accessToken !== current.accessToken) {
        return;
      }
      setUser(updated);
      setName(updated.name ?? '');
      dispatch(profileUpdated({ accessToken: current.accessToken, user: updated }));
      setSuccess('Profile updated successfully.');
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(error instanceof Error ? error.message : 'Unable to update profile.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setSaving(false);
      }
    }
  };
  const passwordValid =
    currentPassword.length > 0 &&
    currentPassword.length <= 1024 &&
    newPassword.length >= 12 &&
    newPassword.length <= 1024 &&
    currentPassword !== newPassword &&
    newPassword === confirmPassword;
  const changePassword = async () => {
    const current = sessionRef.current;
    if (!current || !passwordValid || changingPassword || saving || loading) {
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setChangingPassword(true);
    setPasswordError('');
    try {
      await changePasswordRequest(current, currentPassword, newPassword, controller.signal);
      if (controller.signal.aborted || sessionRef.current?.accessToken !== current.accessToken) {
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      dispatch(passwordChanged());
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (error) {
      if (!controller.signal.aborted) {
        setPasswordError(error instanceof Error ? error.message : 'Unable to change password.');
      }
    } finally {
      if (!controller.signal.aborted) {
        setChangingPassword(false);
      }
    }
  };
  const nameValid = name.trim().length >= 2 && name.trim().length <= 100;

  const displayName = user?.name || user?.username || 'Your account';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <Stack gap="lg" className="profile-page">
      <Group justify="space-between">
        <Title order={2}>Profile</Title>
        <Button
          variant="subtle"
          leftSection={<RefreshCw size={16} />}
          loading={loading}
          disabled={saving || changingPassword}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </Group>
      {error && (
        <Alert color="red" title="Profile request failed">
          {error}
        </Alert>
      )}
      {success && <Alert color="green">{success}</Alert>}
      <div className="profile-layout">
        <Paper withBorder radius="md" className="profile-account" aria-busy={loading}>
          <div className="profile-identity">
            <Avatar size={64} radius="xl" color="teal">
              {initials}
            </Avatar>
            <Title order={3}>{displayName}</Title>
            {user?.role && <Badge variant="light">{user.role}</Badge>}
          </div>
          <dl className="profile-details">
            <div>
              <dt>Username</dt>
              <dd>{user?.username || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Email address</dt>
              <dd>{user?.email || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Account ID</dt>
              <dd>{user?.id == null ? 'Not provided' : String(user.id)}</dd>
            </div>
          </dl>
        </Paper>
        <div className="profile-forms">
          <Paper withBorder p="xl" radius="md" aria-busy={loading}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <Stack gap="lg">
                <Title order={3}>Profile details</Title>
                <div className="profile-name-field">
                  <TextInput
                    label="Display name"
                    value={name}
                    onChange={(event) => {
                      setName(event.currentTarget.value);
                      setSuccess('');
                    }}
                    required
                    maxLength={100}
                    disabled={loading || saving || changingPassword}
                    error={!nameValid && name.length > 0 ? 'Use 2-100 characters.' : undefined}
                  />
                </div>
                <Group className="profile-actions">
                  <Button
                    type="submit"
                    loading={saving}
                    disabled={
                      loading ||
                      changingPassword ||
                      !nameValid ||
                      name.trim() === (user?.name ?? '')
                    }
                  >
                    Save profile
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
          <Paper withBorder p="xl" radius="md">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void changePassword();
              }}
            >
              <Stack gap="md">
                <Title order={3}>Change password</Title>
                <Text size="sm" c="dimmed">
                  Use 12-1024 characters. You will need to sign in again.
                </Text>
                {passwordError && (
                  <Alert color="red" title="Password change failed">
                    {passwordError}
                  </Alert>
                )}
                <Stack gap="md" className="profile-password-fields">
                  <PasswordInput
                    label="Current password"
                    autoComplete="current-password"
                    required
                    maxLength={1024}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.currentTarget.value)}
                    disabled={changingPassword}
                  />
                  <PasswordInput
                    label="New password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={1024}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.currentTarget.value)}
                    disabled={changingPassword}
                    error={
                      newPassword && newPassword === currentPassword
                        ? 'Choose a different password.'
                        : newPassword && newPassword.length < 12
                          ? 'Use at least 12 characters.'
                          : undefined
                    }
                  />
                  <PasswordInput
                    label="Confirm new password"
                    autoComplete="new-password"
                    required
                    maxLength={1024}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.currentTarget.value)}
                    disabled={changingPassword}
                    error={
                      confirmPassword && confirmPassword !== newPassword
                        ? 'Passwords do not match.'
                        : undefined
                    }
                  />
                </Stack>
                <Group className="profile-actions">
                  <Button
                    type="submit"
                    loading={changingPassword}
                    disabled={!passwordValid || saving || loading}
                  >
                    Update password
                  </Button>
                </Group>
              </Stack>
            </form>
          </Paper>
        </div>
      </div>
    </Stack>
  );
}
