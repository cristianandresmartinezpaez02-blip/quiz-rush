// Cliente de autenticación para componentes del navegador.
'use client';
import { anonymousClient, magicLinkClient, adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [anonymousClient(), magicLinkClient(), adminClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
