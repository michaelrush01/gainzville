import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Privacy · Gainzville" };

export default function Privacy() {
  return (
    <LegalPage label="Privacy" title="Privacy policy" updated="October 9, 2026">
      <p>Gainzville is a student project. It collects as little as it can to work.</p>

      <h2>What we collect</h2>
      <ul>
        <li>Your plan: goal, training level, weight, height, age, budget, and the place you pick (a ZIP, a campus, or your location rounded to about 1 km).</li>
        <li>Your food log: what you scanned or added, with its calories, protein, carbs, fat, and cost.</li>
        <li>If you create an account: your email address. With Google sign-in, Google also shares your name and profile picture. We only use the email.</li>
        <li>A daily count of scans and chat messages, so we can keep the free version within its limits.</li>
        <li>Bug reports you file through the coach: your description, your browser and device type, and the last error the app hit.</li>
        <li>Campus board posts, votes, and reports. Posts show as anonymous to everyone else, but are linked to your account on our server so we can enforce the rules.</li>
      </ul>

      <h2>What we don&apos;t collect</h2>
      <ul>
        <li>Photos are analyzed and then discarded. We never save them.</li>
        <li>No continuous location tracking, no ads, no selling or sharing data for marketing.</li>
      </ul>

      <h2>Where it goes</h2>
      <ul>
        <li>Without an account, your plan and log stay in your browser.</li>
        <li>With an account, they&apos;re stored in our database (Supabase), where only you can read your rows.</li>
        <li>Board posts are checked by Anthropic&apos;s Claude API for rule breaks before they go live.</li>
        <li>Photos and coach messages are sent to Anthropic&apos;s Claude API to be analyzed. Your plan and today&apos;s totals go with coach messages so answers fit you.</li>
        <li>Barcodes go to Open Food Facts. Your approximate area goes to OpenStreetMap services to find nearby stores.</li>
        <li>The site is hosted on Vercel.</li>
      </ul>

      <h2>Google user data</h2>
      <p>
        If you sign in with Google, Gainzville receives your email address, name, and profile picture. We use the email
        only to identify your account and sync your data. We don&apos;t use Google data for ads, don&apos;t sell it, and
        don&apos;t share it except with the services above that run the app. Gainzville&apos;s use of information received
        from Google APIs follows the Google API Services User Data Policy, including the Limited Use requirements.
      </p>

      <h2>Deleting your data</h2>
      <p>
        Go to Account and tap &quot;Delete my account&quot;. That removes your account, plan, food log, and board posts and votes. Signing out
        clears the copy in your browser.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">{CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
