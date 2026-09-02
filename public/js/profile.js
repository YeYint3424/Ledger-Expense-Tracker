let currentUser = null;

async function loadProfile() {
  currentUser = await fetchCurrentUser();
  if (!currentUser) return;
  document.getElementById("profileName").value = currentUser.name;
  document.getElementById("profileEmail").value = currentUser.email;
}

document.getElementById("profileForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("profileName").value.trim();
  const email = document.getElementById("profileEmail").value.trim();
  if (!name || !email) return;

  try {
    const data = await updateProfile({ name, email });
    currentUser = data.user;
    const nameEl = document.getElementById("currentUserName");
    if (nameEl) nameEl.textContent = currentUser.name;
    showToast("Profile updated");
  } catch (err) {
    showToast(err.message || "Failed to update profile.");
  }
});

document
  .getElementById("passwordForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmNewPassword =
      document.getElementById("confirmNewPassword").value;

    if (!newPassword && !currentPassword) {
      showToast("Enter your current and new password to change it.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast("New passwords do not match.");
      return;
    }

    try {
      await updateProfile({
        name: currentUser.name,
        email: currentUser.email,
        currentPassword,
        newPassword,
      });
      document.getElementById("passwordForm").reset();
      showToast("Password updated");
    } catch (err) {
      showToast(err.message || "Failed to update password.");
    }
  });

async function init() {
  const user = await requireAuthOrRedirect();
  if (!user) return;
  currentUser = user;
  await loadProfile();
}

init();
