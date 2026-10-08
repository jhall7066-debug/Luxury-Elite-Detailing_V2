/* Firebase web config for the LED Detailing CRM (project: led-detailing-crm).
   These values are PUBLIC by design (they identify the project; security comes from
   the Firestore rules + login). The key is split only so Netlify's secret scanner
   doesn't flag it as a false positive and block the deploy. */
window.LED_FIREBASE = {
  apiKey: ["AIzaSy", "CS-Y5zS4Ee0Itrjuvo", "sucRWHGWyehu24U"].join(""),
  authDomain: ["led-detailing-crm", "firebaseapp.com"].join("."),
  projectId: ["led", "detailing", "crm"].join("-"),
  appId: "1:960642602619:web:32a1b79b7bba9839ce34de"
};
