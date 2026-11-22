// Configuración de autenticación (Better Auth).
//
// Métodos: email + contraseña, enlace mágico por email, Google y modo invitado (anónimo).
// • El plugin "jwt" expone /api/auth/jwks y /api/auth/token: el servidor de tiempo real
//   valida esos tokens sin consultar la base de datos.
// • El plugin "admin" añade roles y bloqueo de usuarios (panel de administración).
import 'server-only';
import { db } from '@quiz-rush/db';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { admin, anonymous, jwt, magicLink } from 'better-auth/plugins';
import { sendMagicLinkEmail } from './email';
import { createProfileForUser, randomGuestName, transferGuestData } from './profile-service';

const googleEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const appUrl =
  process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const auth = betterAuth({
  appName: 'Quiz_Rush',
  baseURL: appUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [appUrl],
  database: prismaAdapter(db, { provider: 'postgresql' }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },

  socialProviders: googleEnabled
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: 'select_account',
        },
      }
    : {},

  account: {
    // Permite vincular Google a una cuenta creada con el mismo email
    accountLinking: { enabled: true, trustedProviders: ['google'] },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 días
    updateAge: 60 * 60 * 24, // renueva la sesión una vez al día
    // Caché de la sesión en una cookie firmada: evita consultar la BD en cada petición
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },

  // La IP para los límites sale SOLO de la cabecera que pone nuestro proxy (ver lib/ratelimit.ts)
  advanced: {
    ipAddress: { ipAddressHeaders: [(process.env.CLIENT_IP_HEADER || 'x-real-ip').toLowerCase()] },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 10 },
      '/sign-up/email': { window: 60, max: 5 },
      '/sign-in/magic-link': { window: 60, max: 5 },
      '/sign-in/anonymous': { window: 60, max: 10 },
    },
  },

  databaseHooks: {
    user: {
      create: {
        // Cada usuario nuevo (incluidos los invitados) recibe su perfil y avatar
        after: async (user) => {
          await createProfileForUser(user as typeof user & { isAnonymous?: boolean | null });
        },
      },
    },
  },

  plugins: [
    anonymous({
      emailDomainName: 'guest.quizrush.local',
      generateName: () => randomGuestName(),
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        await transferGuestData(anonymousUser.user.id, newUser.user.id);
      },
    }),
    magicLink({
      expiresIn: 5 * 60,
      sendMagicLink: async ({ email, url }) => {
        await sendMagicLinkEmail(email, url);
      },
    }),
    admin(),
    jwt({
      jwt: {
        issuer: appUrl,
        audience: 'quiz-rush-realtime',
        expirationTime: '15m',
        // Solo lo imprescindible: el token viaja al servidor de tiempo real (nada de email)
        definePayload: ({ user }) => ({ name: user.name, isAnonymous: !!user.isAnonymous }),
      },
    }),
    // Debe ser el último: permite que las Server Actions establezcan cookies
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;

/** Proveedores habilitados (para mostrar u ocultar botones en el login). */
export const authProviders = { google: googleEnabled };
