/**
 * Runs automatically on every Netlify Forms submission (event name: "submission-created").
 * For the "booking" form it:
 *   1) saves the lead into the CRM's Firestore (customer + job in the "New Lead" stage),
 *   2) emails the owner an alert,
 *   3) emails the customer a confirmation (only if they gave an email address).
 *
 * Required Netlify environment variables (see SETUP-CRM-FIREBASE.md):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY   (service account)
 *   GMAIL_USER, GMAIL_APP_PASSWORD                                      (sending account)
 * Optional: OWNER_EMAIL (defaults to GMAIL_USER), CRM_URL, BUSINESS_PHONE
 */
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const digits = (p) => String(p || "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
const clip = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || "");

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin.firestore();
}

async function saveLead(lead) {
  const db = getDb();
  const now = new Date().toISOString();
  const key = digits(lead.phone);

  // Find an existing customer by phone number (same logic the CRM uses)
  let custId = null;
  let existing = null;
  if (key.length >= 7) {
    const all = await db.collection("customers").get();
    all.forEach((doc) => {
      if (!custId && digits(doc.data().phone) === key) { custId = doc.id; existing = doc.data(); }
    });
  }
  if (!custId) {
    const ref = db.collection("customers").doc();
    custId = ref.id;
    await ref.set({ id: custId, name: lead.name, phone: lead.phone, email: lead.email, vehicles: lead.vehicle ? [lead.vehicle] : [], notes: "", created: now });
  } else {
    const vehicles = existing.vehicles || [];
    if (lead.vehicle && !vehicles.includes(lead.vehicle)) vehicles.push(lead.vehicle);
    const patch = { vehicles };
    if (lead.email && !existing.email) patch.email = lead.email;
    await db.collection("customers").doc(custId).set(patch, { merge: true });
  }

  // Price from the CRM's own price list
  let price = 0;
  try {
    const s = await db.collection("meta").doc("settings").get();
    const pk = ((s.exists && s.data().packages) || []).find((p) => p.name === lead.package);
    if (pk) price = Number(pk.price) || 0;
  } catch (e) { /* price stays 0 */ }

  const jref = db.collection("jobs").doc();
  await jref.set({
    id: jref.id, customerId: custId, vehicle: lead.vehicle, size: lead.size, package: lead.package, addons: [], price,
    stage: "new", date: lead.date, time: "", location: lead.location, notes: lead.message, source: "Website form",
    paid: false, payMethod: "Cash", tip: 0, created: now, updated: now,
  });
  return { custId, jobId: jref.id, price };
}

