(function() {
  const KEY = "kerli-theme";
  const dark = document.getElementById("theme-dark");
  const light = document.getElementById("theme-light");
  const save = () => localStorage.setItem(KEY, light.checked ? "light" : "dark");
  dark.addEventListener("change", save);
  light.addEventListener("change", save);
})();