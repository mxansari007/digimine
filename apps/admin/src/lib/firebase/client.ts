"use client";

// Re-export the shared Firebase client from @digimine/config so the admin
// app uses the same singleton (and the same emulator wiring) as the web
// app. Previously this file initialised its own Firebase app without
// emulator hooks, which meant admin sign-in always hit the real Firebase
// project — seed users created in the emulator were invisible, and login
// failed with "Invalid email or password" against localhost.
export { app, auth, db, storage } from "@digimine/config";
