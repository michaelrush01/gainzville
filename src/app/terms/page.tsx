import { CONTACT_EMAIL, LegalPage } from "@/components/LegalPage";

export const metadata = { title: "Terms · Gainzville" };

export default function Terms() {
  return (
    <LegalPage label="Terms" title="Terms of use" updated="October 9, 2026">
      <p>By using Gainzville, you agree to these terms.</p>

      <h2>Not medical advice</h2>
      <p>
        Gainzville gives general nutrition information. It isn&apos;t medical advice. Talk to a doctor or registered
        dietitian before changing your diet if you have a health condition, are pregnant, or have a history of disordered
        eating.
      </p>

      <h2>Estimates can be wrong</h2>
      <p>
        Meal photo results are estimates. Prices are rough. Barcode and label data comes from public databases that can
        have mistakes. Check anything that matters to you.
      </p>

      <h2>Fair use</h2>
      <ul>
        <li>The free version has daily limits on scans and coach messages.</li>
        <li>Don&apos;t try to get around the limits, overload the service, or use it to break the law.</li>
        <li>Upload only photos you have the right to share.</li>
      </ul>

      <h2>Campus board</h2>
      <ul>
        <li>Posts look anonymous, but they&apos;re tied to your account. Keep them about food, deals, and cheap protein.</li>
        <li>No names, contact info, or social handles, no harassment or hate, nothing sexual, no selling drugs or alcohol, no spam.</li>
        <li>Posts are screened automatically, hidden at −5 votes or after two reports, and can be removed by us. Breaking the rules can get you banned from the board.</li>
        <li>Deals posted by students aren&apos;t checked by us. Confirm before you go.</li>
      </ul>

      <h2>Your account</h2>
      <p>
        You can delete your account anytime from the Account page. We may suspend accounts that abuse the service.
      </p>

      <h2>No warranty</h2>
      <p>
        Gainzville is a free student project provided as is. It may change, have downtime, or shut down. To the extent the
        law allows, we aren&apos;t liable for losses from using it.
      </p>

      <h2>Contact</h2>
      <p>
        Questions: <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-4">{CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
