// Long-form pages in English (static, trusted HTML).
export default {
  how: {
    title: "From lost to returned",
    lead: "What happens after you report an item, and how matching and verification work.",
    body: `
    <h2 style="margin-top:0">1. Report</h2>
    <p>Choose <strong>I lost something</strong> or <strong>I found something</strong>. Add a name, category, colour, brand, description, the date and the place (pick it on the map). Photos are optional but make photo matching possible. You can also add <strong>private details</strong> — things only the real owner would know. Nobody else sees them.</p>
    <h2>2. Smart matching</h2>
    <p>Every new lost report is compared with active found reports, and the other way round. The score (0–95%) combines:</p>
    <ul>
      <li><strong>Photos</strong> — an AI model (CLIP) turns each photo into a "visual fingerprint" and compares them. It runs on our server; photos are not sent to an outside service.</li>
      <li><strong>Category, colour and brand</strong> — different categories strongly lower the score; similar colours (black/navy) count partly.</li>
      <li><strong>Words</strong> in the name and description, with common synonyms (AirPods ↔ earbuds).</li>
      <li><strong>Place</strong> — distance between the two map points; <strong>date</strong> — found on or after the day it was lost.</li>
    </ul>
    <p>When a pair scores high enough you're notified, and you see the score <em>and the reasons</em>. A suggestion is never treated as confirmed — that's what the next step is for.</p>
    <h2>3. Private verification</h2>
    <p>If you think a found item is yours, send an <strong>ownership request</strong> and describe details that aren't in the public report. The finder compares your answer with their private notes and approves or rejects. If you found something that matches a lost report, send a <strong>finder response</strong> to its owner.</p>
    <p>For <strong>valuable or sensitive items</strong> (marked by the reporter, and all ID documents) an administrator also verifies the request. If several people claim the same item, or a rejection is disputed, administrators review it.</p>
    <h2>4. Hand it back</h2>
    <p>After approval, use the private messages to arrange the handover — in a busy public place or at an official lost &amp; found desk. Either side then confirms the return, and both reports are marked as reunited.</p>
    <p class="row"><a class="btn btn-primary" href="/report/lost" data-link>Report a lost item</a><a class="btn" href="/guide" data-link>Read the user guide</a></p>`,
  },
  privacy: {
    title: "Privacy & data retention",
    lead: "What we show, what we keep private, and how long we keep it.",
    body: `
    <h2 style="margin-top:0">What is public</h2>
    <ul>
      <li>The report itself: item name, category, colour, brand, description, date, place name and photos.</li>
      <li>An <strong>approximate area</strong> on the map: the point is rounded and shifted by up to ~250 m, and shown as a ~300 m circle.</li>
      <li>Your first name and the initial of your last name (or your username).</li>
    </ul>
    <h2>What stays private</h2>
    <ul>
      <li>Your email address and phone number — never shown to other users.</li>
      <li>The exact map point — only you and administrators see it.</li>
      <li>Private verification details on reports, and the answers in return requests — only the people in the request and administrators.</li>
      <li>Private messages — only the two people in the request and administrators.</li>
      <li>Photo metadata (EXIF), including the GPS position where a photo was taken, is removed when photos are uploaded.</li>
    </ul>
    <p>Reports that contain links, phone numbers or email addresses are held for review, so contact details aren't published by accident.</p>
    <h2>Photos and AI</h2>
    <p>Photos are analysed by an AI model that runs on our own server. Photos you use for <em>photo search</em> are processed in memory and are not stored.</p>
    <h2>How long we keep data</h2>
    <ul>
      <li>Active reports with no updates for <strong>6 months</strong> are closed automatically.</li>
      <li>Closed, returned or removed reports and their photos are <strong>deleted after 1 year</strong>.</li>
      <li>Messages in finished requests are deleted <strong>180 days</strong> after the request closed.</li>
      <li>Read notifications are deleted after <strong>90 days</strong>; recorded emails after 30 days.</li>
      <li>The audit log of important actions is kept for <strong>2 years</strong> to investigate misuse.</li>
      <li>You can delete your account at any time in <a href="/dashboard/settings" data-link>Settings</a>. This deletes your reports, photos and messages immediately.</li>
    </ul>
    <h2 id="safety">Safe handovers</h2>
    <ul>
      <li>Meet in a busy public place, or hand the item to an official lost &amp; found desk (reception, security, library desk).</li>
      <li>Never pay to get an item back, and never share passwords or full card numbers as "proof".</li>
      <li>If something feels wrong, use <strong>Report</strong> on the listing or request. Administrators review every report.</li>
    </ul>`,
  },
  guide: {
    title: "User guide",
    lead: "Everything you can do on the platform, step by step.",
    body: `
    <h2 style="margin-top:0">Getting started</h2>
    <ol><li>Create an account with your name, a username, email and password.</li><li>Open your <a href="/dashboard" data-link>dashboard</a> — it shows your reports, matches, requests and notifications.</li><li>Choose your language (العربية, English, Türkçe) from the language button at the top.</li></ol>
    <h2>Reporting an item</h2>
    <ol>
      <li>Click <strong>Report item</strong> and choose lost or found.</li>
      <li>Add up to 6 photos (JPG, PNG or WebP). After the first photo, the AI suggests a category and colour — tap a suggestion to apply it.</li>
      <li>Fill in the name, category, description and date. Brand and colour are optional but improve matching.</li>
      <li>Click on the map to set the place, use <strong>My location</strong>, or search for a place.</li>
      <li>Add private details and tick <strong>Valuable</strong> for expensive or sensitive items.</li>
      <li>Publish. You'll see right away whether possible matches were found.</li>
    </ol>
    <p>Edit, close, reopen or delete a report from its page. When you get your item back, use <strong>I got it back</strong> / <strong>Mark as returned</strong>.</p>
    <h2>Searching</h2>
    <ul>
      <li><strong>Browse</strong>: search words, then filter by type, category, colour, date, place and "with photos". Sort by newest, oldest, relevance or date.</li>
      <li><strong>Photo search</strong>: upload a photo; results are ranked by visual similarity. The AI also guesses the category — tap it to filter.</li>
      <li><strong>Map</strong>: explore approximate areas, filter by type, category and period, and click a pin for a preview.</li>
    </ul>
    <h2>Matches</h2>
    <p>In <a href="/dashboard/matches" data-link>Suggested matches</a> you see each pair with its score and reasons. If you lost the item, answer <strong>This could be mine</strong> to send an ownership request, or <strong>Not mine</strong> to hide it. If you found it, tell the owner whether it looks right.</p>
    <h2>Return requests</h2>
    <ul>
      <li>Statuses: <strong>Pending</strong> → <strong>Under review</strong> → <strong>Approved</strong> → <strong>Returned</strong>, or <strong>Rejected</strong> / <strong>Cancelled</strong>.</li>
      <li>As the finder, compare the answers with your private details, then approve or reject (with a short reason).</li>
      <li>After approval, arrange the handover in messages. Either of you confirms the return.</li>
      <li>If your request was rejected and you think it's wrong, ask an administrator to review it.</li>
    </ul>
    <h2>Notifications</h2>
    <p>The bell shows new matches, requests, messages and status changes. Choose what you get — and whether to also receive emails — in <a href="/dashboard/settings" data-link>Settings</a>.</p>`,
  },
  admin: {
    title: "Administrator guide",
    lead: "Moderation, disputes, users and the audit log.",
    body: `
    <h2 style="margin-top:0">Access</h2>
    <p>Administrators see <strong>Admin dashboard</strong> in the account menu. Give or remove admin rights in <a href="/admin/users" data-link>Users</a>. The platform always keeps at least one administrator.</p>
    <h2>Overview</h2>
    <p>The top row shows what needs attention: reports waiting for review, claims needing an administrator, open user reports and disputed matches. Charts show reports per day and per category; recent activity comes from the audit log.</p>
    <h2>Reports</h2>
    <ul>
      <li>Reports are held for review automatically when they contain links, phone numbers or emails, when an account is suspended, or when several users report them.</li>
      <li>In <a href="/admin/settings" data-link>Settings</a> you can require approval for <em>every</em> new report.</li>
      <li><strong>Approve</strong> publishes a report and runs matching. <strong>Reject/Remove</strong> requires a reason, which is sent to the reporter. <strong>Restore</strong> undoes a removal.</li>
    </ul>
    <h2>Claims</h2>
    <ul>
      <li><strong>Needs attention</strong> lists disputed requests (several claimants, or a disputed rejection) and requests for valuable or sensitive items.</li>
      <li>Open a request to see both sides' private details and messages. You can approve, reject, mark as returned or close a dispute. Messages you send are labelled "Administrator".</li>
      <li>When an item is returned, other open requests for it are closed automatically.</li>
    </ul>
    <h2>Matches</h2>
    <p>Users can report a suggested match as suspicious; it then appears as <strong>Disputed</strong>. Keep it as a suggestion or dismiss it for both users.</p>
    <h2>Users and suspicious activity</h2>
    <ul>
      <li>The users table shows reports, claims, rejected claims and open user reports — many rejected claims is a warning sign.</li>
      <li><strong>Suspend</strong> signs the user out on their next request, blocks sign-in and hides their active reports for review. A note for the audit log is required.</li>
    </ul>
    <h2>User reports</h2>
    <p>Reports about listings, users, requests and matches. Mark them resolved or dismissed after acting.</p>
    <h2>Audit log</h2>
    <p>Every important action is recorded with who did it, when, the target and details: report creation and deletion, status changes, claim decisions, admin decisions, account changes. Entries are kept for 2 years.</p>
    <h2>Email</h2>
    <p>Set <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>SMTP_FROM</code> on the server to send emails. Without them, emails are recorded in the outbox in Settings.</p>`,
  },
};
