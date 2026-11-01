# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

## Owner security dashboard

The authenticated account `emmykul89@gmail.com` can open **Super Admin Dashboard** from the client profile settings. Access is also checked by Supabase row-level security and by the server-side email function; a client-side route check alone does not grant access.

To install or update its database policies and audit triggers, run `npx supabase db push`. To deploy dashboard email delivery, run `npx supabase functions deploy admin-send-email`. The Edge Function requires the Supabase project secrets `RESEND_API_KEY` and (optionally) `RESEND_FROM_EMAIL`; never put provider or service-role keys in Expo app code.

Scheduled pet-care tips require the same dedicated `PET_TIPS_CRON_SECRET` Edge Function secret and `pet_tips_cron_secret` Vault secret. Configure both before applying the migration that creates the Monday/Wednesday/Friday 09:00 UTC schedule. The sender supports an authenticated `{ "dry_run": true }` request for checking eligible animal profiles and push targets without creating notifications or sending pushes.

## NIN-verified account registration

Sign-up uses Prembly's NIN Basic endpoint through the `verify-nin` Supabase Edge Function. Apply the database migration and deploy the function, then configure a newly rotated Prembly Secret Key as the Supabase Edge Function secret `PREMBLY_SECRET_KEY`. Never add the Prembly Secret Key to Expo environment variables, app code, or client requests.

```bash
npx supabase db push
npx supabase secrets set "PREMBLY_SECRET_KEY=YOUR_ROTATED_SECRET"
npx supabase functions deploy verify-nin
```

The function rate-limits NIN lookups, stores a short-lived verification result server-side, and the auth database trigger consumes it once during account creation. Existing users without a verified NIN are prompted at sign-in and can verify it from Edit Profile; the verified result is attached once to their account. The NIN and consent timestamp are stored in a private, non-API-exposed schema; provider-returned first, middle, and last names are saved to the user's profile. Identity fields are locked in both auth metadata and the profile database. Other profile fields remain editable. The Edge Function disables gateway JWT verification so pre-authentication sign-up can call it; profile verification and attachment validate the user's bearer token within the function.

The audit trail starts when the migration is applied. It records sign-ins/sign-outs and database inserts, updates, and deletes on account, pet/farm, consultation/prescription, chat/community, order/invoice, product, notification, rating, loyalty, and submission tables. Database triggers do not record historical activity, read-only browsing, failed sign-ins, or storage-only access.

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
"# MVS-APP" 
