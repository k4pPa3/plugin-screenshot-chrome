setLanguage("auto");
applyI18n();
document.title = t("updates.bootstrapTitle");
document.getElementById("ready").textContent = t("updates.bootstrapReady", bundledUpdate);
const installButton = document.getElementById("install");
const installStatus = document.getElementById("status");
if (typeof showDirectoryPicker !== "function") {
  installButton.disabled = true;
  installStatus.textContent = t("updates.unsupported");
}
installButton.addEventListener("click", async () => {
  installButton.disabled = true;
  installStatus.className = "";
  installStatus.textContent = t("updates.installing");
  try {
    const directory = await showDirectoryPicker({ id: "fwc-extension", mode: "readwrite" });
    const bytes = base64ToBytes(document.getElementById("package").textContent.trim());
    const archive = await readUpdateArchive(bytes, bundledUpdate);
    const result = await installUpdateFolder(directory, archive);
    installStatus.textContent = t("updates.installedFiles", result);
    installStatus.className = "ok";
    document.getElementById("reload").hidden = false;
  } catch (error) {
    installButton.disabled = false;
    installStatus.className = "error";
    installStatus.textContent = t(error.name === "AbortError" ? "updates.cancelled"
      : error.code?.startsWith("updates.") ? error.code : "updates.installFailed", error.params || {});
  }
});
