import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { loginRequest, meRequest } from '../services/authApi';
import type { LoginCredentials } from '../services/authApi';
import type { Session, User } from '../services/session';

export interface UserState {
  session: Session | null;
  status: 'idle' | 'loading' | 'authenticated';
  error: string | null;
  requestId?: string;
}

const initialState: UserState = { session: null, status: 'idle', error: null };

export const verifySession = createAsyncThunk('user/verifySession', async (session: Session, { signal }) => meRequest(session, signal));

export const login = createAsyncThunk<Session, LoginCredentials, { state: { user: UserState }; rejectValue: string }>(
  'user/login',
  async (credentials, { signal, rejectWithValue }) => {
    try { return await loginRequest(credentials, signal); }
    catch (error) { return rejectWithValue(error instanceof Error ? error.message : 'Unable to sign in.'); }
  },
  { condition: (_, { getState }) => getState().user.status !== 'loading' },
);

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    profileUpdated: (state, action: { payload: { accessToken: string; user: User } }) => {
      if (state.session?.accessToken === action.payload.accessToken) state.session.user = action.payload.user;
    },
    passwordChanged: () => initialState,
    logout: () => initialState,
    logoutFailed: (state, action: { payload: string }) => { if (!state.session) state.error = action.payload; },
    sessionExpired: () => ({ ...initialState, error: 'Your session expired. Please sign in again.' }),
    clearLoginError: state => { state.error = null; },
  },
  extraReducers: builder => {
    builder.addCase(verifySession.rejected, (state, action) => {
      if (state.session?.accessToken !== action.meta.arg.accessToken || action.meta.aborted) return;
      state.session = null; state.status = 'idle';
      state.error = action.error.message || 'Unable to verify your session.';
    });
    builder.addCase(login.pending, (state, action) => {
      state.status = 'loading'; state.error = null; state.requestId = action.meta.requestId;
    }).addCase(login.fulfilled, (state, action) => {
      if (state.requestId !== action.meta.requestId) return;
      state.session = action.payload; state.status = 'authenticated'; state.requestId = undefined;
    }).addCase(login.rejected, (state, action) => {
      if (state.requestId !== action.meta.requestId) return;
      state.status = 'idle'; state.error = action.meta.aborted ? null : action.payload || 'Unable to sign in.';
      state.requestId = undefined;
    });
  },
});

export const { passwordChanged, profileUpdated, logout, logoutFailed, sessionExpired, clearLoginError } = userSlice.actions;
export default userSlice.reducer;