function ownerEmail(lead, saved, saveError) {
  const crm = process.env.CRM_URL || "https://luxuryelitedetailing1.netlify.app/crm/";
  const rows = [
    ["Name", lead.name], ["Phone", lead.phone], ["Email", lead.email || "(not given)"], ["Vehicle", lead.vehicle], ["Size", lead.size],
    ["Package", lead.package || "Not sure, help me choose"], ["Preferred date", lead.date || "(none)"], ["Location", lead.location || "(none)"], ["Notes", lead.message || "(none)"],
  ];
  const text = `New booking request\n\n${rows.map((r) => r[0] + ": " + r[1]).join("\n")}\n\n` +
    (saveError ? "WARNING: this lead could NOT be saved to the CRM (" + saveError + "). It is still in Netlify Forms.\n" : "Open the CRM: " + crm + "\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#111">
    <h2 style="margin:0 0 4px">New booking request</h2>
    <p style="margin:0 0 16px;color:#555">${esc(lead.name)} · ${esc(lead.vehicle)}</p>
    <table cellpadding="8" style="border-collapse:collapse;width:100%;font-size:14px">${rows.map((r) => `<tr><td style="border-bottom:1px solid #eee;color:#666;width:130px">${esc(r[0])}</td><td style="border-bottom:1px solid #eee"><b>${esc(r[1])}</b></td></tr>`).join("")}</table>
    <p style="margin-top:18px"><a href="tel:${esc(digits(lead.phone))}" style="background:#F196E1;color:#111;padding:10px 18px;border-radius:99px;text-decoration:none;font-weight:bold">Call ${esc(lead.name.split(" ")[0])}</a>
    &nbsp; <a href="${esc(crm)}" style="color:#2a6fb5">Open CRM</a></p>
    ${saveError ? `<p style="color:#b00020"><b>Warning:</b> not saved to the CRM (${esc(saveError)}). It is still in Netlify Forms.</p>` : ""}</div>`;
  return { subject: `New booking request: ${lead.name} (${lead.package || "package TBD"})`, text, html };
}

function customerEmail(lead) {
  const phone = process.env.BUSINESS_PHONE || "(513) 615-9437";
  const first = lead.name.split(/\s+/)[0] || "there";
  const text = `Hi ${first},\n\nThanks for requesting a booking with LED Detailing (Luxury Elite Detailing)! We got your request for your ${lead.vehicle}` +
    `${lead.package ? " (" + lead.package + ")" : ""} and we'll reach out shortly to confirm your quote and a time that works.\n\n` +
    `Need us sooner? Call or text ${phone}.\n\nLED Detailing\nMobile detailing across Cincinnati & Northern Kentucky`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;color:#111;line-height:1.55">
    <h2 style="margin:0 0 12px">Thanks, ${esc(first)}! We got your request.</h2>
    <p>Here's what you sent us:</p>
    <p style="background:#f5f5f5;border-radius:10px;padding:12px 16px">${esc(lead.vehicle)}${lead.package ? "<br>" + esc(lead.package) : ""}${lead.date ? "<br>Preferred date: " + esc(lead.date) : ""}${lead.location ? "<br>Location: " + esc(lead.location) : ""}</p>
    <p>We'll reach out shortly to confirm your quote and a time that works. Need us sooner? Call or text <a href="tel:${esc(digits(phone))}">${esc(phone)}</a>.</p>
    <p style="color:#555">LED Detailing<br>Mobile detailing across Cincinnati &amp; Northern Kentucky</p></div>`;
  return { subject: "We got your booking request — LED Detailing", text, html };
}

exports.handler = async (event) => {
  let payload;
  try { payload = JSON.parse(event.body).payload; } catch (e) { return { statusCode: 400, body: "bad payload" }; }
  if (!payload || payload.form_name !== "booking") return { statusCode: 200, body: "ignored" };

  const d = payload.data || {};
  const lead = {
    name: clip(d.name, 120), phone: clip(d.phone, 40), email: clip(d.email, 160).toLowerCase(), vehicle: clip(d.vehicle, 120), size: clip(d.size, 80),
    package: clip(d.service, 80).replace(/\s*\(\$\d+\)\s*$/, ""), date: /^\d{4}-\d{2}-\d{2}$/.test(d.date || "") ? d.date : "",
    location: clip(d.location, 240), message: clip(d.message, 2000),
  };
  if (!lead.name || !lead.phone) return { statusCode: 200, body: "missing fields" };
  if (!validEmail(lead.email)) lead.email = "";

  // 1) CRM
  let saved = null, saveError = "";
  try { saved = await saveLead(lead); } catch (e) { saveError = e.message || "unknown error"; console.error("CRM save failed:", e); }

  // 2) + 3) Emails (a failure in one never blocks the other)
  const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
  if (user && pass) {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    const from = `"LED Detailing" <${user}>`;
    const owner = process.env.OWNER_EMAIL || user;
    const jobs = [];
    const o = ownerEmail(lead, saved, saveError);
    jobs.push(transporter.sendMail({ from, to: owner, replyTo: lead.email || undefined, subject: o.subject, text: o.text, html: o.html }));
    if (lead.email) {
      const c = customerEmail(lead);
      jobs.push(transporter.sendMail({ from, to: lead.email, replyTo: owner, subject: c.subject, text: c.text, html: c.html }));
    }
    const results = await Promise.allSettled(jobs);
    results.forEach((r, i) => { if (r.status === "rejected") console.error("Email " + (i === 0 ? "to owner" : "to customer") + " failed:", r.reason && r.reason.message); });
  } else {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD not set; skipping emails");
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, saved: !!saved }) };
};
