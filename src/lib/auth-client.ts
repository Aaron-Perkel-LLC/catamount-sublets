"use client";

import { adminClient, emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** The browser side of better-auth. Server code uses getAuth() instead. */
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), adminClient()],
});
