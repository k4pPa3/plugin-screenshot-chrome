const form = document.getElementById("verifyForm");
const inputs = document.getElementById("inputs");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const caEl = document.getElementById("caPem");

function clearVerification() {
  statusEl.textContent = "";
  statusEl.className = "";
  resultEl.hidden = true;
  resultEl.replaceChildren();
}

async function readVerificationFile(file, limit = Infinity) {
  if (file.size > limit) throw i18nError("verify.tooLarge", { file: file.name });
  return new Uint8Array(await file.arrayBuffer());
}

function showVerification(check) {
  resultEl.className = check.verification;
  const heading = document.createElement("h2");
  heading.textContent = t(`verify.${check.verification}`);
  const message = document.createElement("p");
  message.textContent = timestampCheckMessage(check);
  const details = document.createElement("dl");
  const row = (key, value, cls = "") => {
    const label = document.createElement("dt");
    label.textContent = t(key);
    const content = document.createElement("dd");
    content.textContent = value;
    content.className = cls;
    details.append(label, content);
  };
  row("verify.file", check.filename);
  row(`verify.binding.${check.binding}`, t("verify.hashMatch"));
  row("verify.fileHash", check.fileHash, "hash");
  row(check.verification === "verified" ? "verify.time" : "verify.claimedTime", check.genTime);
  row("verify.policy", check.policy);
  row("verify.serial", check.serial, "hash");
  row("verify.chain", check.chain.join(" → ") || check.signer || "—");
  resultEl.append(heading, message, details);
  resultEl.hidden = false;
}

form.addEventListener("input", clearVerification);
form.addEventListener("change", clearVerification);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = document.getElementById("evidenceFile").files[0];
  const manifest = document.getElementById("manifestFile").files[0];
  const token = document.getElementById("tokenFile").files[0];
  if (!file || !token) return;
  clearVerification();
  statusEl.textContent = t("verify.running");
  inputs.disabled = true;
  try {
    if (/\.zip$/i.test(file.name)) throw i18nError("verify.extractZip");
    const [fileBytes, manifestBytes, tsr] = await Promise.all([
      readVerificationFile(file),
      manifest ? readVerificationFile(manifest, VERIFY_MAX_MANIFEST) : undefined,
      readVerificationFile(token, TSA_MAX_RESPONSE)
    ]);
    const check = await verifyTimestampFile({ fileBytes, filename: file.name, tsr, manifestBytes, caPem: caEl.value });
    showVerification(check);
    statusEl.textContent = t("verify.done");
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "error";
  } finally {
    inputs.disabled = false;
  }
});

(async () => {
  try {
    const settings = await getSettings();
    setLanguage(settings.language);
    applyI18n();
    document.title = `${t("verify.title")} - Forensic Web Capture`;
    resultEl.setAttribute("aria-label", t("verify.title"));
    caEl.value = settings.tsa.caPem || "";
    inputs.disabled = false;
  } catch (err) {
    statusEl.textContent = err.message;
    statusEl.className = "error";
  }
})();
