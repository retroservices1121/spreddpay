const toast = document.getElementById("toast");
const card = document.getElementById("virtual-card");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "card") showToast("Secure card details will appear here in the live product.");
    if (action === "freeze") {
      const frozen = button.textContent.trim() === "Unfreeze";
      button.textContent = frozen ? "Freeze" : "Unfreeze";
      card.style.filter = frozen ? "none" : "grayscale(.72)";
      showToast(frozen ? "Virtual card unfrozen." : "Virtual card frozen.");
    }
    if (action === "wallet") showToast("Digital wallet provisioning is planned for the card beta.");
  });
});

if (card && window.matchMedia("(pointer: fine)").matches) {
  card.addEventListener("mousemove", (event) => {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    card.style.transform = `perspective(900px) rotateY(${x * 7}deg) rotateX(${y * -7}deg)`;
  });
  card.addEventListener("mouseleave", () => {
    card.style.transform = "perspective(900px) rotateY(0) rotateX(0)";
  });
}
